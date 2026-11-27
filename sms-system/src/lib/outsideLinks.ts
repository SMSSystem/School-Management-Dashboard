// Outside links' rules and the "You're leaving" dialog's wording (components/OutsideLink.tsx and LeavingDialog.tsx).
// Kept apart, pure and without Firebase, so it can be tested and read in one place. There's deliberately no warning about scams: the links are a school's own (a teacher's resource, the
// changelog), so it would mostly be untrue, and a warning that's usually wrong teaches people to ignore it.

/** Where an outside link came from; the dialog adds a line for links people typed in. */
export type LeavingSource = "lesson-note" | "changelog";

export const leavingText = {
  title: (site: string) => `You're leaving ${site}`,
  body: (site: string) =>
    `This link goes to a site outside ${site}. Make sure you trust it before continuing.`,
  /** Only for links a teacher typed (lesson notes): nobody checks what's behind them. */
  teacherAdded: "A teacher added this link. We don't check what's on it.",
  continue: "Continue to site",
  goBack: "Go back",
  newTab: "(opens in a new tab)",
};

/** The extra line for this kind of link, or null. */
export function leavingNote(source: LeavingSource): string | null {
  return source === "lesson-note" ? leavingText.teacherAdded : null;
}

/** Whether a click on a link should ask first: the left button (with or without keys held) or the middle one. */
export function shouldConfirmLeaving(e: { button: number }): boolean {
  return e.button === 0 || e.button === 1;
}

/** Opens the address in a new tab, cut off from this page (no window.opener, no Referer), as a plain link would. */
export function openOutside(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
