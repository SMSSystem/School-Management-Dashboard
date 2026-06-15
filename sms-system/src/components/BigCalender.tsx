"use client";

import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import {
  collection, getDocs, onSnapshot, query, where,
} from 'firebase/firestore';
import { db, type TimetableSlotDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { USE_MOCK, calendarEvents } from '@/lib/data';

const localizer = momentLocalizer(moment);

type CalEvent = { title: string; start: Date; end: Date };
type DayKey   = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
type ChildOption = { uid: string; name: string; classId: string | null };

const DAY_ORDER: Record<DayKey, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4,
};

function getCurrentWeekDays(): Date[] {
  const today     = new Date();
  const dow       = today.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday    = new Date(
    today.getFullYear(), today.getMonth(), today.getDate() + diffToMon
  );
  return Array.from({ length: 5 }, (_, i) =>
    new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
  );
}

function slotsToEvents(
  slots: (TimetableSlotDocument & { id: string })[],
): CalEvent[] {
  const weekDays = getCurrentWeekDays();
  return slots.flatMap(slot =>
    slot.days.map(day => {
      const base   = weekDays[DAY_ORDER[day as DayKey]];
      const [h, m] = slot.startTime.split(':').map(Number);
      const start  = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
      const end    = new Date(start.getTime() + slot.duration * 60_000);
      return {
        title: slot.room ? `${slot.subjectName} (${slot.room})` : slot.subjectName,
        start,
        end,
      };
    }),
  );
}

function shiftEventsToCurrentWeek(events: CalEvent[]): CalEvent[] {
  if (events.length === 0) return [];
  const anchor     = new Date(2024, 7, 12); // Mon 12 Aug 2024 (anchor of mock data)
  const today      = new Date();
  const dow        = today.getDay();
  const diffToMon  = dow === 0 ? -6 : 1 - dow;
  const currentMon = new Date(
    today.getFullYear(), today.getMonth(), today.getDate() + diffToMon
  );
  const msOffset = currentMon.getTime() - anchor.getTime();
  return events.map(e => ({
    ...e,
    start: new Date(e.start.getTime() + msOffset),
    end:   new Date(e.end.getTime()   + msOffset),
  }));
}

const BigCalendar = ({ teacherIdOverride }: { teacherIdOverride?: string }) => {
  const { user, role, institutionId, classId: authClassId } = useAuth();
  const { activeTerm, loading: calLoading } = useInstitutionAcademicCalendar();

  const [view, setView]     = useState<View>(Views.WORK_WEEK);
  const [events, setEvents] = useState<CalEvent[]>([]);

  const [children, setChildren]               = useState<ChildOption[]>([]);
  const [selectedChild, setSelectedChild]     = useState<ChildOption | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(
    !USE_MOCK && role === 'parent',
  );

  // Fan-out for parent role: load children from student_parents + users
  useEffect(() => {
    if (USE_MOCK || role !== 'parent' || !user) return;
    getDocs(query(
      collection(db, 'student_parents'),
      where('parentId', '==', user.uid),
    )).then(async linkSnap => {
      const studentIds = linkSnap.docs.map(d => d.data().studentId as string);
      if (studentIds.length === 0) { setChildrenLoading(false); return; }
      const snaps = await Promise.all(
        studentIds.map(sid =>
          getDocs(query(collection(db, 'users'), where('__name__', '==', sid)))
        ),
      );
      const opts: ChildOption[] = snaps
        .flatMap(s => s.docs)
        .map(d => ({
          uid:     d.id,
          name:    (d.data().name as string) ?? d.id,
          classId: (d.data().classId as string) ?? null,
        }));
      setChildren(opts);
      setSelectedChild(opts[0] ?? null);
      setChildrenLoading(false);
    }).catch(() => setChildrenLoading(false));
  }, [user, role]);

  // Live slot query — role-aware
  useEffect(() => {
    if (USE_MOCK || !institutionId || calLoading) return;

    const isTeacher        = role === 'regular_teacher' || role === 'senior_teacher';
    const effectiveTeacherId = teacherIdOverride ?? (isTeacher ? user?.uid : null);
    const effectiveClassId   =
      role === 'student' ? authClassId
      : role === 'parent' ? (selectedChild?.classId ?? null)
      : null;

    if (!activeTerm) return;

    let q;
    if (effectiveTeacherId) {
      q = query(
        collection(db, 'timetable_slots'),
        where('institutionId', '==', institutionId),
        where('teacherId',     '==', effectiveTeacherId),
        where('termId',        '==', activeTerm.id),
      );
    } else if (effectiveClassId) {
      q = query(
        collection(db, 'timetable_slots'),
        where('institutionId', '==', institutionId),
        where('classId',       '==', effectiveClassId),
        where('termId',        '==', activeTerm.id),
      );
    } else {
      return;
    }

    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as TimetableSlotDocument),
      }));
      setEvents(slotsToEvents(docs));
    });
  }, [
    institutionId, calLoading, activeTerm,
    role, user, authClassId,
    teacherIdOverride, selectedChild,
  ]);

  const displayEvents = USE_MOCK
    ? shiftEventsToCurrentWeek(calendarEvents as CalEvent[])
    : events;

  return (
    <div className="h-full flex flex-col">
      {/* Child picker — parents with multiple children only */}
      {role === 'parent' && !childrenLoading && children.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {children.map(child => (
            <button
              key={child.uid}
              onClick={() => setSelectedChild(child)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedChild?.uid === child.uid
                  ? 'bg-lamaSky text-sky-900'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}

      <Calendar
        localizer={localizer}
        events={displayEvents}
        startAccessor="start"
        endAccessor="end"
        views={['work_week', 'day']}
        view={view}
        className="flex-1"
        onView={setView}
        min={new Date(2025, 1, 0, 8, 0, 0)}
        max={new Date(2025, 1, 0, 17, 0, 0)}
      />
    </div>
  );
};

export default BigCalendar;
