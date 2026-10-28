import { useEffect, useRef, useState } from "react";
import { useSwipe } from "@/hooks/useSwipe";
import { positionText, type SwipeDirection } from "@/lib/examCarousel";

// The question area of the carousel layout, as a carousel to assistive technology and to a finger: a labelled group, a
// swipe left or right (the screen decides where it leads), a polite announcement of the question the student has arrived
// at ("Question 4 of 20", not spoken on arrival or on every answer), and focus moved to that question's heading so a
// screen-reader or keyboard user is not left on whatever they were on. The slide itself is QuestionSlide.
export default function CarouselRegion({
  index,
  total,
  swipeEnabled,
  onSwipe,
  className,
  children,
}: {
  index: number;
  total: number;
  swipeEnabled: boolean;
  onSwipe: (direction: SwipeDirection) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useSwipe<HTMLDivElement>(onSwipe, swipeEnabled);
  const [message, setMessage] = useState("");
  // The question the announcement and the focus last followed; a re-render with the same question does nothing.
  const seen = useRef(index);
  useEffect(() => {
    if (seen.current === index) return;
    seen.current = index;
    setMessage(positionText(index, total));
    ref.current?.querySelector<HTMLElement>("[data-question-heading]")?.focus();
  }, [index, total, ref]);

  return (
    <div ref={ref} role="group" aria-roledescription="carousel" aria-label="Exam questions" className={`touch-pan-y ${className ?? ""}`}>
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      {children}
    </div>
  );
}
