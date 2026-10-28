import type { AttemptWriteKind } from './examAttemptLogic';
import { formatExamClock } from './examDateTime';

// What the attempt screen says about saving: the state as data, the words
// for it, and what the carousel layout shows of it. A computer shows every state in words as before; the carousel layout
// hides the two that are only noise (nothing saved yet, and the moment of saving) and keeps the ones a student needs.

export type SaveState = {
  kind: 'none' | 'saving' | 'saved' | 'offline' | 'failed' | 'extra_time';
  /** For `saved`: when, in device milliseconds. */
  at?: number;
};

export const NOT_SAVED_TEXT = 'Not saved to the server yet';
export const OFFLINE_TEXT = 'Not saved to the server: no connection. Your answers are kept on this device and it keeps trying.';
export const EXTRA_TIME_TEXT = 'Your teacher has given you extra time.';

/** The words for a state, as the attempt screen has always shown them. */
export function saveText(state: SaveState): string {
  switch (state.kind) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return `Saved at ${formatExamClock(state.at ?? Date.now())}`;
    case 'offline':
      return OFFLINE_TEXT;
    case 'extra_time':
      return EXTRA_TIME_TEXT;
    default:
      return NOT_SAVED_TEXT;
  }
}

/** The text to show, or null for nothing: the carousel layout hides "nothing saved yet" and "Saving…". */
export function visibleSaveText(state: SaveState, carousel: boolean): string | null {
  if (carousel && (state.kind === 'none' || state.kind === 'saving')) return null;
  return saveText(state);
}

/** A problem is spoken to assistive technology; the rest stays silent. */
export function saveRole(state: SaveState): 'status' | undefined {
  return state.kind === 'offline' || state.kind === 'failed' ? 'status' : undefined;
}

/** The state after a checkpoint that did not go through. */
export function saveStateOfError(kind: AttemptWriteKind): SaveState {
  return { kind: kind === 'offline' ? 'offline' : 'failed' };
}
