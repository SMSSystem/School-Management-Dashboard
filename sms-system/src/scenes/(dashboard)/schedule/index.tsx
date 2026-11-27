// The Schedule page (docs/miscellaneous-specs/SCHEDULE_PAGE_REDESIGN_SPEC.md): one week of a class's, a teacher's
// or a student's timetable laid on real dates, as a week grid or a day agenda. The TIMETABLE is the recurring
// pattern (timetable_slots); the SCHEDULE is that pattern on dates (D1). The week decides the term (D5), so there is
// no Term picker and this page never changes the app-wide current term.
//
// "Add slot" and the Edit and Delete buttons on a card are the interim editor until the Lessons feature (BACKLOG).

import FormModal from "@/components/FormModal";
import type { FormRecord } from "@/components/formRegistry";
import {
  addDays,
  type WeekCell,
  type WeekRow,
} from "@/lib/schedule/weekSchedule";
import DelegateAccessPanel from "./DelegateAccessPanel";
import LessonCard, { type CardSlot } from "./LessonCard";
import ScheduleChildChips from "./ScheduleChildChips";
import ScheduleDayChips from "./ScheduleDayChips";
import ScheduleDayList from "./ScheduleDayList";
import ScheduleToolbar from "./ScheduleToolbar";
import ScheduleWeekGrid from "./ScheduleWeekGrid";
import {
  SCHEDULE_TEXT,
  clashCountLabel,
  lessonCountLabel,
} from "./scheduleLabels";
import {
  datesWithClasses,
  edgeNoteFor,
  emptyState,
  emptyWeekMessage,
  viewTitle,
} from "./schedulePageView";
import { useSchedulePage } from "./useSchedulePage";

type Page = ReturnType<typeof useSchedulePage>;

const STAFF = new Set([
  "institution_admin",
  "spectator",
  "senior_teacher",
  "regular_teacher",
]);

/** Edit and Delete on a card, for someone who may change that slot. */
function SlotActions({ slot, touch }: { slot: CardSlot; touch: boolean }) {
  return (
    <>
      <FormModal
        table="timetable_slot"
        type="update"
        data={slot as unknown as FormRecord}
        touch={touch}
      />
      <FormModal
        table="timetable_slot"
        type="delete"
        id={slot.id}
        touch={touch}
      />
    </>
  );
}

/** The week's counts under the timetable. */
function WeekFooter({ page, staff }: { page: Page; staff: boolean }) {
  const { week } = page;
  return (
    <div className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
      <p>{lessonCountLabel(week.lessonCount)}</p>
      {staff && week.clashes > 0 && (
        <p className="text-red-600 dark:text-red-400">
          {clashCountLabel(week.clashes)}
        </p>
      )}
      {page.isPhone && <p>{SCHEDULE_TEXT.turnSideways}</p>}
    </div>
  );
}

/** The week grid or the day agenda, then the week's counts. */
function ScheduleBody({ page, title }: { page: Page; title?: string }) {
  const { state, setState, week, calendar } = page;
  const staff = STAFF.has(page.role ?? "");
  const selectedDay =
    week.days.find((d) => d.date === state.day) ?? week.days[0];

  const renderCard = (cell: WeekCell<CardSlot>, row: WeekRow) => (
    <LessonCard
      key={cell.slot.id}
      cell={cell}
      start={row.start}
      rowEnd={row.end}
      viewBy={state.of?.by ?? "class"}
      showClash={staff}
      showTermName={week.showTermNames}
      actions={
        page.canEditSlot(cell.slot) ? (
          <SlotActions slot={cell.slot} touch={page.isPhone} />
        ) : undefined
      }
    />
  );

  let main;
  if (state.view === "day" && selectedDay) {
    main = (
      <>
        <ScheduleDayChips
          days={week.days}
          selected={selectedDay.date}
          withClasses={datesWithClasses(week)}
          mode={calendar.mode}
          onSelect={(day) => setState({ ...state, day })}
        />
        <ScheduleDayList
          week={week}
          day={selectedDay}
          mode={calendar.mode}
          renderCard={renderCard}
        />
      </>
    );
  } else if (week.lessonCount === 0) {
    main = (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {emptyWeekMessage(week, calendar.mode)}
      </p>
    );
  } else {
    main = (
      <ScheduleWeekGrid
        week={week}
        mode={calendar.mode}
        caption={`${title ?? SCHEDULE_TEXT.heading}, week of ${page.rangeLabel}`}
        renderCard={renderCard}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {main}
      <WeekFooter page={page} staff={staff} />
    </div>
  );
}

const SchedulePage = () => {
  const page = useSchedulePage();
  const { role, calendar, choices, state, setState, week } = page;
  const childName = page.selectedChild?.name;
  const title = viewTitle(state.of, choices, role, childName);
  // A new week opens on today when it holds today, else its first school day (lib/schedule/scheduleUrl.ts).
  const go = (weekStart: string) => setState({ ...state, weekStart, day: "" });
  const empty = emptyState({
    role,
    of: state.of,
    childrenLoading: page.childrenLoading,
    childCount: page.linkedChildren.length,
    childName,
    bounds: calendar.bounds,
    mode: calendar.mode,
    loading: page.loading,
    error: page.error,
  });

  return (
    <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-md flex-1 m-2 sm:m-4 flex flex-col gap-4 min-w-0">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold">{SCHEDULE_TEXT.heading}</h1>
          {title && (
            <h2 className="text-sm text-gray-600 dark:text-gray-300">
              {title}
            </h2>
          )}
        </div>
        {page.mayEdit && (
          <FormModal
            table="timetable_slot"
            type="create"
            triggerLabel="Add slot"
          />
        )}
      </div>

      {role === "institution_admin" && <DelegateAccessPanel />}

      {role === "parent" &&
        page.linkedChildren.length > 1 &&
        page.selectedChild && (
          <ScheduleChildChips
            linked={page.linkedChildren}
            selected={page.selectedChild.uid}
            onSelect={page.chooseChild}
          />
        )}

      {calendar.bounds && state.of && (
        <ScheduleToolbar
          rangeLabel={page.rangeLabel}
          atStart={week.atStart}
          atEnd={week.atEnd}
          edgeNote={edgeNoteFor(week, calendar.bounds)}
          onPrev={() => go(addDays(state.weekStart, -7))}
          onNext={() => go(addDays(state.weekStart, 7))}
          onToday={
            state.weekStart === page.openingWeek
              ? null
              : () => go(page.openingWeek)
          }
          view={state.view}
          canPickView={!page.isPhone}
          onView={(view) => setState({ ...state, view })}
          choices={choices}
          of={state.of}
          onChoose={(of) => setState({ ...state, of })}
        />
      )}

      {empty ? (
        <p
          className={`text-sm ${empty.tone === "error" ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}
        >
          {empty.text}
        </p>
      ) : (
        <ScheduleBody page={page} title={title} />
      )}
    </div>
  );
};

export default SchedulePage;
