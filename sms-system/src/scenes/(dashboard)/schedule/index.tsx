import { useState, useEffect } from "react";
import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where,
} from "firebase/firestore";
import { db, TimetableSlotDocument, UserDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { canGenerateSchedule } from "@/lib/permissions";
import FormModal from "@/components/FormModal";
import { DATA_MODE, termsData } from "@/lib/data";

type Term = { id: string; name: string };
type Slot = TimetableSlotDocument & { id: string };
type SlotData = Record<string, string | number | readonly string[] | undefined>;

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday',
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
  const [userDoc, setUserDoc]           = useState<UserDocument | null>(null);

  const canManage = canGenerateSchedule(role ?? '', userDoc);

  // Fetch terms for term selector + user doc for permission check
  useEffect(() => {
    if (!institutionId || !user) return;

    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) setUserDoc(snap.data() as UserDocument);
    });

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
    } else {
      const mockTerms: Term[] = termsData.map(t => ({ id: String(t.id), name: t.name }));
      setTerms(mockTerms);
      if (mockTerms.length > 0) setSelectedTermId(mockTerms[0].id);
    }
  }, [institutionId, user]);

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
      .filter(s => s.days.includes(day))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    return acc;
  }, {} as Record<string, Slot[]>);

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4 mt-0">
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
          {canManage && <FormModal table="timetable_slot" type="create" />}
        </div>
      </div>

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
      )}
    </div>
  );
};

export default SchedulePage;
