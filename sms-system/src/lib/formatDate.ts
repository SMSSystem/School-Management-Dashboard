// Shared "long date" formatting: e.g. "January 5, 2026".
export const LONG_DATE_OPTIONS: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };

// Formats an ISO date-only string (YYYY-MM-DD). Appends T00:00:00 before
// parsing so the value reads as local midnight, avoiding the off-by-one-day
// bug from parsing a bare date string as UTC midnight. Falsy input renders
// as an em dash.
export function formatDate(iso: string): string {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", LONG_DATE_OPTIONS) : "—";
}
