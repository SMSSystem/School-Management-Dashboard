// Client-side validation for a lesson note's external resource links
// (LESSON_NOTES_FEATURE_SPEC.md §7). firestore.rules can only cap the list
// size — it can't loop over elements — so the http/https-only restriction
// that blocks javascript:/data:/vbscript: URLs lives here.

import type { LessonNoteLink } from './firebase';
import { isWebUrl, parseUrl } from './webUrl';

export const MAX_LESSON_NOTE_LINKS = 10; // mirrors firestore.rules' resourceLinks.size() cap
export const MAX_LINK_URL_LENGTH = 2048;
const MAX_LINK_LABEL_LENGTH = 100;

// Returns an error message, or null when the URL is acceptable.
export function validateLessonNoteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return 'Enter a URL.';
  if (trimmed.length > MAX_LINK_URL_LENGTH) {
    return `URL must be ${MAX_LINK_URL_LENGTH} characters or less.`;
  }
  const parsed = parseUrl(trimmed);
  if (!parsed) return 'Enter a valid URL, including https://.';
  if (!isWebUrl(parsed)) return 'Only http:// and https:// links are allowed.';
  return null;
}

// Drops fully blank rows (the form always keeps a trailing empty row to type
// into), trims, and omits an empty label rather than storing "".
export function cleanLessonNoteLinks(rows: { url: string; label?: string }[]): LessonNoteLink[] {
  return rows
    .map((r) => ({ url: r.url.trim(), label: r.label?.trim() ?? '' }))
    .filter((r) => r.url !== '' || r.label !== '')
    .map((r) => (r.label ? { url: r.url, label: r.label } : { url: r.url }));
}

// First problem across all rows (a row with a label but no URL counts), or null.
export function validateLessonNoteLinks(rows: { url: string; label?: string }[]): string | null {
  const cleaned = cleanLessonNoteLinks(rows);
  if (cleaned.length > MAX_LESSON_NOTE_LINKS) {
    return `A note can have at most ${MAX_LESSON_NOTE_LINKS} links.`;
  }
  for (const link of cleaned) {
    const err = validateLessonNoteUrl(link.url);
    if (err) return `${link.url || 'Link'}: ${err}`;
    if ((link.label?.length ?? 0) > MAX_LINK_LABEL_LENGTH) {
      return `Link labels must be ${MAX_LINK_LABEL_LENGTH} characters or less.`;
    }
  }
  return null;
}
