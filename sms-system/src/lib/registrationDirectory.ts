import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { RegistrationDirectoryEntry } from "@/lib/firebase";

export type DirectoryOption = { id: string } & RegistrationDirectoryEntry;

// Shared by the login page's cosmetic Institution dropdown and the /register
// institution picker — both need the same "who's currently accepting
// registrations, sorted by name" list.
export async function fetchAcceptingInstitutions(): Promise<DirectoryOption[]> {
  const snap = await getDocs(query(collection(db, "registration_directory"), where("acceptingRegistrations", "==", true)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as RegistrationDirectoryEntry) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
