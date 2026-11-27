import type { ReactNode } from "react";
import { DoorOpen, UserRound, Users } from "lucide-react";
import { subjectColor } from "@/lib/scheduleDay";
import type { ScheduleSlot, WeekCell } from "@/lib/schedule/weekSchedule";
import { SCHEDULE_TEXT, timeLabel } from "./scheduleLabels";

/** What a card can show: the full slot for staff views, the lighter SlotLite for a student's week. */
export type CardSlot = ScheduleSlot & {
  teacherName?: string;
  className?: string;
  room?: string;
  termName?: string;
};

type Props = {
  cell: WeekCell<CardSlot>;
  /** Start of the lesson ("HH:mm"); its row's start. */
  start: string;
  /** The row's end: the card shows its own end only when it differs (a longer or shorter lesson). */
  rowEnd: string;
  /** A teacher view names the class; a class or student view names the teacher. */
  viewBy: "class" | "teacher" | "student";
  /** Staff see a "Clash" badge on lessons that overlap (D10); students and parents see both lessons, untagged. */
  showClash: boolean;
  /** Name the term or time block, when the week shows lessons from two or more (D17). */
  showTermName: boolean;
  /** Edit and Delete for someone who may change this slot (the page decides). */
  actions?: ReactNode;
};

const BADGE =
  "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white";

/** The card's accessible name: everything it shows, in reading order. */
function lessonLabel(p: Props, who: string | undefined, range: string): string {
  const { slot, now, clash } = p.cell;
  return [
    slot.subjectName,
    range,
    who,
    slot.room,
    p.showTermName ? slot.termName : undefined,
    now ? "on now" : undefined,
    p.showClash && clash ? "clashes with another lesson" : undefined,
  ]
    .filter(Boolean)
    .join(", ");
}

/** The teacher (or class) and the room. */
function LessonMeta({
  who,
  room,
  teacherView,
}: {
  who?: string;
  room?: string;
  teacherView: boolean;
}) {
  if (!who && !room) return null;
  const WhoIcon = teacherView ? Users : UserRound;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs opacity-80">
      {who && (
        <span className="inline-flex items-center gap-1">
          <WhoIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {who}
        </span>
      )}
      {room && (
        <span className="inline-flex items-center gap-1">
          <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
          {room}
        </span>
      )}
    </div>
  );
}

export default function LessonCard(props: Props) {
  const { cell, start, rowEnd, viewBy, showClash, showTermName, actions } =
    props;
  const { slot, end, now, clash } = cell;
  const who = viewBy === "teacher" ? slot.className : slot.teacherName;
  const range = `${timeLabel(start)} – ${timeLabel(end)}`;
  const ring = now
    ? "ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-gray-800"
    : "";

  return (
    <div
      role="group"
      aria-label={lessonLabel(props, who, range)}
      className={`rounded-lg border-l-4 px-3 py-2 text-sm ${subjectColor(slot.subjectName)} ${ring}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold wrap-break-word">
          {slot.subjectName}
        </span>
        <span className="flex shrink-0 gap-1">
          {now && (
            <span className={`${BADGE} bg-emerald-600`}>
              {SCHEDULE_TEXT.onNow}
            </span>
          )}
          {showClash && clash && (
            <span className={`${BADGE} bg-red-600`}>{SCHEDULE_TEXT.clash}</span>
          )}
        </span>
      </div>
      {end !== rowEnd && (
        <div className="mt-0.5 text-xs opacity-80">{range}</div>
      )}
      {showTermName && slot.termName && (
        <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide opacity-70">
          {slot.termName}
        </div>
      )}
      <LessonMeta
        who={who}
        room={slot.room}
        teacherView={viewBy === "teacher"}
      />
      {actions && <div className="mt-2 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
