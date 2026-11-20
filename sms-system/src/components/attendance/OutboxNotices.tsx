import { useState } from "react";
import DialogShell from "@/components/DialogShell";
import {
  ATTENDANCE_STATE_LABELS,
  type AttendanceState,
} from "@/lib/attendanceStates";
import type { OutboxItem } from "@/lib/offline/outboxStore";
import { discardItem, resolveConflict } from "@/lib/offline/outboxActions";
import type { Mark } from "@/lib/offline/registerCommands";
import { clashLabel } from "@/lib/offline/copyLabels";

// What a register page shows for its outbox items that need the person (docs/miscellaneous-specs/
// OFFLINE_ATTENDANCE_SPEC.md, slice C): a register where someone else changed the same students meanwhile, with a
// keep-mine or keep-theirs choice per student, and a register the server refused, which can be discarded (the marks
// stay in the page's draft, so nothing typed is lost).

const markLabel = (mark: Mark) =>
  mark
    ? (ATTENDANCE_STATE_LABELS[mark.state as AttendanceState] ?? mark.state)
    : "No mark";

function ConflictDialog({
  item,
  label,
  nameOf,
  onClose,
}: {
  item: OutboxItem;
  label: string;
  nameOf: (studentId: string) => string;
  onClose: () => void;
}) {
  const clash = item.payload.clash ?? {};
  const [keep, setKeep] = useState<Record<string, "mine" | "theirs">>({});
  const [busy, setBusy] = useState(false);
  const ids = Object.keys(clash);
  const all = (choice: "mine" | "theirs") =>
    setKeep(Object.fromEntries(ids.map((id) => [id, choice])));

  async function apply() {
    setBusy(true);
    await resolveConflict(item, keep);
    onClose();
  }

  return (
    <DialogShell
      title={`Choose marks for ${label}`}
      onClose={onClose}
      busy={busy}
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Someone else changed these students after you marked them. Choose which
        mark to keep for each.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => all("mine")}
          className="rounded-md border px-2 py-1 text-xs"
        >
          Keep all mine
        </button>
        <button
          type="button"
          onClick={() => all("theirs")}
          className="rounded-md border px-2 py-1 text-xs"
        >
          Keep all theirs
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {ids.map((id) => (
          <li
            key={id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span className="font-medium">{nameOf(id)}</span>
            <span className="flex gap-2">
              {(["mine", "theirs"] as const).map((side) => (
                <label key={side} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name={`keep-${id}`}
                    checked={keep[id] === side}
                    onChange={() => setKeep((k) => ({ ...k, [id]: side }))}
                  />
                  {side === "mine" ? "Mine" : "Theirs"}:{" "}
                  {markLabel(clash[id][side])}
                </label>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy || ids.some((id) => !keep[id])}
        onClick={() => void apply()}
        className="self-end rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        Save choices
      </button>
    </DialogShell>
  );
}

/** Notices for this page's registers that wait for a choice or were refused. */
export function OutboxNotices({
  problems,
  prefix,
  labelOf,
  nameOf,
}: {
  problems: OutboxItem[];
  /** Only items whose register key starts with this belong to the register on screen. */
  prefix: string;
  labelOf: (item: OutboxItem) => string;
  nameOf: (studentId: string) => string;
}) {
  const [open, setOpen] = useState<OutboxItem | null>(null);
  const mine = problems.filter((item) =>
    item.payload.targetKey.startsWith(prefix),
  );
  if (mine.length === 0) return null;
  return (
    <div className="mb-3 flex flex-col gap-2">
      {mine.map((item) => (
        <div
          key={item.opId}
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {item.state === "conflict" ? (
            <>
              <span>
                {labelOf(item)}:{" "}
                {clashLabel(Object.keys(item.payload.clash ?? {}).length)}
              </span>
              <button
                type="button"
                onClick={() => setOpen(item)}
                className="font-semibold underline"
              >
                Choose marks
              </button>
            </>
          ) : (
            <>
              <span>
                {labelOf(item)} wasn't sent. {item.payload.refusedReason}
              </span>
              <button
                type="button"
                onClick={() => void discardItem(item)}
                className="font-semibold underline"
              >
                Discard
              </button>
            </>
          )}
        </div>
      ))}
      {open && (
        <ConflictDialog
          item={open}
          label={labelOf(open)}
          nameOf={nameOf}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
