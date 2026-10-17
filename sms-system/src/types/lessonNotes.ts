// Lesson notes and their attachments.
// Part of what src/lib/firebase.ts re-exports, so `import { X } from '@/lib/firebase'` keeps working.
// Keep this file free of imports from firebase.ts: it holds shapes, not the Firebase app.

import type { Timestamp } from 'firebase/firestore';

export type LessonNoteLink = { url: string; label?: string };

// institutions/{institutionId}/lessonNotes/{lessonNoteId} —
// LESSON_NOTES_FEATURE_SPEC.md §4.1. The file payload lives in the
// attachment sub-document below, never here, so the list query doesn't pull
// every note's base64 just to render a table row.
// One file of a lesson note, as listed on the note itself (the body is in
// lessonNotes/{id}/attachment/{id}, read only on download).
export type LessonNoteFile = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number; // bytes, pre-base64
};

export type LessonNoteDocument = {
  institutionId: string;
  name: string;

  // Both optional and independent. Absent (not null) when unset — students
  // and parents only see notes where classId is set.
  classId?: string;
  className?: string;
  subjectId?: string;
  subjectName?: string;

  teacherId: string; // always request.auth.uid at creation
  teacherName: string;
  // Denormalized at write time, mirrors AssignmentDocument — read by the
  // narrow senior_teacher visibility rule.
  teacherRole: 'regular_teacher' | 'senior_teacher' | 'institution_admin';
  departmentId?: string;

  hasAttachment: boolean;
  // Several files per note: each file's metadata (for lists and the view modal)
  // and the ids of its attachment/{id} documents. Both present or both absent.
  // A note saved before this has only the single-file fields below.
  attachments?: LessonNoteFile[];
  attachmentIds?: string[];
  // Legacy single-file fields, no longer written; kept readable until the
  // migration script (scripts/migrate-lesson-note-files.mjs) has run.
  attachmentFileName?: string;
  attachmentMimeType?: string;
  attachmentSize?: number; // bytes, pre-base64

  resourceLinks: LessonNoteLink[]; // empty array, never undefined

  createdBy: string;
  createdByRole: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

// institutions/{institutionId}/lessonNotes/{lessonNoteId}/attachment/data —
// single fixed-ID document, fetched with one getDoc() only on open/download.
export type LessonNoteAttachmentDocument = {
  // Exactly one of dataUrl (inline, up to ~500KB) or blobKey (a file in the
  // Realtime Database, up to 5MB; see src/lib/blobStore.ts).
  dataUrl?: string;
  blobKey?: string;
  fileName: string;
  mimeType: string;
  size: number;
};
