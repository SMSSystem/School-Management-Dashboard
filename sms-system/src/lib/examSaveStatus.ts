import type { AttemptWriteKind } from "./examAttemptLogic";
import { formatExamClock } from "./examDateTime";

// What the attempt screen says about saving: the state as data, the words
// for it, and what each layout shows of it. "Nothing saved yet" is only noise to a student, so no layout shows it; the
// carousel layout also hides the moment of saving. A save that went wrong says so in its own words, with what happens next.

export type SaveState = {
  kind: "none" | "saving" | "saved" | "offline" | "failed" | "extra_time";
  /** For `saved`: when, in device milliseconds. */
  at?: number;
};

export const NOT_SAVED_TEXT = "Not saved to the server yet";
export const FAILED_TEXT =
  "Couldn't save to the server just now. Your answers are kept on this device and it keeps trying.";
export const OFFLINE_TEXT =
  "Not saved to the server: no connection. Your answers are kept on this device and it keeps trying.";
export const EXTRA_TIME_TEXT = "Your teacher has given you extra time.";

/** The words for a state, as the attempt screen has always shown them. */
export function saveText(state: SaveState): string {
  switch (state.kind) {
    case "saving":
      return "Saving…";
    case "saved":
      return `Saved at ${formatExamClock(state.at ?? Date.now())}`;
    case "offline":
      return OFFLINE_TEXT;
    case "extra_time":
      return EXTRA_TIME_TEXT;
    case "failed":
      return FAILED_TEXT;
    default:
      return NOT_SAVED_TEXT;
  }
}

/** The text to show, or null for nothing: no layout shows "nothing saved yet"; the carousel layout hides "Saving…" too. */
export function visibleSaveText(
  state: SaveState,
  carousel: boolean,
): string | null {
  if (state.kind === "none") return null;
  if (carousel && state.kind === "saving") return null;
  return saveText(state);
}

/** A problem is spoken to assistive technology; the rest stays silent. */
export function saveRole(state: SaveState): "status" | undefined {
  return state.kind === "offline" || state.kind === "failed"
    ? "status"
    : undefined;
}

/** The state after a checkpoint that did not go through. */
export function saveStateOfError(kind: AttemptWriteKind): SaveState {
  return { kind: kind === "offline" ? "offline" : "failed" };
}
