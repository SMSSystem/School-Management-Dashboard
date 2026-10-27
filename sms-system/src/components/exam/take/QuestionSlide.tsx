import { useState } from "react";
import { slideClassName, slideDirection, type SlideDirection } from "@/lib/examCarousel";

/**
 * The question that slides in. Keyed by the question, so a new one is a new element and the animation plays; on arrival
 * there is none. The stylesheet takes the slide away for a person who asks for less motion, so the swap is instant.
 * Keep the question area's own element (which holds the deterrents) outside the key.
 */
export default function QuestionSlide({ id, index, children }: { id: string; index: number; children: React.ReactNode }) {
  const [slide, setSlide] = useState<{ index: number; direction: SlideDirection }>({ index, direction: "none" });
  if (slide.index !== index) setSlide({ index, direction: slideDirection(slide.index, index) });
  return (
    <div key={id} data-slide={slide.direction} className={slideClassName(slide.direction)}>
      {children}
    </div>
  );
}
