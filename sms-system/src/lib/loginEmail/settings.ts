import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parseEmailSettings, type InstitutionEmailSettings } from "@/lib/loginEmail/emailSettings";

// institutions/{id}/email_settings/config: the institution's own EmailJS ids.
// Created by hand in the Firebase console for now (there is no settings form);
// read by that institution's admins only (firestore.rules). The public key,
// service id and template id are not secrets but are visible in an admin's
// browser traffic. INSTITUTION_LOGIN_EMAILS_SPEC.md §3.

export type { InstitutionEmailSettings } from "@/lib/loginEmail/emailSettings";

const cache = new Map<string, Promise<InstitutionEmailSettings | null>>();

/** One cached read per institution per page load. Null = not set up, switched off, or unreadable. */
export function loadEmailSettings(institutionId: string): Promise<InstitutionEmailSettings | null> {
  let p = cache.get(institutionId);
  if (!p) {
    p = getDoc(doc(db, "institutions", institutionId, "email_settings", "config"))
      .then((snap) => (snap.exists() ? parseEmailSettings(snap.data()) : null))
      .catch(() => {
        cache.delete(institutionId);
        return null;
      });
    cache.set(institutionId, p);
  }
  return p;
}
