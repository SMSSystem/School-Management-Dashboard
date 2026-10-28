import { useEffect, useRef, useState } from "react";
import { boxFromDrag, boxFromPercent, boxToPercent, wholePage, type PercentBox, type PixelBox } from "@/lib/pdfSnapshotBox";
import { questionLabel } from "@/lib/examImportReview";
import type { OpenedPdf } from "@/lib/examPdfSnapshot";
import { PRIMARY_BUTTON_CLS, SECONDARY_BUTTON_CLS } from "./builderStyles";

const SMALL_BTN =
  "w-fit rounded-md px-2 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-sky-300 dark:ring-sky-700 dark:hover:bg-sky-900/20";
const FIELD_CLS =
  "w-20 rounded-md p-1.5 text-xs ring-[1.5px] ring-gray-300 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-600 disabled:opacity-40";
const FIELDS: { key: keyof PercentBox; label: string }[] = [
  { key: "left", label: "Left (%)" },
  { key: "top", label: "Top (%)" },
  { key: "width", label: "Width (%)" },
  { key: "height", label: "Height (%)" },
];

// The snapshot tool of the PDF import (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.2): a figure drawn with shapes is not a picture the
// file holds, so the page is drawn here and the teacher drags a box around the figure; the box becomes a PNG that goes
// through the same picture check and review as a picture found in the file. The box can also be set with the number
// fields (percentages of the page), which is the way without a pointer. pdf.js is loaded only when this opens.
export default function PdfSnapshot({
  bytes,
  questions,
  onAdd,
  onCancel,
}: {
  bytes: Uint8Array;
  questions: readonly { text: string }[];
  onAdd: (png: Uint8Array, questionIndex: number) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [problem, setProblem] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [box, setBox] = useState<PixelBox | null>(null);
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null);
  const [question, setQuestion] = useState<number | "">("");
  const [adding, setAdding] = useState(false);
  const pdf = useRef<OpenedPdf | null>(null);
  const source = useRef<HTMLCanvasElement | null>(null);
  const shown = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  // Opens the file once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { openPdf } = await import("@/lib/examPdfSnapshot");
        const opened = await openPdf(bytes);
        if (!alive) {
          void opened.close();
          return;
        }
        pdf.current = opened;
        setPageCount(opened.pageCount);
        setStatus("ready");
      } catch {
        if (alive) {
          setStatus("error");
          setProblem("The pages of that PDF could not be shown. You can still add pictures in the builder.");
        }
      }
    })();
    return () => {
      alive = false;
      void pdf.current?.close();
      pdf.current = null;
    };
  }, [bytes]);

  // Draws the page chosen.
  useEffect(() => {
    if (status !== "ready" || !pdf.current) return;
    let alive = true;
    setBox(null);
    (async () => {
      try {
        const canvas = await (pdf.current as OpenedPdf).render(page);
        if (!alive || !shown.current) return;
        source.current = canvas;
        shown.current.width = canvas.width;
        shown.current.height = canvas.height;
        shown.current.getContext("2d")?.drawImage(canvas, 0, 0);
        setSize({ width: canvas.width, height: canvas.height });
        setProblem(null);
      } catch {
        if (alive) setProblem("That page could not be drawn. Try another page.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [status, page]);

  const point = (e: React.PointerEvent) => {
    const rect = (overlay.current as HTMLDivElement).getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * size.width, y: ((e.clientY - rect.top) / rect.height) * size.height };
  };

  const percent: PercentBox | null = box && size.width > 0 ? boxToPercent(box, size.width, size.height) : null;
  const setField = (key: keyof PercentBox, value: string) => {
    if (size.width === 0) return;
    const next = { ...(percent ?? { left: 0, top: 0, width: 100, height: 100 }), [key]: Number(value) };
    const made = boxFromPercent(next, size.width, size.height);
    if (made) setBox(made);
  };

  const add = async () => {
    if (!box || question === "" || !source.current || adding) return;
    setAdding(true);
    try {
      const { cropToPng } = await import("@/lib/examPdfSnapshot");
      const png = await cropToPng(source.current, box);
      if (png) onAdd(png, question);
      else setProblem("The picture could not be made. Try again.");
    } finally {
      setAdding(false);
    }
  };

  const ready = status === "ready" && size.width > 0;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        A figure drawn with lines and shapes is not a picture the file holds. Choose its page, drag a box around it (or use the number fields), choose the question it belongs to,
        and add it. It is checked and reviewed like any other picture.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={SMALL_BTN} disabled={!ready || page <= 1} onClick={() => setPage((n) => n - 1)}>
          Previous page
        </button>
        <span className="text-xs text-gray-600 dark:text-gray-300" aria-live="polite">
          {pageCount > 0 ? `Page ${page} of ${pageCount}` : ""}
        </span>
        <button type="button" className={SMALL_BTN} disabled={!ready || page >= pageCount} onClick={() => setPage((n) => n + 1)}>
          Next page
        </button>
      </div>

      {status === "loading" && (
        <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
          Loading the page…
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {problem}
        </p>
      )}

      <div className="max-h-[55dvh] overflow-auto rounded-md ring-1 ring-gray-200 dark:ring-gray-700">
        <div className="relative inline-block max-w-full align-top">
          <canvas ref={shown} className="block h-auto max-w-full" aria-label={`Page ${page} of the PDF`} role="img" />
          {ready && (
            <div
              ref={overlay}
              className="absolute inset-0 cursor-crosshair touch-none"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setFrom(point(e));
                setBox(null);
              }}
              onPointerMove={(e) => {
                if (from) setBox(boxFromDrag(from, point(e), size.width, size.height));
              }}
              onPointerUp={(e) => {
                if (from) setBox(boxFromDrag(from, point(e), size.width, size.height));
                setFrom(null);
              }}
              onPointerCancel={() => setFrom(null)}
            >
              {box && (
                <div
                  className="absolute border-2 border-sky-500 bg-sky-500/20"
                  style={{
                    left: `${(box.x / size.width) * 100}%`,
                    top: `${(box.y / size.height) * 100}%`,
                    width: `${(box.width / size.width) * 100}%`,
                    height: `${(box.height / size.height) * 100}%`,
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-300">
            {field.label}
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              disabled={!ready}
              value={percent ? percent[field.key] : ""}
              onChange={(e) => setField(field.key, e.target.value)}
              className={FIELD_CLS}
            />
          </label>
        ))}
        <button type="button" className={SMALL_BTN} disabled={!ready} onClick={() => setBox(wholePage(size.width, size.height))}>
          Whole page
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="snapshot-question" className="text-xs text-gray-500 dark:text-gray-300">
          Which question does it belong to?
        </label>
        <select
          id="snapshot-question"
          className="w-full rounded-md p-2 text-sm ring-[1.5px] ring-gray-300 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-600"
          value={question}
          onChange={(e) => setQuestion(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <option value="">Choose a question…</option>
          {questions.map((q, i) => (
            <option key={i} value={i}>
              {questionLabel(q, i)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON_CLS}>
          Back
        </button>
        <button
          type="button"
          disabled={!ready || !box || question === "" || adding}
          onClick={() => void add()}
          className={PRIMARY_BUTTON_CLS}
          style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        >
          {adding ? "Adding…" : "Add picture"}
        </button>
      </div>
    </div>
  );
}
