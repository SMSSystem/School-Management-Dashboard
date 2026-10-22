import {
  EXAM_LIMITS,
  isActivityKind,
  isLeaveKind,
  type ExamActKind,
  type ExamActivityEvent,
  type ExamIntegrityPreset,
  type ExamIntegritySummary,
} from '@/types/exams';

// The activity log of an exam attempt (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.3 and §9.4): when the
// student's exam page left the screen, for how long, and a few single acts (copy, print, leaving fullscreen). Pure and
// Firebase-free, so the rules of the log are tested without a browser.
//
// What a browser can tell. The page is "hidden" when the student switches to another tab, window or app, minimizes the
// window or the screen goes off; it is "unfocused" when another window, developer tools or a notification takes the
// focus while the page stays in sight. A new tab that comes to the front and a switch to an existing tab look exactly
// the same, no browser tells where the student went, and a tab opened in the background changes nothing on this page. So
// an entry says the page was LEFT, never that a tab was opened. The log is written by the student's own browser: it is
// evidence for the teacher, not proof, and an empty log proves nothing.
//
// One entry per leave, not a leave and a return. A leave opens when the page goes out of sight or loses focus and closes
// when it is in sight and focused again; its `d` is worked out from a monotonic clock (performance.now), so a changed
// device clock does not change it. While a leave is open a checkpoint saves its time so far (`snapshotEvents`), so a
// student who closes the browser while away still shows "away at least N seconds". The number of leaves counted here is
// exactly the one `trackAway` (examAttemptLogic.ts) counts, which stays as the specification of the count.
//
// At the cap (EXAM_LIMITS.maxActivityEvents) new leaves are still counted but no entry is added, so the exact count in
// `tabSwitches` is never lost. `mergeEvents` renumbers the list, so the caller merges once at resume, before tracking
// starts, and starts from INITIAL_AWAY; it never merges while a leave is open.

/** Where the student is now: in the page, or away because it lost focus or went out of sight. */
export type Presence = 'present' | 'blur' | 'hidden';

export type AwayState = {
  presence: Presence;
  /** performance.now() when the open leave started; null when there is none. */
  startedPerf: number | null;
  /** Index in the events of the open leave's entry; null when none, or when the log was full. */
  index: number | null;
};

export const INITIAL_AWAY: AwayState = { presence: 'present', startedPerf: null, index: null };

/** What the page reports: `document.visibilityState === 'visible'` and `document.hasFocus()`. */
export type Observation = { visible: boolean; focused: boolean };

/** `perfNow` is performance.now(); `secondsSinceStart` is whole seconds since the attempt started, on the server-corrected clock. */
export type Clock = { perfNow: number; secondsSinceStart: number };

type Events = readonly ExamActivityEvent[];

/** The same kind of act within this many seconds is one entry (a key held down fires copy again and again). */
export const ACT_MERGE_SECONDS = 2;

// Proposals, settled with real sittings. The wording of the report is "Review", never a verdict: a phone call, a
// notification or a lost connection looks the same as a leave.
export const EXAM_ACTIVITY_THRESHOLDS = {
  /** Never more than this many leaves is enough for a Review, whatever the length of the exam. */
  minLeaves: 2,
  supervised: { leavesPerHour: 6, awayShare: 0.05 },
  unsupervised: { leavesPerHour: 3, awayShare: 0.02 },
  /** An answer given less than this long after the previous one counts as fast. */
  fastAnswerSeconds: 3,
  /** Fast answers are counted only when at least this many questions have an answer time. */
  fastAnswerMinAnswered: 10,
} as const;

const secondsSince = (clock: Clock, startedPerf: number) => Math.max(0, Math.round((clock.perfNow - startedPerf) / 1000));

/**
 * One observation of the page. Returns the new events, the new state and whether a new leave was counted. The events and
 * the state are never changed in place; the same list is returned when nothing changed.
 *
 * - present, then out of sight: a `hidden` entry opens; present, then in sight but unfocused: a `blur` entry opens;
 * - away, then out of sight while the entry is `blur`: it becomes `hidden`, and stays `hidden` if the page then comes
 *   back into sight without focus (it is the same leave, so nothing is counted again);
 * - away, then in sight and focused: the entry closes with the seconds away.
 */
export function applyObservation(
  events: Events,
  away: AwayState,
  obs: Observation,
  clock: Clock,
): { events: Events; away: AwayState; counted: boolean } {
  const back = obs.visible && obs.focused;

  if (away.presence === 'present') {
    if (back) return { events, away, counted: false };
    const kind = obs.visible ? 'blur' : 'hidden';
    const room = events.length < EXAM_LIMITS.maxActivityEvents;
    return {
      events: room ? [...events, { t: clock.secondsSinceStart, k: kind, d: 0 }] : events,
      away: { presence: kind, startedPerf: clock.perfNow, index: room ? events.length : null },
      counted: true,
    };
  }

  const open = away.index !== null ? events[away.index] : undefined;
  if (back) {
    if (!open || away.startedPerf === null) return { events, away: INITIAL_AWAY, counted: false };
    const next = events.map((e, i) => (i === away.index ? { ...e, d: secondsSince(clock, away.startedPerf as number) } : e));
    return { events: next, away: INITIAL_AWAY, counted: false };
  }

  if (!obs.visible && away.presence === 'blur') {
    const next = open ? events.map((e, i) => (i === away.index ? { ...e, k: 'hidden' as const } : e)) : events;
    return { events: next, away: { ...away, presence: 'hidden' }, counted: false };
  }
  return { events, away, counted: false };
}

/** The events as a checkpoint should save them: an open leave carries its time so far (a lower bound). */
export function snapshotEvents(events: Events, away: AwayState, clock: Clock): Events {
  if (away.presence === 'present' || away.index === null || away.startedPerf === null || !events[away.index]) return events;
  const soFar = secondsSince(clock, away.startedPerf);
  return events.map((e, i) => (i === away.index ? { ...e, d: soFar } : e));
}

/** A single act. The same kind within ACT_MERGE_SECONDS of its last entry is not added again; nothing is added at the cap. */
export function addAct(events: Events, kind: ExamActKind, clock: Clock): Events {
  if (isLeaveKind(kind) || events.length >= EXAM_LIMITS.maxActivityEvents) return events;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].k === kind) {
      if (clock.secondsSinceStart - events[i].t <= ACT_MERGE_SECONDS) return events;
      break;
    }
  }
  return [...events, { t: clock.secondsSinceStart, k: kind }];
}

const wellFormed = (e: unknown): e is ExamActivityEvent =>
  typeof e === 'object' && e !== null && Number.isFinite((e as ExamActivityEvent).t) && typeof (e as ExamActivityEvent).k === 'string';

/**
 * The server's copy and the local backup together: the union by (t, kind), the longer `d` of an entry in both, in time
 * order, at most EXAM_LIMITS.maxActivityEvents (the oldest are kept). The result is never shorter than either list
 * (until the cap), so the log never shrinks. Entries of a kind this version does not know are kept, so a newer client's
 * entries survive being written back; only the summary and the timeline skip them.
 */
export function mergeEvents(server: Events | undefined, local: Events | undefined): ExamActivityEvent[] {
  const byKey = new Map<string, ExamActivityEvent>();
  for (const e of [...(server ?? []), ...(local ?? [])]) {
    if (!wellFormed(e)) continue;
    const key = `${e.t}|${e.k}`;
    const held = byKey.get(key);
    if (!held) byKey.set(key, { ...e });
    else if ((e.d ?? 0) > (held.d ?? 0)) held.d = e.d;
  }
  return [...byKey.values()]
    .sort((a, b) => a.t - b.t || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .slice(0, EXAM_LIMITS.maxActivityEvents);
}

/**
 * At most `limit` entries for the grade: the leaves with the longest time away first (the earlier one on a tie), then
 * acts by time, written out in time order. Entries of an unknown kind are skipped.
 */
export function compactTimeline(events: Events, limit: number = EXAM_LIMITS.maxTimelineEntries): ExamActivityEvent[] {
  const known = events.map((e, order) => ({ e, order })).filter(({ e }) => wellFormed(e) && isActivityKind(e.k));
  const leaves = known.filter(({ e }) => isLeaveKind(e.k)).sort((a, b) => (b.e.d ?? 0) - (a.e.d ?? 0) || a.e.t - b.e.t || a.order - b.order);
  const acts = known.filter(({ e }) => !isLeaveKind(e.k)).sort((a, b) => a.e.t - b.e.t || a.order - b.order);
  return [...leaves, ...acts]
    .slice(0, Math.max(0, limit))
    .sort((a, b) => a.e.t - b.e.t || a.order - b.order)
    .map(({ e }) => ({ ...e }));
}

/**
 * Whether the figures call for a look by the teacher: more leaves than the preset allows an exam of this length, or
 * more time away than its share of the exam. A non-positive duration is judged by the leaves alone.
 */
export function reviewNeeded(leaves: number, awaySeconds: number, durationSeconds: number, preset: ExamIntegrityPreset): boolean {
  const rule = EXAM_ACTIVITY_THRESHOLDS[preset];
  if (durationSeconds <= 0) return leaves > EXAM_ACTIVITY_THRESHOLDS.minLeaves;
  const allowed = Math.max(EXAM_ACTIVITY_THRESHOLDS.minLeaves, rule.leavesPerHour * (durationSeconds / 3600));
  return leaves > allowed || awaySeconds > rule.awayShare * durationSeconds;
}

/** Answers given implausibly fast: consecutive answer times (seconds) less than fastAnswerSeconds apart. Undefined when too few have a time. */
function fastAnswerCount(answeredAt: Readonly<Record<string, number>> | undefined): number | undefined {
  const times = Object.values(answeredAt ?? {})
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (times.length < EXAM_ACTIVITY_THRESHOLDS.fastAnswerMinAnswered) return undefined;
  let fast = 0;
  for (let i = 1; i < times.length; i += 1) if (times[i] - times[i - 1] < EXAM_ACTIVITY_THRESHOLDS.fastAnswerSeconds) fast += 1;
  return fast;
}

/**
 * The figures kept on the grade. `leaves` is the larger of the entries and `tabSwitches` (exact even when the log was
 * full); the time away is the sum of the entries' `d`, so a leave that never closed counts as the time its last
 * checkpoint saw (at least).
 */
export function summarizeActivity(p: {
  events: Events;
  answeredAt?: Readonly<Record<string, number>>;
  tabSwitches?: number;
  durationSeconds: number;
  preset: ExamIntegrityPreset;
}): ExamIntegritySummary {
  const known = p.events.filter((e) => wellFormed(e) && isActivityKind(e.k));
  const leaveEntries = known.filter((e) => isLeaveKind(e.k));
  const awayTimes = leaveEntries.map((e) => Math.max(0, e.d ?? 0));
  const leaves = Math.max(leaveEntries.length, Math.max(0, Math.floor(p.tabSwitches ?? 0)));
  const awaySeconds = awayTimes.reduce((sum, d) => sum + d, 0);
  const fastAnswers = fastAnswerCount(p.answeredAt);
  return {
    leaves,
    hiddenLeaves: leaveEntries.filter((e) => e.k === 'hidden').length,
    awaySeconds,
    longestAwaySeconds: awayTimes.reduce((max, d) => Math.max(max, d), 0),
    acts: known.length - leaveEntries.length,
    ...(fastAnswers !== undefined && { fastAnswers }),
    review: reviewNeeded(leaves, awaySeconds, p.durationSeconds, p.preset),
    timeline: compactTimeline(p.events),
  };
}
