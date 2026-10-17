import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { onLoadError } from "@/lib/reportError";
import { fetchInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { fetchInstitutionDepartments } from "@/hooks/useInstitutionDepartments";
import type { ClassDocument } from "@/types/institution";
import type { Role } from "@/types/people";

// The lists the Create Account form (AdminCreateUserForm.tsx) fills its dropdowns from: the classes and
// departments of the institution picked in the form, the institutions a super admin can choose from,
// and an institution admin's own institution name.
export function useCreateUserOptions({
  role,
  callerInstitutionId,
  institutionIdValue,
}: {
  /** The signed-in admin's role. */
  role: Role | null;
  /** The signed-in admin's own institution. */
  callerInstitutionId: string | null;
  /** The institution picked in the form. */
  institutionIdValue: string;
}) {
  const [classes, setClasses] = useState<(ClassDocument & { id: string })[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [institutionName, setInstitutionName] = useState("");

  // Keyed by the form's selected institution, not the acting admin's own
  // (super_admin can create users in any institution) — useInstitutionClasses()
  // is tied to useAuth().institutionId, so it doesn't fit here; the imperative
  // fetchInstitutionClasses() shares the same cache under the correct key
  // without that assumption (Phase 3a, FIRESTORE_READ_CACHING_SPEC.md §5.1).
  useEffect(() => {
    if (!institutionIdValue) {
      setClasses([]);
      return;
    }
    let cancelled = false;
    fetchInstitutionClasses(institutionIdValue)
      .then((data) => {
        if (!cancelled) setClasses(data);
      })
      .catch(() => {
        if (!cancelled) setClasses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [institutionIdValue]);

  // Keyed by the form's selected institution, not the acting admin's own —
  // same reasoning as the classes fetch above (Phase 3a,
  // FIRESTORE_READ_CACHING_SPEC.md §5.1).
  useEffect(() => {
    if (!institutionIdValue) {
      setDepartments([]);
      return;
    }
    let cancelled = false;
    fetchInstitutionDepartments(institutionIdValue)
      .then((data) => {
        if (!cancelled) setDepartments(data);
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [institutionIdValue]);

  useEffect(() => {
    if (role !== "super_admin") return;
    getDocs(collection(db, "institutions")).then((snap) => {
      setInstitutions(
        snap.docs.map((d) => ({
          id: d.id,
          name: (d.data().name as string) ?? d.id,
        })),
      );
    }, onLoadError("institutions"));
  }, [role]);

  useEffect(() => {
    if (role !== "institution_admin" || !callerInstitutionId) return;
    getDoc(doc(db, "institutions", callerInstitutionId)).then((snap) => {
      setInstitutionName(
        snap.exists()
          ? ((snap.data().name as string) ?? callerInstitutionId)
          : callerInstitutionId,
      );
    }, onLoadError("your institution"));
  }, [role, callerInstitutionId]);

  return { classes, departments, institutions, institutionName };
}
