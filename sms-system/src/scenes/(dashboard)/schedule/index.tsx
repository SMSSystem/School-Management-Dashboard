import { useState, useEffect } from "react";
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where, writeBatch,
} from "firebase/firestore";
import { db, TimetableSlotDocument, UserDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { actorName, buildAuditEntry } from "@/lib/auditLog";
import { institutionCollection } from "@/lib/paths";
import { canGenerateSchedule } from "@/lib/permissions";
import FormModal from "@/components/FormModal";
import MobileSchedule from "@/components/schedule/MobileSchedule";
import { MOBILE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useLinkedChildren } from "@/hooks/useLinkedChildren";
import { DATA_MODE, termsData } from "@/lib/data";
import { useCurrentTerm } from "@/lib/CurrentTermContext";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";

type Term = { id: string; name: string };
type Slot = TimetableSlotDocument & { id: string };
type SlotData = Record<string, string | number | readonly string[] | undefined>;
type SeniorTeacher = { id: string; name: string; canGenerateSchedule: boolean; department?: string };
type ToggleFeedback = 'granted' | 'revoked' | 'error';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const SchedulePage = () => {
  const { user, role, institutionId, displayName, classId: myClassId } = useAuth();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const { data: rawTerms } = useInstitutionTerms();
  const terms: Term[] = DATA_MODE === 'live'
    ? (rawTerms ?? [])
    : termsData.map(t => ({ id: String(t.id), name: t.name }));
  // App-wide "current term" (DEV_NOTES Item 6.2) — synced with Gradebook,
  // Attendance Gridsheet, Report Card Comments, and Grade-Entry Tracking.
  const { currentTermId: selectedTermId, setCurrentTermId: setSelectedTermId } = useCurrentTerm();
  const [slots, setSlots]               = useState<Slot[]>([]);
  const [userDoc, setUserDoc]           = useState<UserDocument | null>(null);
  const [seniorTeachers, setSeniorTeachers] = useState<SeniorTeacher[]>([]);
  const [panelOpen, setPanelOpen]       = useState(false);
  const [feedback, setFeedback]         = useState<Record<string, ToggleFeedback>>({});

  const canManage = canGenerateSchedule(role ?? '', userDoc);

  // Students and parents see only their own (or their child's) class's
  // timetable; teachers and admins keep the institution-wide view of the term.
  const { children: linkedChildren, loading: childrenLoading } = useLinkedChildren();
  const [childId, setChildId] = useState('');
  const selectedChild = linkedChildren.find((c) => c.uid === childId) ?? linkedChildren[0];
  const isClassScoped = role === 'student' || role === 'parent';
  const scopeClassId =
    role === 'student' ? myClassId : role === 'parent' ? (selectedChild?.classId ?? null) : null;

  // Fetch terms, user doc, and (for institution_admin) senior teachers
  useEffect(() => {
    if (!institutionId || institutionId === '*' || !user) return;

    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) setUserDoc(snap.data() as UserDocument);
    });

    // Defaulting/validating selectedTermId is CurrentTermContext's job (it
    // picks the institution's active term) — Schedule must not also pick a
    // fallback here, or the two can race and disagree.

    if (DATA_MODE === 'live' && role === 'institution_admin') {
      getDocs(query(
        collection(db, 'users'),
        where('institutionId', '==', institutionId),
        where('role', '==', 'senior_teacher'),
      )).then(snap => {
        setSeniorTeachers(snap.docs.map(d => ({
          id: d.id,
          name: String(d.data().name ?? ''),
          canGenerateSchedule: d.data().canGenerateSchedule === true,
          department: d.data().department as string | undefined,
        })));
      });
    }
  }, [institutionId, user, role]);

  async function handleToggle(teacher: SeniorTeacher) {
    const next = !teacher.canGenerateSchedule;
    try {
      // The change and its audit entry in ONE batch, so a grant or revoke never
      // exists without a record of who made it. The teacher is in the admin's
      // own institution (only an institution_admin sees this toggle).
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', teacher.id), { canGenerateSchedule: next });
      if (user && institutionId && institutionId !== '*') {
        batch.set(
          doc(institutionCollection(institutionId, 'audit_log')),
          buildAuditEntry({
            institutionId,
            eventType: 'permission_change',
            detail: `${next ? 'Granted' : 'Revoked'} schedule-generation access for ${teacher.name}`,
            targetUid: teacher.id,
            targetName: teacher.name,
            performedBy: user.uid,
            performedByName: actorName(displayName, user.email),
          }),
        );
      }
      await batch.commit();
      setSeniorTeachers(prev =>
        prev.map(t => t.id === teacher.id ? { ...t, canGenerateSchedule: next } : t)
      );
      setFeedback(prev => ({ ...prev, [teacher.id]: next ? 'granted' : 'revoked' }));
    } catch {
      setFeedback(prev => ({ ...prev, [teacher.id]: 'error' }));
    }
    setTimeout(
      () => setFeedback(prev => { const n = { ...prev }; delete n[teacher.id]; return n; }),
      3000,
    );
  }

  // Subscribe to timetable slots for the selected term
  useEffect(() => {
    if (!institutionId || !selectedTermId || DATA_MODE !== 'live') return;
    if (isClassScoped && !scopeClassId) return; // no class yet: nothing to show
    const unsub = onSnapshot(
      query(
        institutionCollection(institutionId, 'timetable_slots'),
        where('termId', '==', selectedTermId),
        ...(isClassScoped ? [where('classId', '==', scopeClassId)] : []),
      ),
      snap => setSlots(snap.docs.map(d => ({ id: d.id, ...(d.data() as TimetableSlotDocument) }))),
    );
    return unsub;
  }, [institutionId, selectedTermId, isClassScoped, scopeClassId]);

  // Clear slots when term changes so stale data isn't shown while the new query loads
  useEffect(() => {
    setSlots([]);
  }, [selectedTermId, scopeClassId]);

  const slotsByDay = DAY_ORDER.reduce((acc, day) => {
    acc[day] = slots
      .filter(s => (s.days ?? []).includes(day))
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
    return acc;
  }, {} as Record<string, Slot[]>);

  return (
    <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-md flex-1 m-2 sm:m-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 sm:gap-4 mb-4 sm:mb-6">
        <h1 className="text-lg font-semibold">Schedule</h1>
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          {role === 'parent' && linkedChildren.length > 1 && (
            <select
              aria-label="Child"
              className="w-full sm:w-auto min-h-11 sm:min-h-0 ring-[1.5px] ring-gray-300 dark:ring-gray-600 dark:bg-gray-700 dark:text-white p-2 rounded-md text-base sm:text-sm"
              value={selectedChild?.uid ?? ''}
              onChange={e => setChildId(e.target.value)}
            >
              {linkedChildren.map(c => (
                <option key={c.uid} value={c.uid}>{c.name}</option>
              ))}
            </select>
          )}
          <select
            aria-label="Term"
            className="w-full sm:w-auto min-h-11 sm:min-h-0 ring-[1.5px] ring-gray-300 dark:ring-gray-600 dark:bg-gray-700 dark:text-white p-2 rounded-md text-base sm:text-sm"
            value={selectedTermId}
            onChange={e => setSelectedTermId(e.target.value)}
          >
            <option value="">Select a term</option>
            {terms.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {canManage && <FormModal table="timetable_slot" type="create" />}
        </div>
      </div>

      {/* Manage Access panel — institution_admin only */}
      {role === 'institution_admin' && (
        <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-md">
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-md transition-colors"
            onClick={() => setPanelOpen(o => !o)}
          >
            <span>Delegate Schedule Access</span>
            <span className="text-xs text-gray-400">{panelOpen ? '▲' : '▼'}</span>
          </button>
          {panelOpen && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Grant selected senior teachers the ability to create and edit timetable slots.
              </p>
              {seniorTeachers.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No senior teachers found.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {seniorTeachers.map(t => (
                    <li key={t.id} className="flex items-center justify-between gap-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{t.name}</span>
                        {t.department && (
                          <span className="text-xs text-gray-400">{t.department}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {feedback[t.id] === 'granted' && (
                          <span className="text-xs text-green-500">Access granted</span>
                        )}
                        {feedback[t.id] === 'revoked' && (
                          <span className="text-xs text-gray-400">Access revoked</span>
                        )}
                        {feedback[t.id] === 'error' && (
                          <span className="text-xs text-red-400">Failed to update</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggle(t)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            t.canGenerateSchedule
                              ? 'bg-blue-500'
                              : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                          aria-label={`${t.canGenerateSchedule ? 'Revoke' : 'Grant'} schedule access for ${t.name}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              t.canGenerateSchedule ? 'translate-x-4' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Timetable */}
      {!selectedTermId ? (
        <p className="text-sm text-gray-400 italic">Select a term to view the schedule.</p>
      ) : (
        isClassScoped && !scopeClassId ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {role === 'student'
              ? 'You are not assigned to a class yet, so there is no timetable to show. Contact your teacher.'
              : childrenLoading
                ? 'Loading…'
                : linkedChildren.length === 0
                  ? 'No linked children found on your account.'
                  : `${selectedChild?.name ?? 'Your child'} is not assigned to a class yet.`}
          </p>
        ) : isMobile ? (
          <MobileSchedule
            slots={slots}
            renderActions={
              canManage
                ? (slot) => (
                    <>
                      <FormModal table="timetable_slot" type="update" data={slot as SlotData} />
                      <FormModal table="timetable_slot" type="delete" id={slot.id} />
                    </>
                  )
                : undefined
            }
          />
        ) : (
        <div className="flex flex-col gap-6">
          {DAY_ORDER.map(day => (
            <div key={day}>
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                {DAY_LABELS[day]}
              </h2>
              {slotsByDay[day].length === 0 ? (
                <p className="text-sm text-gray-400 italic">No slots</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {slotsByDay[day].map(slot => (
                    <div
                      key={slot.id}
                      className="bg-lamaSkyLight dark:bg-gray-700 rounded-md p-3 text-sm flex flex-col gap-1 min-w-[180px] max-w-[240px]"
                    >
                      <span className="font-semibold">{slot.subjectName}</span>
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{slot.teacherName}</span>
                      <span className="text-gray-500 dark:text-gray-400 text-xs">
                        {slot.startTime} &middot; {formatDuration(slot.duration)}
                      </span>
                      {slot.room && (
                        <span className="text-gray-400 text-xs">{slot.room}</span>
                      )}
                      {canManage && (
                        <div className="flex items-center gap-2 mt-1">
                          <FormModal
                            table="timetable_slot"
                            type="update"
                            data={slot as SlotData}
                          />
                          <FormModal
                            table="timetable_slot"
                            type="delete"
                            id={slot.id}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        )
      )}
    </div>
  );
};

export default SchedulePage;
