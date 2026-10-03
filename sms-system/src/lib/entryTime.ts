// How a log entry's time is shown. Entries carry two times: recordedAt
// (server-verified: firestore.rules force it to equal request.time) and the
// legacy client-supplied `timestamp` ISO string the lists are ordered by. The
// verified one is preferred; an entry without it predates recordedAt, and its
// time was set by the browser and can't be trusted, so it is flagged.

export type TimedEntry = {
  timestamp: string;
  recordedAt?: { toDate: () => Date };
};

// "Oct 02, 2026 - 03:45 PM"
export function formatEntryDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })} - ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

export function entryTime(entry: TimedEntry): { text: string; verified: boolean } {
  if (entry.recordedAt?.toDate) {
    return { text: formatEntryDateTime(entry.recordedAt.toDate().toISOString()), verified: true };
  }
  return { text: formatEntryDateTime(entry.timestamp), verified: false };
}
