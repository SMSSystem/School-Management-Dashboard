import { useContext, useId } from "react";
import { WatermarkContext } from "./examWatermarkContext";

// A faint tiled mark with the student's name and a short code over the questions and the zoomed picture of an unsupervised
// exam (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.2): a photograph of the screen can be traced to who was sitting
// it. It is decoration: it takes no pointer event, is hidden from assistive technology, and anyone with developer tools can
// remove it, which the documentation says. Draws nothing when the exam has no watermark.
export default function ExamWatermark() {
  const text = useContext(WatermarkContext);
  const id = useId();
  if (!text) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden="true" focusable="false" data-watermark="">
      <defs>
        <pattern id={id} width="260" height="150" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)">
          <text x="0" y="70" fontSize="16" className="fill-gray-500/20 dark:fill-gray-300/20">
            {text}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
