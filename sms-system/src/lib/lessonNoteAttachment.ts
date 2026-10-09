import { getDoc } from 'firebase/firestore';
import { institutionSubdoc } from './paths';
import type { LessonNoteAttachmentDocument } from './firebase';
import { getBlobDataUrl } from './blobStore';

// Fetches a note's file on demand (LESSON_NOTES_FEATURE_SPEC.md §6) and hands
// it to the browser as a download. One getDoc() against the single
// attachment/data sub-document — nothing is read until the user asks.
//
// Deliberately NOT a React Query hook: queryClient.ts persists query results
// to sessionStorage (~5MB), and a base64 payload of up to ~700KB would blow
// that quota after a handful of opens.
export async function downloadLessonNoteAttachment(
  institutionId: string,
  lessonNoteId: string,
): Promise<void> {
  const snap = await getDoc(
    institutionSubdoc(institutionId, 'lessonNotes', lessonNoteId, 'attachment', 'data'),
  );
  if (!snap.exists()) throw new Error('This note’s file is no longer available.');
  const file = snap.data() as LessonNoteAttachmentDocument;

  // A file over ~500KB is in the Realtime Database; fetch it only now, on demand.
  const dataUrl = file.blobKey ? await getBlobDataUrl(institutionId, file.blobKey) : file.dataUrl;
  if (!dataUrl) throw new Error('This note’s file is no longer available.');

  const blob = await (await fetch(dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // The download keeps its own reference; revoke once the click has dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
