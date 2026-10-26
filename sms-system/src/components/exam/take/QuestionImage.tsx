import { useState } from "react";
import type { ExamQuestionImage } from "@/types/exams";
import type { PictureState } from "@/lib/examPictureLoad";
import PictureZoom from "./PictureZoom";

const RETRY_BTN =
  "w-fit rounded-md px-2 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-300 hover:bg-sky-50 dark:text-sky-300 dark:ring-sky-700 dark:hover:bg-sky-900/20";

// The picture of a question for a student or the staff preview (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §6.2): the space is
// reserved from the stored size so the page does not jump when it arrives; a click or tap opens it larger. A picture that
// did not load says so and can be tried again; it never stops the question being answered.
export default function QuestionImage({
  image,
  state,
  src,
  onRetry,
}: {
  image: ExamQuestionImage;
  state: PictureState;
  src: string | undefined;
  onRetry: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const ratio = { aspectRatio: `${image.w} / ${image.h}` };

  if (state === "failed" || (state === "ready" && !src)) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md p-3 ring-1 ring-red-200 dark:ring-red-800">
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          The picture could not be loaded. You can still answer the question.
        </p>
        <button type="button" className={RETRY_BTN} onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (state === "loading" || !src) {
    return (
      <div
        role="status"
        style={{ ...ratio, maxWidth: image.w }}
        className="flex max-h-72 w-full items-center justify-center rounded-md bg-gray-100 text-sm text-gray-500 dark:bg-gray-700 dark:text-gray-300"
      >
        Loading the picture…
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        aria-label="Enlarge picture"
        title="Enlarge picture"
        className="w-fit max-w-full cursor-zoom-in rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        <img
          src={src}
          alt={image.decorative ? "" : image.alt}
          draggable={false}
          width={image.w}
          height={image.h}
          style={ratio}
          className="max-h-80 w-auto max-w-full rounded-md object-contain ring-1 ring-gray-200 dark:ring-gray-700"
        />
      </button>
      {zoomed && <PictureZoom image={image} src={src} onClose={() => setZoomed(false)} />}
    </>
  );
}
