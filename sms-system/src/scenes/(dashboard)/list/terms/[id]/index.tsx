import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { DATA_MODE } from "@/lib/data";
import { institutionDoc } from "@/lib/paths";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import type { AcademicYearDocument } from "@/lib/firebase";
import {
  DetailBackLink,
  DetailCard,
  DetailFields,
  DetailLoading,
  DetailNotFound,
} from "@/components/detail/DetailParts";
import { REFERENCE_STALE_MS } from '@/lib/queryPolicies';

const LIST_PATH = "/dashboard/list/terms";

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
};

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
}

// Whole days from `start` to `end`, inclusive, so a one-day term is 1 day.
function daysBetween(start: string, end: string): number {
  const ms = new Date(end + "T12:00:00Z").getTime() - new Date(start + "T12:00:00Z").getTime();
  return Math.round(ms / 86_400_000) + 1;
}

// Read-only term detail, opened from the eye button on the Terms list: dates,
// status, and the academic year the term belongs to (when it has one: a term made
// from the Terms form directly, rather than from the Academic Calendar, has none).
const TermDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { institutionId } = useAuth();
  const { data: terms, isLoading } = useInstitutionTerms();
  const term = terms?.find((t) => t.id === id);

  // One read, only for a term that points at an academic year.
  const year = useQuery({
    queryKey: ["academicYear", institutionId, term?.academicYearId],
    enabled:
      DATA_MODE === "live" && !!institutionId && institutionId !== "*" && !!term?.academicYearId,
    staleTime: REFERENCE_STALE_MS,
    queryFn: async () => {
      const snap = await getDoc(institutionDoc(institutionId as string, "academicYears", term!.academicYearId as string));
      return snap.exists() ? (snap.data() as AcademicYearDocument) : null;
    },
  });

  if (isLoading) return <DetailLoading />;
  if (!term) return <DetailNotFound what="Term" backTo={LIST_PATH} backLabel="Back to Terms" />;

  const days = term.startDate && term.endDate ? daysBetween(term.startDate, term.endDate) : null;

  return (
    <div className="p-4 flex flex-col gap-4">
      <DetailBackLink to={LIST_PATH} label="Back to Terms" />

      <DetailCard title={term.name}>
        <DetailFields
          rows={[
            { label: "Status", value: STATUS_LABELS[term.status] ?? term.status },
            { label: "Start date", value: term.startDate ? formatDate(term.startDate) : "" },
            { label: "End date", value: term.endDate ? formatDate(term.endDate) : "" },
            { label: "Length", value: days != null && days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "" },
            { label: "Term number", value: term.termNumber != null ? String(term.termNumber) : "" },
            {
              label: "Academic year",
              value: !term.academicYearId
                ? ""
                : year.isLoading
                  ? "Loading…"
                  : year.data
                    ? `${year.data.name} (${formatDate(year.data.startDate)} – ${formatDate(year.data.endDate)})`
                    : "",
            },
          ]}
        />
      </DetailCard>
    </div>
  );
};

export default TermDetailPage;
