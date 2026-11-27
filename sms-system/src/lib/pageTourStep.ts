import type { Step } from "nextstepjs";

/**
 * One step of a page tour started by a page's own "Take a tour" button (Rubrics, Schedule). With a selector it
 * spotlights that element inside the dashboard's scrolling area; without one it is centred. Every step shows the
 * controls and the Skip button.
 */
export const pageTourStep = (
  title: string,
  content: string,
  selector?: string,
  side: Step["side"] = "bottom",
): Step => ({
  icon: null,
  title,
  content,
  ...(selector && { selector, side, viewportID: "main-viewport" }),
  showControls: true,
  showSkip: true,
});
