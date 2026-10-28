import { useState } from "react";
import DialogShell from "@/components/DialogShell";
import { SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import type { ExamQuestionImage } from "@/types/exams";
import ExamWatermark from "./ExamWatermark";

// A question's picture larger (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §6.2): fitted to the screen, or at its real size in a
// box that scrolls (and pinch-zooms on a phone), because a diagram with numbered parts must be readable on a small
// screen. Nothing moves or fades, so a person who asks for less motion gets none. Closes with Escape or the X, and the
// focus goes back to the picture.
export default function PictureZoom({ image, src, onClose }: { image: ExamQuestionImage; src: string; onClose: () => void }) {
  const [actual, setActual] = useState(false);
  return (
    <DialogShell title="Picture" onClose={onClose} wide>
      <div>
        <button type="button" className={SECONDARY_BUTTON_CLS} onClick={() => setActual((v) => !v)} aria-pressed={actual}>
          {actual ? "Fit to screen" : "Actual size"}
        </button>
      </div>
      <div className="relative">
        <div className="max-h-[70dvh] overflow-auto rounded-md ring-1 ring-gray-200 dark:ring-gray-700" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
          {actual ? (
            <img src={src} alt={image.decorative ? "" : image.alt} draggable={false} width={image.w} height={image.h} className="max-w-none" />
          ) : (
            <img src={src} alt={image.decorative ? "" : image.alt} draggable={false} className="mx-auto max-h-[68dvh] w-auto max-w-full object-contain" />
          )}
        </div>
        <ExamWatermark />
      </div>
    </DialogShell>
  );
}
