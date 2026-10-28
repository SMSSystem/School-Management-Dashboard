import CarouselRegion from "./CarouselRegion";
import type { SwipeDirection } from "@/lib/examCarousel";

// The frame the student's attempt and the staff preview share in the carousel layout (a phone, or a tablet held upright):
// a bar at the top, the question area as a carousel, a bar at the bottom, and a sheet over them when one is open. The root
// carries a marker the stylesheet looks for, so the tour wrapper around the page lets the bars stick (see index.css), and it
// is at least as tall as the area under the dashboard's header, so the bottom bar rests on the bottom of a short question.
export default function CarouselFrame({
  kind,
  header,
  index,
  total,
  swipeEnabled,
  onSwipe,
  bar,
  sheet,
  children,
}: {
  kind: "attempt" | "preview";
  header: React.ReactNode;
  index: number;
  total: number;
  swipeEnabled: boolean;
  onSwipe: (direction: SwipeDirection) => void;
  bar: React.ReactNode;
  sheet: React.ReactNode;
  children: React.ReactNode;
}) {
  const marker = kind === "attempt" ? { "data-exam-attempt": "" } : { "data-exam-preview": "" };
  return (
    <div {...marker} className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-white dark:bg-gray-800">
      {header}
      <CarouselRegion index={index} total={total} swipeEnabled={swipeEnabled} onSwipe={onSwipe} className="flex flex-1 flex-col gap-4 p-4">
        {children}
      </CarouselRegion>
      {bar}
      {sheet}
    </div>
  );
}
