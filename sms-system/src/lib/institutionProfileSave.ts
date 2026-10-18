import { doc, getDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { profileUpdate, type WizardData } from '@/lib/institutionProfileLogic';

// Every read and write of the institution profile page (scenes/(dashboard)/institution-profile): the saved
// institution document, the calendar-mode choice, and saving the finished profile. The page keeps the
// messages that follow a failure; the reads and writes are moved as they were.

/** The institution document's data, or null when there is none. */
export async function fetchInstitutionDoc(institutionId: string): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(db, 'institutions', institutionId));
  return snap.exists() ? snap.data() : null;
}

/** The one-time calendar-mode choice, written at once so a refresh mid-wizard cannot lose it. */
export async function setCalendarMode(institutionId: string, mode: 'academic_year' | 'custom'): Promise<void> {
  await updateDoc(doc(db, 'institutions', institutionId), { calendarMode: mode });
}

export async function saveInstitutionProfile({
  institutionId,
  uid,
  currentName,
  data,
}: {
  institutionId: string;
  uid: string | null;
  currentName: string | undefined;
  data: WizardData;
}): Promise<void> {
  // The public login/register directory keeps its own copy of the name, so a
  // changed name is written to both documents in one batch (a failure on the
  // second alone would leave the login dropdown showing the old name). Only an
  // entry that already exists is updated; creating one is the registration
  // toggle's job.
  const directoryRef = doc(db, 'registration_directory', institutionId);
  const nameChanged = data.name !== currentName;
  const directorySnap = nameChanged ? await getDoc(directoryRef) : null;
  const batch = writeBatch(db);
  if (directorySnap?.exists()) {
    batch.update(directoryRef, {
      name: data.name,
      updatedAt: serverTimestamp(),
      updatedBy: uid ?? null,
    });
  }
  batch.update(doc(db, 'institutions', institutionId), profileUpdate(data));
  await batch.commit();
}
