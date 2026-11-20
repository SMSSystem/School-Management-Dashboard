import { collection, deleteField, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { generalRegisterId, recordsField, registerPatch } from '@/lib/attendanceRegisters';
import { db, type GeneralAttendanceDocument } from '@/lib/firebase';
import { actorName, buildAuditEntry, logAuditEvent, staffFallback } from '@/lib/auditLog';
import { generalAttendanceAllDetail, generalAttendanceDetail } from '@/lib/teacherAudit';
import { institutionCollection, institutionDoc } from '@/lib/paths';
import { byName } from '@/lib/sortByName';
import { rebuildSummariesForClass } from '@/lib/attendanceSummaryUtils';
import type { Role } from '@/types/people';
import type { SavedRegister, Session, StudentRow } from '@/lib/generalAttendanceLogic';
import { readThrough, type CopyRead } from '@/lib/offline/workingCopy';

// The General Attendance Register page's work against Firestore (scenes/(dashboard)/attendance/general):
// the class's students, saving a register with its audit entry, the Save All summary entry and the
// background summary rebuild. The page keeps every piece of screen state and decides what to show.

/**
 * The students whose HOME class is this one, by name. The general register is the home class by design
 * (a student's additional classes are for lessons and subjects), so this asks `classId ==`, not
 * `classIds array-contains`. Staff keep a working copy for offline use (lib/offline/workingCopy.ts).
 */
export function loadClassStudents(institutionId: string | null, classId: string): Promise<CopyRead<StudentRow[]>> {
  return readThrough(`classStudents:${institutionId}:${classId}`, async () => {
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('institutionId', '==', institutionId),
        where('role', '==', 'student'),
        where('classId', '==', classId),
      ),
    );
    const rows: StudentRow[] = snap.docs.map((d) => ({
      uid: d.id,
      name: (d.data().name as string) ?? d.id,
    }));
    rows.sort(byName((s: StudentRow) => s.name));
    return { value: rows, fromCache: snap.metadata.fromCache };
  });
}

type Actor = {
  uid: string;
  email: string | null | undefined;
  displayName: string | null | undefined;
  role: Role | null;
};

/**
 * Writes one session's register: the register and its audit entry in ONE batch, so a register is never
 * saved unrecorded. A Save All passes withAudit=false and logs one summary entry for all its registers
 * afterwards (logSaveAllAudit).
 */
export async function writeRegisterDoc({
  institutionId,
  classId,
  className,
  termId,
  academicYearId,
  dateISO,
  session,
  records,
  existingDoc,
  actor,
  withAudit,
}: {
  institutionId: string;
  classId: string;
  className: string;
  termId: string;
  academicYearId: string;
  dateISO: string;
  session: Session;
  records: GeneralAttendanceDocument['records'];
  existingDoc: SavedRegister | undefined;
  actor: Actor;
  withAudit: boolean;
}): Promise<void> {
  // A register saved before ids came from the register keeps its id until the migration script moves it.
  const docRef = institutionDoc(
    institutionId,
    'generalAttendance',
    existingDoc?.id ?? generalRegisterId(classId, dateISO, session),
  );
  const patch = registerPatch(existingDoc?.records, records, deleteField());

  const batch = writeBatch(db);
  batch.set(
    docRef,
    {
      institutionId,
      classId,
      className,
      termId,
      academicYearId,
      date: dateISO,
      session,
      ...recordsField(patch, !existingDoc),
      submittedBy: actor.uid,
      submittedAt: serverTimestamp(),
      ...(existingDoc ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  if (withAudit && institutionId !== '*') {
    batch.set(
      doc(institutionCollection(institutionId, 'audit_log')),
      buildAuditEntry({
        institutionId,
        eventType: 'attendance_edit',
        detail: generalAttendanceDetail({
          className,
          dateISO,
          session,
          recorded: Object.keys(records).length,
        }),
        targetUid: classId,
        targetName: className,
        performedBy: actor.uid,
        performedByName: actorName(actor.displayName, actor.email, staffFallback(actor.role)),
      }),
    );
  }
  await batch.commit();
}

/**
 * One summary entry for the whole Save All. Best-effort and after the registers (it cannot share their
 * separate batches): a failed log write never turns a successful save into an error.
 */
export async function logSaveAllAudit({
  institutionId,
  classId,
  className,
  sessions,
  actor,
}: {
  institutionId: string;
  classId: string;
  className: string;
  sessions: { dateISO: string; session: Session }[];
  actor: Actor;
}): Promise<void> {
  if (institutionId !== '*') {
    try {
      await logAuditEvent({
        institutionId,
        eventType: 'attendance_edit',
        detail: generalAttendanceAllDetail({ className, sessions }),
        targetUid: classId,
        targetName: className,
        performedBy: actor.uid,
        performedByName: actorName(actor.displayName, actor.email, staffFallback(actor.role)),
      });
    } catch {
      // Best-effort.
    }
  }
}

/** The background summary upsert that follows a save; the caller reports a failure. */
export function rebuildSummaries(params: Parameters<typeof rebuildSummariesForClass>[0]): Promise<unknown> {
  return rebuildSummariesForClass(params);
}
