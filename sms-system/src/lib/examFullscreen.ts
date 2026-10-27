// Fullscreen for an unsupervised exam, and the mark on the paper (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.2 and §9.8).
// The browser asks for fullscreen only from a click, may refuse, and on some devices (an iPhone's Safari) does not offer it for a
// page at all. Nothing here blocks: the exam goes on in every case, and what happens is only recorded (`fs_exit` when the
// student leaves fullscreen after being in it, `fs_unavailable` once where the browser has no fullscreen for the page). Pure,
// with the document passed in so the decisions are tested without a browser.

/** The parts of a document that tell about fullscreen (the standard names and the older WebKit ones). */
export type FullscreenDocument = {
  fullscreenEnabled?: boolean;
  fullscreenElement?: unknown;
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: unknown;
};

/** The parts of an element that can be asked to go fullscreen. */
export type FullscreenElement = {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
};

/** Does the browser offer fullscreen for this page? */
export const fullscreenSupported = (doc: FullscreenDocument): boolean => doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true;

/** Is the page in fullscreen now? */
export const isFullscreen = (doc: FullscreenDocument): boolean => Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);

/** Asks for fullscreen; true when the browser went into it, false when it is not offered or refused. Never throws. */
export async function enterFullscreen(element: FullscreenElement): Promise<boolean> {
  try {
    if (typeof element.requestFullscreen === 'function') {
      await element.requestFullscreen();
      return true;
    }
    if (typeof element.webkitRequestFullscreen === 'function') {
      await element.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // refused (not from a click, or the person said no): the exam goes on
  }
  return false;
}

/** What a change of the fullscreen state is for the log: leaving it after being in it is an exit; anything else is nothing. */
export function fullscreenChange(was: boolean, now: boolean): 'fs_exit' | null {
  return was && !now ? 'fs_exit' : null;
}

/** The faint mark over an unsupervised exam: the student's name and the first six characters of their account id. */
export function watermarkText(name: string | null | undefined, uid: string | null | undefined): string {
  const who = (name ?? '').replace(/\s+/g, ' ').trim() || 'Student';
  const code = (uid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
  return code ? `${who} · ${code}` : who;
}
