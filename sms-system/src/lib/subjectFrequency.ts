import type { SubjectDocument } from "@/lib/firebase";

const DAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

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
