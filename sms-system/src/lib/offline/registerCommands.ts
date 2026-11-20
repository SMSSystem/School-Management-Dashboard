// What a register save sends through the outbox (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C), and
// how the sender decides, student by student, whether it can still apply. Pure: no Firebase import, so node tests can
// import it.
//
// A command holds only the students the save changed (`changes`), each with the value it was changed from (`base`).
// At send time a student whose server value still equals the base is applied; one whose server value already equals
// the change needs nothing; any other was changed by someone else meanwhile, and goes to a keep-mine or keep-theirs
// choice. `null` means no mark.

import {
  registerPatch,
  sameRecord,
  type RegisterRecord,
} from "@/lib/attendanceRegisters";

export type Mark = RegisterRecord | null;
export type Marks = Record<string, Mark>;
export type RegisterCommand = { changes: Marks; base: Marks };
export type Clash = { mine: Mark; theirs: Mark };

const sameMark = (a: Mark, b: Mark): boolean =>
  a === null || b === null ? a === b : sameRecord(a, b);

/**
 * The register as this person expects the server to have it: the saved register with their own unsent changes laid
 * over it, in the order they were made. A new save is compared with this, not the saved register alone, so changing a
 * queued mark back is sent too.
 */
export function expectedRecords(
  saved: Record<string, RegisterRecord> | undefined,
  pending: RegisterCommand[],
): Record<string, RegisterRecord> {
  const view: Record<string, RegisterRecord> = { ...saved };
  for (const { changes } of pending) {
    for (const [studentId, mark] of Object.entries(changes)) {
      if (mark === null) delete view[studentId];
      else view[studentId] = mark;
    }
  }
  return view;
}

/** The command for a save: what changed from `expected` (see expectedRecords) to `next`, the whole register on screen. */
export function buildRegisterCommand(
  expected: Record<string, RegisterRecord>,
  next: Record<string, RegisterRecord>,
): RegisterCommand {
  const changes: Marks = {};
  const base: Marks = {};
  for (const [studentId, mark] of Object.entries(
    registerPatch(expected, next, null),
  )) {
    changes[studentId] = mark;
    base[studentId] = expected[studentId] ?? null;
  }
  return { changes, base };
}

/** One command from two unsent saves of the same register: the newer change wins, the older base stays. */
export function mergeCommands(
  older: RegisterCommand,
  newer: RegisterCommand,
): RegisterCommand {
  return {
    changes: { ...older.changes, ...newer.changes },
    base: { ...newer.base, ...older.base },
  };
}

/** Sorts a command's students against the server's register at send time. */
export function classify(
  command: RegisterCommand,
  server: Record<string, RegisterRecord> | undefined,
): { apply: Marks; clash: Record<string, Clash> } {
  const apply: Marks = {};
  const clash: Record<string, Clash> = {};
  for (const [studentId, mine] of Object.entries(command.changes)) {
    const theirs = server?.[studentId] ?? null;
    if (sameMark(theirs, mine)) continue;
    if (sameMark(theirs, command.base[studentId] ?? null))
      apply[studentId] = mine;
    else clash[studentId] = { mine, theirs };
  }
  return { apply, clash };
}

/** A clash settled: "mine" sends my mark again over theirs; "theirs" drops it. */
export function resolveClashes(
  clash: Record<string, Clash>,
  keep: Record<string, "mine" | "theirs">,
): RegisterCommand {
  const changes: Marks = {};
  const base: Marks = {};
  for (const [studentId, { mine, theirs }] of Object.entries(clash)) {
    if (keep[studentId] !== "mine") continue;
    changes[studentId] = mine;
    base[studentId] = theirs;
  }
  return { changes, base };
}
