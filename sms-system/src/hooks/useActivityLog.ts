import { useCallback, useEffect, useRef, useState } from "react";
import {
  INITIAL_AWAY,
  addAct,
  applyObservation,
  snapshotEvents,
  type AwayState,
  type Clock,
} from "@/lib/examActivity";
import { fullscreenChange, fullscreenSupported, isFullscreen, type FullscreenDocument } from "@/lib/examFullscreen";
import type { ExamActKind, ExamActivityEvent } from "@/types/exams";

// The activity log of a running attempt (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.3): when the
// student's exam page left the screen and for how long, a few single acts (copy, cut, print, the context menu), and when
// each answer was last changed. The rules of the log are in lib/examActivity.ts; this hook feeds them from the page.
//
// What it can see: the page going out of sight (another tab, window or app, a minimized window, the screen off) and the
// window losing focus. It cannot tell a new tab from a switched tab or see where the student went. It only RECORDS: no
// listener blocks anything. The count it keeps (`tabSwitches`) is the number of leaves, as before.
//
// `onChange` is called whenever something the next checkpoint should carry has changed.
export function useActivityLog(p: {
  /** When the attempt started, in milliseconds on the server's clock. */
  startedAtMs: number;
  /** serverNow - deviceNow, or 0 when it could not be read. */
  offsetMs: number;
  initial: { events: ExamActivityEvent[]; tabSwitches: number; answeredAt: Record<string, number> };
  onChange: () => void;
  /** An unsupervised exam asks for fullscreen: record leaving it (`fs_exit`), and once where the browser has none (`fs_unavailable`). */
  trackFullscreen?: boolean;
}) {
  const { startedAtMs, offsetMs, onChange, trackFullscreen = false } = p;
  const [events, setEvents] = useState<ExamActivityEvent[]>(p.initial.events);
  const [tabSwitches, setTabSwitches] = useState(p.initial.tabSwitches);
  const [answeredAt, setAnsweredAt] = useState<Record<string, number>>(p.initial.answeredAt);
  const eventsRef = useRef<readonly ExamActivityEvent[]>(p.initial.events);
  const answeredRef = useRef<Record<string, number>>(p.initial.answeredAt);
  const away = useRef<AwayState>(INITIAL_AWAY);

  const clock = useCallback(
    (): Clock => ({
      perfNow: performance.now(),
      secondsSinceStart: Math.max(0, Math.round((Date.now() + offsetMs - startedAtMs) / 1000)),
    }),
    [offsetMs, startedAtMs],
  );

  const replaceEvents = useCallback(
    (next: readonly ExamActivityEvent[]) => {
      if (next === eventsRef.current) return;
      eventsRef.current = next;
      setEvents(next as ExamActivityEvent[]);
      onChange();
    },
    [onChange],
  );

  // The page going out of sight or losing focus, and coming back. One leave is counted however many events it fires.
  useEffect(() => {
    const observe = () => {
      const step = applyObservation(
        eventsRef.current,
        away.current,
        { visible: document.visibilityState === "visible", focused: document.hasFocus() },
        clock(),
      );
      away.current = step.away;
      replaceEvents(step.events);
      if (step.counted) {
        setTabSwitches((n) => n + 1);
        onChange();
      }
    };
    document.addEventListener("visibilitychange", observe);
    window.addEventListener("blur", observe);
    window.addEventListener("focus", observe);
    // A student who reloads while away starts a leave at once. A window that is in sight but not focused is not counted
    // until the next event, as before.
    if (document.visibilityState !== "visible") observe();
    return () => {
      document.removeEventListener("visibilitychange", observe);
      window.removeEventListener("blur", observe);
      window.removeEventListener("focus", observe);
    };
  }, [clock, replaceEvents, onChange]);

  // Single acts, recorded and never blocked.
  useEffect(() => {
    const act = (kind: ExamActKind) => () => replaceEvents(addAct(eventsRef.current, kind, clock()));
    const handlers: [string, () => void][] = [
      ["copy", act("copy")],
      ["cut", act("cut")],
      ["beforeprint", act("print")],
      ["contextmenu", act("menu")],
    ];
    for (const [name, handler] of handlers) window.addEventListener(name, handler);
    return () => {
      for (const [name, handler] of handlers) window.removeEventListener(name, handler);
    };
  }, [clock, replaceEvents]);

  // Fullscreen, for an unsupervised exam. Leaving it after being in it is recorded; where the browser has no fullscreen for the
  // page the log says so once (not again after a reload). Nothing here asks for fullscreen or blocks anything.
  useEffect(() => {
    if (!trackFullscreen) return undefined;
    const doc = document as unknown as FullscreenDocument;
    if (!fullscreenSupported(doc)) {
      if (!eventsRef.current.some((e) => e.k === "fs_unavailable")) replaceEvents(addAct(eventsRef.current, "fs_unavailable", clock()));
      return undefined;
    }
    let was = isFullscreen(doc);
    const change = () => {
      const now = isFullscreen(doc);
      const kind = fullscreenChange(was, now);
      was = now;
      if (kind) replaceEvents(addAct(eventsRef.current, kind, clock()));
    };
    document.addEventListener("fullscreenchange", change);
    document.addEventListener("webkitfullscreenchange", change);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      document.removeEventListener("webkitfullscreenchange", change);
    };
  }, [trackFullscreen, clock, replaceEvents]);

  /** Called when an answer is changed: its time since the start. */
  const markAnswered = useCallback(
    (questionId: string) => {
      answeredRef.current = { ...answeredRef.current, [questionId]: clock().secondsSinceStart };
      setAnsweredAt(answeredRef.current);
      onChange();
    },
    [clock, onChange],
  );

  /** What a checkpoint or the submit carries: an open leave shows its time so far. */
  const read = useCallback(
    () => ({ events: snapshotEvents(eventsRef.current, away.current, clock()) as ExamActivityEvent[], answeredAt: answeredRef.current }),
    [clock],
  );

  return { events, tabSwitches, answeredAt, markAnswered, read };
}
