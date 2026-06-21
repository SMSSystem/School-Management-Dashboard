import { useState, useEffect } from "react";
import {
  collection, doc, getDocs, onSnapshot, orderBy, query, updateDoc, where,
} from "firebase/firestore";
import { db, TimetableSlotDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import FormModal from "@/components/FormModal";
import { DATA_MODE, termsData } from "@/lib/data";

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
  const { user, role, institutionId } = useAuth();
  const [terms, setTerms]               = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>('');
  const [slots, setSlots]               = useState<Slot[]>([]);
  const [seniorTeachers, setSeniorTeachers] = useState<SeniorTeacher[]>([]);
  const [panelOpen, setPanelOpen]       = useState(false);
  const [feedback, setFeedback]         = useState<Record<string, ToggleFeedback>>({});

  // Fetch terms and (for institution_admin) senior teachers
  useEffect(() => {
    if (!institutionId || !user) return;

    if (DATA_MODE === 'live') {
      getDocs(query(
        collection(db, 'terms'),
        where('institutionId', '==', institutionId),
        orderBy('startDate', 'desc'),
      )).then(snap => {
        const loaded: Term[] = snap.docs.map(d => ({ id: d.id, name: String(d.data().name ?? '') }));
        setTerms(loaded);
        if (loaded.length > 0) setSelectedTermId(loaded[0].id);
      });

      if (role === 'institution_admin') {
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
    } else {
      const mockTerms: Term[] = termsData.map(t => ({ id: String(t.id), name: t.name }));
      setTerms(mockTerms);
      if (mockTerms.length > 0) setSelectedTermId(mockTerms[0].id);
    }
  }, [institutionId, user, role]);

  async function handleToggle(teacher: SeniorTeacher) {
    const next = !teacher.canGenerateSchedule;
    try {
      await updateDoc(doc(db, 'users', teacher.id), { canGenerateSchedule: next });
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
    const unsub = onSnapshot(
      query(
        collection(db, 'timetable_slots'),
        where('institutionId', '==', institutionId),
        where('termId', '==', selectedTermId),
      ),
      snap => setSlots(snap.docs.map(d => ({ id: d.id, ...(d.data() as TimetableSlotDocument) }))),
    );
    return unsub;
  }, [institutionId, selectedTermId]);

  // Clear slots when term changes so stale data isn't shown while the new query loads
  useEffect(() => {
    setSlots([]);
  }, [selectedTermId]);

  const slotsByDay = DAY_ORDER.reduce((acc, day) => {
    acc[day] = slots
      .filter((s) => s.schedule ? day in s.schedule : (s.days ?? []).includes(day))
      .sort((a, b) => {
        const aTime = a.schedule?.[day]?.startTime ?? a.startTime ?? '';
        const bTime = b.schedule?.[day]?.startTime ?? b.startTime ?? '';
        return aTime.localeCompare(bTime);
      });
    return acc;
  }, {} as Record<string, Slot[]>);

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <h1 className="text-lg font-semibold">Schedule</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            className="ring-[1.5px] ring-gray-300 dark:ring-gray-600 dark:bg-gray-700 dark:text-white p-2 rounded-md text-sm"
            value={selectedTermId}
            onChange={e => setSelectedTermId(e.target.value)}
          >
            <option value="">Select a term</option>
            {terms.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
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
                        {(() => {
                          const d = slot.schedule?.[day];
                          if (d) return `${d.startTime} · ${formatDuration(d.duration)}`;
                          if (slot.startTime) return `${slot.startTime} · ${formatDuration(slot.duration ?? 0)}`;
                          return '';
                        })()}
                      </span>
                      {slot.room && (
                        <span className="text-gray-400 text-xs">{slot.room}</span>
                      )}
                      {(role === 'institution_admin' || role === 'super_admin') && (
                        <div className="flex items-center gap-2 mt-1">
                          <FormModal
                            table="lesson"
                            type="update"
                            data={slot as SlotData}
                          />
                          <FormModal
                            table="lesson"
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
      )}
    </div>
  );
};

export default SchedulePage;
