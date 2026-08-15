import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { EnrollmentRegistrationDocument, RegistrationGuardian, RegistrationStatus, Timestamp } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { computePossibleDuplicates } from "@/lib/registrationDuplicates";
import Table from "@/components/Table";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE } from "@/lib/utils";
import ConvertToAccountsPanel from "./ConvertToAccountsPanel";

type Registration = EnrollmentRegistrationDocument & { id: string };

const STATUS_FILTERS: Array<RegistrationStatus | "all"> = ["all", "pending", "reviewed", "converted", "rejected"];

const STATUS_BADGE_CLS: Record<RegistrationStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  reviewed: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  converted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const columns = [
  { header: "Student", accessor: "student" },
  { header: "Requested Class", accessor: "requestedClass", className: "hidden md:table-cell" },
  { header: "Date of Birth", accessor: "dob", className: "hidden md:table-cell" },
  { header: "Academic Year", accessor: "academicYearName", className: "hidden md:table-cell" },
  { header: "Status", accessor: "status" },
  { header: "Submitted", accessor: "submittedAt", className: "hidden md:table-cell" },
];

function formatDate(iso: string) {
  return iso
    ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "—";
}

// submittedAt is a Firestore Timestamp on real documents (serverTimestamp()
// at write time) but typed Timestamp | string to allow a plain ISO string in
// tests/mocks. String(Timestamp) renders as "Timestamp(seconds=…,
// nanoseconds=…)", not a date — so both display and sort need to go through
// an actual Date conversion rather than stringifying the raw value.
function toDate(value: Timestamp | string): Date {
  return typeof value === "string" ? new Date(value) : value.toDate();
}

function formatSubmittedAt(value: Timestamp | string): string {
  return toDate(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

async function logAudit(
  institutionId: string,
  registrationId: string,
  studentName: string,
  previousStatus: string,
  newStatus: string,
  performedBy: string,
  performedByName: string,
) {
  await addDoc(institutionCollection(institutionId, "audit_log"), {
    eventType: "registration_status_change",
    detail: `Status changed from "${previousStatus}" to "${newStatus}"`,
    targetUid: registrationId,
    targetName: studentName,
    performedBy,
    performedByName,
    timestamp: new Date().toISOString(),
    institutionId,
  });
}

function GuardianDetail({ label, guardian }: { label: string; guardian: RegistrationGuardian }) {
  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
      <h3 className="text-sm font-semibold mb-2">{label}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500">Name</dt>
        <dd>
          {guardian.firstName} {guardian.lastName}
        </dd>
        <dt className="text-gray-500">Contact</dt>
        <dd>{guardian.contact}</dd>
        <dt className="text-gray-500">Email</dt>
        <dd>{guardian.email}</dd>
        <dt className="text-gray-500">Address</dt>
        <dd>{guardian.address}</dd>
        {guardian.occupation && (
          <>
            <dt className="text-gray-500">Occupation</dt>
            <dd>{guardian.occupation}</dd>
          </>
        )}
        {guardian.work && (
          <>
            <dt className="text-gray-500">Employer</dt>
            <dd>{guardian.work}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export default function RegistrationReviewPage() {
  const { user, displayName, institutionId } = useAuth();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<RegistrationStatus | "all">("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Registration | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    const unsub = onSnapshot(institutionCollection(institutionId, "enrollmentRegistrations"), (snap) => {
      setRegistrations(snap.docs.map((d) => ({ id: d.id, ...(d.data() as EnrollmentRegistrationDocument) })));
      setLoading(false);
    });
    return unsub;
  }, [institutionId]);

  // Duplicate-detection pass: admin-side only (see spec's Duplicate Detection
  // correction, and STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md Phase 9).
  // Runs once per fresh registrations snapshot, using getDocs (not
  // onSnapshot) against students, to avoid a write-triggers-read-triggers-
  // write loop.
  useEffect(() => {
    if (!institutionId || institutionId === "*" || registrations.length === 0) return;
    let cancelled = false;
    getDocs(query(collection(db, "users"), where("institutionId", "==", institutionId), where("role", "==", "student"))).then(
      (snap) => {
        if (cancelled) return;
        const existingStudents = snap.docs.map((d) => ({
          firstName: (d.data().firstName as string) ?? "",
          lastName: (d.data().lastName as string) ?? "",
          dateOfBirth: (d.data().dateOfBirth as string) ?? "",
        }));
        const updates = computePossibleDuplicates(registrations, existingStudents);
        updates.forEach(({ id, possibleDuplicate }) => {
          updateDoc(institutionDoc(institutionId, "enrollmentRegistrations", id), { possibleDuplicate }).catch(() => {});
        });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId, registrations.length]);

  const years = useMemo(
    () => Array.from(new Set(registrations.map((r) => r.academicYearName))).sort(),
    [registrations],
  );

  const filtered = useMemo(() => {
    let data = registrations;
    if (statusFilter !== "all") data = data.filter((r) => r.status === statusFilter);
    if (yearFilter !== "all") data = data.filter((r) => r.academicYearName === yearFilter);
    return [...data].sort((a, b) => toDate(b.submittedAt).getTime() - toDate(a.submittedAt).getTime());
  }, [registrations, statusFilter, yearFilter]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const transition = async (reg: Registration, newStatus: RegistrationStatus) => {
    if (!institutionId || institutionId === "*" || !user) return;
    await updateDoc(institutionDoc(institutionId, "enrollmentRegistrations", reg.id), {
      status: newStatus,
      reviewedAt: serverTimestamp(),
      reviewedBy: user.uid,
    });
    await logAudit(
      institutionId,
      reg.id,
      `${reg.student.firstName} ${reg.student.lastName}`,
      reg.status,
      newStatus,
      user.uid,
      displayName ?? "",
    );
    setSelected(null);
  };

  const renderRow = (item: Registration) => (
    <tr
      key={item.id}
      onClick={() => setSelected(item)}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800 cursor-pointer"
    >
      <td className="flex items-center gap-2 p-4">
        {item.student.firstName} {item.student.lastName}
        {item.possibleDuplicate && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            possible duplicate
          </span>
        )}
      </td>
      <td className="hidden md:table-cell">{item.student.requestedClass}</td>
      <td className="hidden md:table-cell">{formatDate(item.student.dateOfBirth)}</td>
      <td className="hidden md:table-cell">{item.academicYearName}</td>
      <td>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLS[item.status]}`}>
          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </span>
      </td>
      <td className="hidden md:table-cell">{formatSubmittedAt(item.submittedAt)}</td>
    </tr>
  );

  if (institutionId === "*") {
    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
        <h1 className="text-lg font-semibold mb-4">Registrations</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Select an institution to view registrations.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="hidden md:block text-lg font-semibold">Registrations</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                statusFilter === s
                  ? "bg-sky-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        {years.length > 1 && (
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      <Table columns={columns} renderRow={renderRow} data={paginated} loading={loading} />
      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-lg flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">
              {selected.student.firstName} {selected.student.lastName}
            </h2>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Requested Class</dt>
              <dd>{selected.student.requestedClass}</dd>
              <dt className="text-gray-500">Date of Birth</dt>
              <dd>{formatDate(selected.student.dateOfBirth)}</dd>
              <dt className="text-gray-500">Gender</dt>
              <dd>{selected.student.gender}</dd>
              <dt className="text-gray-500">Academic Year</dt>
              <dd>{selected.academicYearName}</dd>
            </dl>

            {selected.mother && <GuardianDetail label="Mother" guardian={selected.mother} />}
            {selected.father && <GuardianDetail label="Father" guardian={selected.father} />}

            <div className="flex flex-wrap gap-2 justify-end pt-3 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
              >
                Close
              </button>
              {selected.status === "pending" && (
                <button
                  onClick={() => transition(selected, "reviewed")}
                  className="px-4 py-2 rounded-md bg-sky-600 text-white text-sm"
                >
                  Mark reviewed
                </button>
              )}
              {selected.status !== "converted" && selected.status !== "rejected" && (
                <button
                  onClick={() => setConvertOpen(true)}
                  className="px-4 py-2 rounded-md bg-green-600 text-white text-sm"
                >
                  Convert to accounts
                </button>
              )}
              {selected.status !== "rejected" && selected.status !== "converted" && (
                <button
                  onClick={() => transition(selected, "rejected")}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm"
                >
                  Reject
                </button>
              )}
              {selected.status === "rejected" && (
                <button
                  onClick={() => transition(selected, "reviewed")}
                  className="px-4 py-2 rounded-md bg-sky-600 text-white text-sm"
                >
                  Un-reject
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {convertOpen && selected && institutionId && institutionId !== "*" && (
        <ConvertToAccountsPanel
          registration={selected}
          institutionId={institutionId}
          onClose={() => setConvertOpen(false)}
          onConverted={() => {
            setConvertOpen(false);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
