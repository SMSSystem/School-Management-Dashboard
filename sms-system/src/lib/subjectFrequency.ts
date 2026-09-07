import type { SubjectDocument } from "@/lib/firebase";

// Canonical Sun(0)-Sat(6) weekday list — SubjectForm.tsx's day-of-week
// checkboxes are derived from this (excluding Sunday, which isn't a valid
// session day) rather than re-declaring their own label/value pairs.
export const WEEKDAY_OPTIONS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
] as const;

const DAY_LABELS: Record<number, string> = Object.fromEntries(
  WEEKDAY_OPTIONS.map((d) => [d.value, d.label]),
);

function formatDayList(days: number[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d] ?? "?")
    .join(", ");
}

/** Human-readable summary of a subject's attendance schedule, e.g. "Weekly (Mon, Thu)". */
export function formatSubjectFrequency(
  subject: Pick<SubjectDocument, "frequency" | "sessionDayOfWeek" | "customFrequencyDays">,
): string {
  switch (subject.frequency) {
    case "daily":
      return "Daily";
    case "weekly": {
      const days = subject.sessionDayOfWeek ?? [];
      return days.length > 0 ? `Weekly (${formatDayList(days)})` : "Weekly";
    }
    case "fortnightly": {
      const days = subject.sessionDayOfWeek ?? [];
      return days.length > 0 ? `Fortnightly (${formatDayList(days)})` : "Fortnightly";
    }
    case "custom": {
      const count = subject.customFrequencyDays?.length ?? 0;
      return `Custom (${count} date${count !== 1 ? "s" : ""})`;
    }
    default:
      return "N/A";
  }
}
