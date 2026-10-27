import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadAttemptPack } from "@/lib/examAttemptSession";
import { isImageDataUrl, packOrder, pictureState, withRetries, type PackImages, type PictureState } from "@/lib/examPictureLoad";
import { reportError } from "@/lib/reportError";
import type { ExamQuestion, ExamQuestionImage } from "@/types/exams";

const PACK_READ_TRIES = 3;
const PACK_READ_PAUSE_MS = 1500;

// A student's pictures (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §6.2): after the questions are on screen the packs are read in
// the background, one at a time, the pack of the question being looked at first. The pictures stay in memory for the
// sitting. A pack that did not come after three tries is marked failed and the rest go on; Try again reads it once more.
// Nothing here holds the timer or the answers, and an exam without pictures reads nothing.
export function useExamPictures(p: {
  institutionId: string | null | undefined;
  examId: string;
  questions: readonly Pick<ExamQuestion, "image">[];
  current: number;
}) {
  const { institutionId, examId, questions, current } = p;
  const [loaded, setLoaded] = useState<Record<number, PackImages>>({});
  const [failed, setFailed] = useState<number[]>([]);
  const [tick, setTick] = useState(0);
  const order = useMemo(() => packOrder(questions, current), [questions, current]);
  // `done` holds the packs that were read or gave up; the loop picks the first pack of the latest order that is not in it.
  const run = useRef({ order, done: new Set<number>(), running: false, alive: true });
  run.current.order = order;

  useEffect(() => {
    const s = run.current;
    s.alive = true;
    return () => {
      s.alive = false;
    };
  }, []);

  useEffect(() => {
    const s = run.current;
    if (s.running || !institutionId) return;
    s.running = true;
    void (async () => {
      try {
        for (;;) {
          const n = s.order.find((pack) => !s.done.has(pack));
          if (n === undefined || !s.alive) break;
          s.done.add(n);
          try {
            const images = await withRetries(() => loadAttemptPack(institutionId, examId, n), PACK_READ_TRIES, PACK_READ_PAUSE_MS);
            if (s.alive) setLoaded((l) => ({ ...l, [n]: images }));
          } catch (err) {
            reportError(err, { what: "a question picture", quiet: true });
            if (s.alive) setFailed((f) => (f.includes(n) ? f : [...f, n]));
          }
        }
      } finally {
        s.running = false;
      }
    })();
  }, [order, institutionId, examId, tick]);

  const stateOf = useCallback((image: ExamQuestionImage): PictureState => pictureState(image, loaded, failed), [loaded, failed]);
  const srcOf = useCallback(
    (image: ExamQuestionImage): string | undefined => {
      const data = loaded[image.pack]?.[image.id]?.data;
      return isImageDataUrl(data) ? data : undefined;
    },
    [loaded],
  );
  const retry = useCallback((pack: number) => {
    run.current.done.delete(pack);
    setFailed((f) => f.filter((n) => n !== pack));
    setTick((t) => t + 1);
  }, []);

  return { stateOf, srcOf, retry };
}

export type ExamPictures = ReturnType<typeof useExamPictures>;
