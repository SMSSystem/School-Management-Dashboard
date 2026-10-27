import { useEffect, useRef } from "react";

// The deterrents on the question area of an exam (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.5): no copy or cut, no
// context menu (right click and long press), no drag, no starting a text selection. They stop a casual copy only: a screenshot,
// developer tools or view-source bypass them, and they are said to the student on the start screen. They never stop the keyboard
// or a screen reader (nothing is hidden from assistive technology and no focus is changed), and they do not stop the event
// travelling: the activity log's listeners on the window still see every attempt and record it. Not used by the staff preview.

/** The events whose default action is cancelled inside the question area. */
export const DETERRED_EVENTS = ["copy", "cut", "contextmenu", "dragstart", "selectstart"] as const;

type Target = Pick<EventTarget, "addEventListener" | "removeEventListener">;

const cancel = (event: Event) => {
  event.preventDefault();
};

/** Cancels the default action of the deterred events on `target`; returns the function that stops doing so. */
export function attachDeterrents(target: Target): () => void {
  for (const name of DETERRED_EVENTS) target.addEventListener(name, cancel);
  return () => {
    for (const name of DETERRED_EVENTS) target.removeEventListener(name, cancel);
  };
}

/** A ref for the element that holds the questions: the deterrents work on it while it is mounted. */
export function useQuestionDeterrents<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => (ref.current ? attachDeterrents(ref.current) : undefined), []);
  return ref;
}
