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
import { institutionCollection } from '@/lib/paths';

const localizer = momentLocalizer(moment);

type CalEvent = { title: string; start: Date; end: Date };
type DayKey   = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
type ChildOption = { uid: string; name: string; classId: string | null };

// Index 0 is Sunday (never a valid DayKey — schoolWeekDays/TimetableSlotDocument
// never offer it), kept so this array lines up exactly with getCurrentWeekDays()
// below — both anchor on the same Sunday, matching react-big-calendar's own
// Week view, which defaults to a Sunday-start range (moment's 'en' locale).
// Previously Monday-start here while the library stayed Sunday-start — the
// two silently disagreed on which real dates count as "this week" whenever
// today itself was a Sunday, positioning every event exactly one week off
// from what the calendar was actually displaying. Confirmed live: a Saturday
// slot created "today" (a Sunday) didn't appear because it was placed on
// yesterday's date, one week behind the visible Sun-Sat range.
const DAY_ORDER: Record<DayKey, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function getCurrentWeekDays(): Date[] {
  const today  = new Date();
  const dow    = today.getDay(); // 0 = Sunday ... 6 = Saturday
  const sunday = new Date(
    today.getFullYear(), today.getMonth(), today.getDate() - dow
  );
  return Array.from({ length: 7 }, (_, i) =>
    new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i),
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
  const anchor  = new Date(2024, 7, 11); // Sun 11 Aug 2024 (anchor of mock data, Sunday-start to match getCurrentWeekDays())
  const today   = new Date();
  const dow     = today.getDay();
  const currentSun = new Date(
    today.getFullYear(), today.getMonth(), today.getDate() - dow
  );
  const msOffset = currentSun.getTime() - anchor.getTime();
  return events.map(e => ({
    ...e,
    start: new Date(e.start.getTime() + msOffset),
    end:   new Date(e.end.getTime()   + msOffset),
  }));
}

// `controlledChild` is the parent dashboard's way of owning the child selection
// (it shows a mini calendar for the same child): undefined = this component loads
// the children and shows its own picker (unchanged behaviour); a value or null =
// the caller already chose, so no children are read here and no picker is shown.
const BigCalendar = ({
  teacherIdOverride,
  controlledChild,
}: {
  teacherIdOverride?: string;
  controlledChild?: ChildOption | null;
}) => {
  const { user, role, institutionId, classId: authClassId } = useAuth();
  const { activeTerm, activeTimeBlocks, loading: calLoading } = useInstitutionAcademicCalendar();

  // react-big-calendar's built-in work_week view hard-excludes Saturday
  // (and Sunday), which would silently hide the Mon-Sat slots this
  // component now needs to render. Week is the library's public,
  // fully-supported Sun-Sat alternative — Sunday shows as an always-empty
  // column since schoolWeekDays never offers it as a session-day choice
  // anywhere in the app — see
  // BIG_CALENDAR_CUSTOM_MODE_AND_WEEKEND_SCHEDULING_REMEDIATION_PLAN.md §3.3
  // for why a custom Mon-Sat view wasn't built instead.
  const [view, setView]     = useState<View>(Views.WEEK);
  const [events, setEvents] = useState<CalEvent[]>([]);

  const [children, setChildren]               = useState<ChildOption[]>([]);
  const [selectedChild, setSelectedChild]     = useState<ChildOption | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(
    !USE_MOCK && role === 'parent' && controlledChild === undefined,
  );
  const activeChild = controlledChild !== undefined ? controlledChild : selectedChild;

  // Fan-out for parent role: load children from student_parents + users
  useEffect(() => {
    if (USE_MOCK || role !== 'parent' || !user || controlledChild !== undefined) return;
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
  }, [user, role, controlledChild]);

  // Live slot query — role-aware
  useEffect(() => {
    if (USE_MOCK || !institutionId || calLoading) return;

    const isTeacher        = role === 'regular_teacher' || role === 'senior_teacher';
    const effectiveTeacherId = teacherIdOverride ?? (isTeacher ? user?.uid : null);
    const effectiveClassId   =
      role === 'student' ? authClassId
      : role === 'parent' ? (activeChild?.classId ?? null)
      : null;

    // termIds covers both modes without branching on calendarMode:
    // activeTimeBlocks is [] for academic-mode institutions and activeTerm
    // is null for custom-mode ones (mutually exclusive by construction —
    // CUSTOM_CALENDAR_MODE_SPEC.md §3.1), so this collapses to the old
    // single-term query for academic mode with no behavior change there.
    // Merging every currently-active block (rather than picking just one,
    // the way a Time Block selector would) matches this component's role
    // as a passive "my schedule" view — see
    // BIG_CALENDAR_CUSTOM_MODE_AND_WEEKEND_SCHEDULING_REMEDIATION_PLAN.md §3.1.
    const termIds = activeTimeBlocks.length > 0
      ? activeTimeBlocks.map(b => b.term.id)
      : activeTerm ? [activeTerm.id] : [];

    if (termIds.length === 0) return;

    let q;
    if (effectiveTeacherId) {
      q = query(
        institutionCollection(institutionId, 'timetable_slots'),
        where('teacherId',     '==', effectiveTeacherId),
        where('termId',        'in', termIds),
      );
    } else if (effectiveClassId) {
      q = query(
        institutionCollection(institutionId, 'timetable_slots'),
        where('classId',       '==', effectiveClassId),
        where('termId',        'in', termIds),
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
    institutionId, calLoading, activeTerm, activeTimeBlocks,
    role, user, authClassId,
    teacherIdOverride, activeChild,
  ]);

  const displayEvents = USE_MOCK
    ? shiftEventsToCurrentWeek(calendarEvents as CalEvent[])
    : events;

  return (
    <div className="h-full flex flex-col">
      {/* Child picker — parents with multiple children only */}
      {role === 'parent' && controlledChild === undefined && !childrenLoading && children.length > 1 && (
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
        views={['week', 'day']}
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
