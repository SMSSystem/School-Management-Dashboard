import { COMMENT_KEY, firstNameOf, renderComment } from './commentKey';

// Conduct codes as the report card's key prints them (ReportCardPDF.tsx CONDUCT_KEY).
export const CONDUCT_LABELS: Record<string, string> = {
  G: 'Good',
  S: 'Satisfactory',
  F: 'Fair',
  U: 'Unsatisfactory',
  P: 'Poor',
  D: 'Disruption',
};

/**
 * The comment text for a feedback document. The app's writers (Gradebook, Feedback form) store
 * only `commentNumbers`, 1-based positions in COMMENT_KEY; none stores the sentence. The document
 * has no gender, so pronouns come out neutral ("he/she"). Never throws: a missing or malformed
 * list, or a number outside the key, gives an empty string.
 */
export function feedbackCommentText(numbers: unknown, studentName?: string, subjectName?: string): string {
  if (!Array.isArray(numbers)) return '';
  return numbers
    .filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= COMMENT_KEY.length)
    .map((n) => renderComment(COMMENT_KEY[n - 1], { studentName: firstNameOf(studentName), subjectName }))
    .join(' ');
}

/** "G — Good" for a known code, the raw value for an unknown one, an em dash for none. */
export function conductLabel(code: unknown): string {
  if (typeof code !== 'string' || code === '') return '—';
  return CONDUCT_LABELS[code] ? `${code} — ${CONDUCT_LABELS[code]}` : code;
}
