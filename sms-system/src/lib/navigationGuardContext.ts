import { createContext } from "react";

// What a page can ask of the unsaved-changes guard (components/NavigationGuardProvider.tsx): switch it on while it holds
// changes that are not saved, and run a way out that is not a link (Sign out, Start Tour) only once leaving is confirmed.
// Kept apart from the component so the provider file exports only a component.
export type NavigationGuard = {
  /** `message` is what the leave dialog says; the provider has a general one for a page that gives none. */
  setActive: (active: boolean, message?: string) => void;
  /** Runs `action` at once when nothing is unsaved; otherwise asks first and runs it only on "Leave without saving". */
  confirmLeave: (action: () => void) => void;
};

export const NavigationGuardContext = createContext<NavigationGuard | null>(null);
