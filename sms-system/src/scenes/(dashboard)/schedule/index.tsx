// The Schedule page (docs/miscellaneous-specs/SCHEDULE_PAGE_REDESIGN_SPEC.md): one week of a class's, a teacher's
// or a student's timetable laid on real dates, as a week grid or a day agenda. The TIMETABLE is the recurring
// pattern (timetable_slots); the SCHEDULE is that pattern on dates (D1). The week decides the term (D5), so there is
// no Term picker and this page never changes the app-wide current term.
//
// "Add slot" and the Edit and Delete buttons on a card are the interim editor until the Lessons feature (BACKLOG).

import { useNextStep } from "nextstepjs";
import FormModal from "@/components/FormModal";
import type { FormRecord } from "@/components/formRegistry";
import { useSidebar } from "@/lib/SidebarContext";
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

  // The tour's timetable step points at the TOP of the timetable (the day chips, the grid's header row or the
  // nothing-scheduled line), never the whole of it: a full week is taller than the screen, and the tour would place
  // its card above the target, off the screen.
  let main;
  if (state.view === "day" && selectedDay) {
    main = (
      <>
        <div id="tour-schedule-timetable">
          <ScheduleDayChips
            days={week.days}
            selected={selectedDay.date}
            withClasses={datesWithClasses(week)}
            mode={calendar.mode}
            onSelect={(day) => setState({ ...state, day })}
          />
        </div>
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
      <p
        id="tour-schedule-timetable"
        className="text-sm text-gray-500 dark:text-gray-400"
      >
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
        headId="tour-schedule-timetable"
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

/** "Take a tour": the page tour (lib/scheduleTourSteps.ts), started only by this button, never by itself. */
function TourButton() {
  const { startNextStep } = useNextStep();
  const { collapseForTour } = useSidebar();
  return (
    <button
      type="button"
      onClick={() => {
        collapseForTour();
        startNextStep("schedule");
      }}
      className="min-h-11 md:min-h-9 rounded-md border border-gray-300 px-3 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
    >
      Take a tour
    </button>
  );
}

/** The heading (Schedule and whose week), "Take a tour" once the timetable is drawn, and Add slot for editors. */
function ScheduleHeader({
  title,
  showTour,
  mayEdit,
}: {
  title?: string;
  showTour: boolean;
  mayEdit: boolean;
}) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div id="tour-schedule-heading">
        <h1 className="text-lg font-semibold">{SCHEDULE_TEXT.heading}</h1>
        {title && (
          <h2 className="text-sm text-gray-600 dark:text-gray-300">{title}</h2>
        )}
      </div>
      <div className="flex items-center gap-3">
        {/* The tour spotlights only what is on the page, so it is offered only once the timetable is drawn. */}
        {showTour && <TourButton />}
        {mayEdit && (
          <span id="tour-schedule-add">
            <FormModal
              table="timetable_slot"
              type="create"
              triggerLabel="Add slot"
            />
          </span>
        )}
      </div>
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
    peopleLoading: page.peopleLoading,
    error: page.error,
  });

  return (
    <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-md flex-1 m-2 sm:m-4 flex flex-col gap-4 min-w-0">
      <ScheduleHeader title={title} showTour={!empty} mayEdit={page.mayEdit} />

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
