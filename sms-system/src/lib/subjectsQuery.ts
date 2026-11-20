import { query, where } from "firebase/firestore";
import { institutionCollection } from "@/lib/paths";
import { queryClient } from "@/lib/queryClient";
import type { Role, SubjectDocument } from "@/lib/firebase";
import { REFERENCE_STALE_MS } from "@/lib/queryPolicies";
import { docsThrough } from "@/lib/offline/workingCopyReads";

// The subjects cache entries and their reads, apart from the hooks (hooks/useInstitutionSubjects.ts) so code that
// AuthContext loads, such as the offline prefetch, can read subjects without an import cycle. Same pattern as
// termsQuery.ts.

export type InstitutionSubject = SubjectDocument & { id: string };

export function subjectsQueryKey(
  institutionId: string,
  role: Role | null,
  uid: string | undefined,
) {
  return role === "regular_teacher" && uid
    ? (["subjects", institutionId, "teacher", uid] as const)
    : (["subjects", institutionId] as const);
}

// With a working copy for staff (named like the cache key), so the subject register still has its subjects offline.
export function fetchSubjects(
  institutionId: string,
  role: Role | null,
  uid: string | undefined,
): Promise<InstitutionSubject[]> {
  const base = institutionCollection(institutionId, "subjects");
  const ref =
    role === "regular_teacher" && uid
      ? query(base, where("teacherIds", "array-contains", uid))
      : base;
  return docsThrough<InstitutionSubject>(
    subjectsQueryKey(institutionId, role, uid).join(":"),
    ref,
  );
}

// For imperative (non-render-bound) consumers — click handlers, one-off
// maintenance-tool IIFEs — that can't call the hook directly but should
// still share its cache entry rather than re-reading independently. Pass
// role: null to force the unfiltered shape regardless of the actual caller
// (matches useAllInstitutionSubjects() below), since the rule permits it.
export function fetchInstitutionSubjects(
  institutionId: string,
  role: Role | null,
  uid: string | undefined,
): Promise<InstitutionSubject[]> {
  return queryClient.fetchQuery({
    queryKey: subjectsQueryKey(institutionId, role, uid),
    queryFn: () => fetchSubjects(institutionId, role, uid),
    staleTime: REFERENCE_STALE_MS,
  });
}
