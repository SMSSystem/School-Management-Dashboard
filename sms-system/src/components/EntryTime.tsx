import { entryTime, type TimedEntry } from "@/lib/entryTime";

// A log entry's time: the server-verified one, or the browser-set legacy one
// with an "(unverified)" marker. Pass flagUnverified={false} for mock data,
// which has no recordedAt at all.
const EntryTime = ({ entry, flagUnverified = true }: { entry: TimedEntry; flagUnverified?: boolean }) => {
  const { text, verified } = entryTime(entry);
  return (
    <>
      {text}
      {!verified && flagUnverified && (
        <span
          className="ml-1 text-amber-600 dark:text-amber-400"
          title="Recorded before server-verified timestamps existed — this time was set by the browser."
        >
          (unverified)
        </span>
      )}
    </>
  );
};

export default EntryTime;
