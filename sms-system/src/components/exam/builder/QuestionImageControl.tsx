import { useRef, useState } from "react";
import { ImagePlus, Repeat2, Trash2 } from "lucide-react";
import type { ExamQuestionImage } from "@/types/exams";
import type { PreparedImage } from "@/lib/examBuilderLogic";

const INPUT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 disabled:bg-gray-50 disabled:text-gray-700 dark:disabled:bg-gray-800";
const SMALL_BTN =
  "flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-300 hover:bg-sky-50 disabled:opacity-50 dark:text-sky-300 dark:ring-sky-700 dark:hover:bg-sky-900/20";
const ZONE_IDLE =
  "flex flex-col items-start gap-2 rounded-md border border-dashed border-gray-300 p-3 text-xs text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-600 dark:text-gray-300";
const ZONE_OVER =
  "flex flex-col items-start gap-2 rounded-md border border-dashed border-sky-500 bg-sky-50 p-3 text-xs text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-sky-900/20 dark:text-gray-300";
const ACCEPT = "image/png,image/jpeg,image/webp";

// The picture of one question in the builder (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §6.1): add by
// button, drop or paste; the preview with what was kept or reduced; replace, remove; the alt text for screen readers.
// The picture is prepared in the browser by a lazy chunk (lib/examImageCanvas.ts) and put in the list unsaved.
export default function QuestionImageControl({
  idBase,
  image,
  src,
  editable,
  onPicked,
  onRemove,
  onAlt,
}: {
  idBase: string;
  image: ExamQuestionImage | undefined;
  /** The picture's data URL from the packs; undefined when the pack does not hold it. */
  src: string | undefined;
  editable: boolean;
  onPicked: (picture: PreparedImage) => void;
  onRemove: () => void;
  onAlt: (alt: string, decorative: boolean) => void;
}) {
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = async (file: File | undefined | null) => {
    if (!file || working) return;
    setWorking(true);
    setProblem(null);
    try {
      const { prepareImage } = await import("@/lib/examImageCanvas");
      const result = await prepareImage(file);
      if (result.ok) {
        setReport(result.picture.report);
        onPicked(result.picture);
      } else {
        setProblem(result.message);
      }
    } finally {
      setWorking(false);
      if (input.current) input.current.value = "";
    }
  };

  const fileInput = (
    <input
      ref={input}
      id={`${idBase}-file`}
      type="file"
      accept={ACCEPT}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => void take(e.target.files?.[0])}
    />
  );
  const status = (
    <>
      {working && (
        <p role="status" className="text-xs text-gray-500 dark:text-gray-400">
          Preparing the picture…
        </p>
      )}
      {problem && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {problem}
        </p>
      )}
    </>
  );

  if (!image) {
    if (!editable) return null;
    return (
      <div className="flex flex-col gap-1">
        <div
          tabIndex={0}
          role="group"
          aria-label="Picture for this question"
          className={over ? ZONE_OVER : ZONE_IDLE}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void take(e.dataTransfer.files[0]);
          }}
          onPaste={(e) => {
            const file = e.clipboardData.files[0];
            if (file) {
              e.preventDefault();
              void take(file);
            }
          }}
        >
          <button type="button" className={SMALL_BTN} disabled={working} onClick={() => input.current?.click()}>
            <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" /> Add picture
          </button>
          <span>Optional. Choose a PNG, JPEG or WebP file, drop one here, or paste one while this box is selected.</span>
          {fileInput}
        </div>
        {status}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {src ? (
        <img
          src={src}
          alt={image.decorative ? "" : image.alt}
          draggable={false}
          width={image.w}
          height={image.h}
          style={{ aspectRatio: `${image.w} / ${image.h}` }}
          className="max-h-72 w-auto max-w-full rounded-md object-contain ring-1 ring-gray-200 dark:ring-gray-700"
        />
      ) : (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          The picture could not be found. Replace or remove it.
        </p>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {image.w} × {image.h} px · {report ?? (image.exact ? "kept exactly" : "reduced")}
      </p>
      {!image.exact && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          This picture was made smaller to fit. Cropping or simplifying the original and adding it again lets it be kept exactly.
        </p>
      )}
      {editable && (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={SMALL_BTN} disabled={working} onClick={() => input.current?.click()}>
              <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" /> Replace picture
            </button>
            <button type="button" className={SMALL_BTN} disabled={working} onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove picture
            </button>
            {fileInput}
          </div>
          {status}
        </>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idBase}-alt`} className="text-xs text-gray-500 dark:text-gray-300">
          Alt text (what the picture shows, for a student who cannot see it)
        </label>
        <input
          id={`${idBase}-alt`}
          type="text"
          maxLength={300}
          disabled={!editable || image.decorative === true}
          value={image.alt}
          onChange={(e) => onAlt(e.target.value, false)}
          className={INPUT_CLS}
        />
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            disabled={!editable}
            checked={image.decorative === true}
            onChange={(e) => onAlt(image.alt, e.target.checked)}
            className="h-4 w-4"
          />
          Decorative (the picture adds nothing a student needs to know)
        </label>
      </div>
    </div>
  );
}
