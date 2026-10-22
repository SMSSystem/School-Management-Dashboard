// The help text of the "Flag for review" button on a question (EXAMS_FEATURE_SPEC.md §4.5) and where its tooltip opens.
// Pure, so the wording and the placement rule are unit-tested; components/exam/take/FlagButton.tsx draws it.

const WHAT_IT_DOES = "Mark this question to come back to it. It does not change your answer.";

/** The tooltip's text: what the button does, then a line that depends on whether the question is flagged already. */
export function flagTooltipText(flagged: boolean): { what: string; state: string } {
  return {
    what: WHAT_IT_DOES,
    state: flagged
      ? "This question is flagged. Press again to remove the flag."
      : "Flagged questions are highlighted in the question list and counted before you submit.",
  };
}

/** How long a tooltip opened by tapping stays up on a touch device. */
export const FLAG_TOOLTIP_AUTO_CLOSE_MS = 6000;

/** Below this width (px) the tooltip is as wide as the screen minus a gutter instead of a fixed-width bubble. */
export const FLAG_TOOLTIP_NARROW_MAX_PX = 639;
export const FLAG_TOOLTIP_GUTTER_PX = 16;
export const FLAG_TOOLTIP_GAP_PX = 8;
/** What a tooltip needs in height (four short lines and its padding), used before it is on the screen to measure. */
export const FLAG_TOOLTIP_HEIGHT_PX = 120;

/** Above the button unless there is less room above it than the tooltip needs. */
export function tooltipPlacement(buttonTop: number, tooltipHeight = FLAG_TOOLTIP_HEIGHT_PX, gap = FLAG_TOOLTIP_GAP_PX): "above" | "below" {
  return buttonTop >= tooltipHeight + gap ? "above" : "below";
}
