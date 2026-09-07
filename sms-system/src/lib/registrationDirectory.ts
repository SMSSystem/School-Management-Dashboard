import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { RegistrationDirectoryEntry } from "@/lib/firebase";

export type DirectoryOption = { id: string } & RegistrationDirectoryEntry;

// Cached for the browser tab's lifetime — a visitor bouncing between the
// login page's Institution dropdown and the /register picker (both call
// this) would otherwise re-fetch and re-sort the whole collection every
// time (STUDENT_REGISTRATION_FORM_CODE_REVIEW_FINDINGS.md #20). Cleared only
// on a full page reload; accepted trade-off, same "cache until reload"
// posture as Item 17's student-roster cache for the same underlying
// collection. Caches the in-flight promise itself (not just the resolved
// value) so two callers racing on first load share one fetch instead of two.
let cachedInstitutions: Promise<DirectoryOption[]> | null = null;

// Shared by the login page's cosmetic Institution dropdown and the /register
// institution picker — both need the same "who's currently accepting
// registrations, sorted by name" list.
export function fetchAcceptingInstitutions(): Promise<DirectoryOption[]> {
  if (!cachedInstitutions) {
    cachedInstitutions = getDocs(query(collection(db, "registration_directory"), where("acceptingRegistrations", "==", true)))
      .then((snap) =>
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as RegistrationDirectoryEntry) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      .catch((err) => {
        // Allow a retry on the next call instead of caching a failure forever.
        cachedInstitutions = null;
        throw err;
      });
  }
  return cachedInstitutions;
}
