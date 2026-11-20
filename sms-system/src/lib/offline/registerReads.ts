// The week's saved registers, with a working copy (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice B).
// The General and Subject register pages listen through watchRegisters; the background prefetch (prefetchRegisters.ts)
// reads the same queries once and keeps the same copies, so a register first opened during an outage still loads.

import {
  getDocs,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Query,
  type QuerySnapshot,
} from "firebase/firestore";
import { institutionCollection } from "@/lib/paths";
import type { GeneralAttendanceDocument } from "@/lib/firebase";
import type { SubjectAttendanceDoc } from "@/lib/subjectAttendanceLogic";
import { keepCopy, overlay, storedCopy, type CopyRead } from "./workingCopy";
import { isOfflineError } from "./offlineStart";

export type GeneralRegister = GeneralAttendanceDocument & { id: string };

type Register = { id: string; records?: Record<string, unknown> };

/** One week of a class's general registers. */
export function generalWeek(
  institutionId: string,
  classId: string,
  from: string,
  to: string,
) {
  return {
    name: `generalWeek:${institutionId}:${classId}:${from}`,
    ref: query(
      institutionCollection(institutionId, "generalAttendance"),
      where("classId", "==", classId),
      where("date", ">=", from),
      where("date", "<=", to),
    ),
    docsOf: (snap: QuerySnapshot<DocumentData>): GeneralRegister[] =>
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GeneralRegister),
  };
}

/** One week of a subject's registers for a class. */
export function subjectWeek(
  institutionId: string,
  subjectId: string,
  classId: string,
  from: string,
  to: string,
) {
  return {
    name: `subjectWeek:${institutionId}:${subjectId}:${classId}:${from}`,
    ref: query(
      institutionCollection(institutionId, "subjectAttendance"),
      where("subjectId", "==", subjectId),
      where("classId", "==", classId),
      where("sessionDate", ">=", from),
      where("sessionDate", "<=", to),
    ),
    docsOf: (snap: QuerySnapshot<DocumentData>): SubjectAttendanceDoc[] =>
      snap.docs.map((d) => ({
        id: d.id,
        sessionDate: d.data().sessionDate as string,
        submittedAt: d.data().submittedAt,
        records: d.data().records as SubjectAttendanceDoc["records"],
      })),
  };
}

/**
 * Listens to a week of registers. A server answer is shown and kept; an answer from the cache, or an offline error,
 * is shown over the copy. A real error (such as permission-denied) goes to onError as before.
 */
export function watchRegisters<T extends Register>(
  week: {
    name: string;
    ref: Query<DocumentData>;
    docsOf: (snap: QuerySnapshot<DocumentData>) => T[];
  },
  onRead: (read: CopyRead<T[]>) => void,
  onError: (err: unknown) => void,
): () => void {
  let closed = false;
  // Counts the listener's answers, so a copy still being read when a newer answer arrives is dropped, not shown
  // over it.
  let answers = 0;
  const fromCopy = async (cached: T[] | null, err?: unknown) => {
    const answer = answers;
    const copy = await storedCopy<T[]>(week.name);
    if (closed || answer !== answers) return;
    if (copy)
      onRead({
        value: overlay(copy.value, cached ?? []),
        fromCopy: true,
        savedAt: copy.savedAt,
      });
    else if (cached) onRead({ value: cached, fromCopy: false, savedAt: null });
    else onError(err);
  };
  const unsubscribe = onSnapshot(
    week.ref,
    // metadata changes too, so the copy notice goes as soon as the server answers, even with nothing new
    { includeMetadataChanges: true },
    (snap) => {
      answers += 1;
      const value = week.docsOf(snap);
      if (snap.metadata.fromCache) {
        void fromCopy(value);
        return;
      }
      if (!snap.metadata.hasPendingWrites) keepCopy(week.name, value);
      onRead({ value, fromCopy: false, savedAt: null });
    },
    (err) => {
      answers += 1;
      if (isOfflineError(err, navigator.onLine !== false))
        void fromCopy(null, err);
      else onError(err);
    },
  );
  return () => {
    closed = true;
    unsubscribe();
  };
}

/** Reads a week once and keeps its copy (the background prefetch). Returns whether the server answered. */
export async function keepWeek<T>(week: {
  name: string;
  ref: Query<DocumentData>;
  docsOf: (snap: QuerySnapshot<DocumentData>) => T[];
}): Promise<boolean> {
  const snap = await getDocs(week.ref);
  if (snap.metadata.fromCache) return false;
  keepCopy(week.name, week.docsOf(snap));
  return true;
}
