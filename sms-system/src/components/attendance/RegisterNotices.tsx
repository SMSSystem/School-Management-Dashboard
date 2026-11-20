import { useOffline } from '@/hooks/useOffline';
import { copyTimeLabel } from '@/lib/offline/copyLabels';

// The small states of the General and Subject register pages: a spinner while the calendar loads, a one-line notice,
// and the offline notices (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice B).

export function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="h-8 w-8 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
    </div>
  );
}

export function InfoState({ message }: { message: string }) {
  return (
    <div className="p-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}

/** A register with no students yet: still loading, or truly empty (`empty` says how). */
export function NoStudents({ loading, empty }: { loading: boolean; empty: string }) {
  return <InfoState message={loading ? 'Loading students…' : empty} />;
}

/** Shown while the register on screen comes from a copy saved on this device. */
export function CopyNotice({ savedAt }: { savedAt: number | null }) {
  if (savedAt === null) return null;
  return (
    <div
      role="status"
      className="mb-3 rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
    >
      Offline: showing the copy saved at {copyTimeLabel(savedAt)}. Marks you make are kept on this device.
    </div>
  );
}

/** Shown under the Save buttons while a save waits for the connection. */
export function WaitingNotice({ saving }: { saving: boolean }) {
  const offline = useOffline();
  if (!saving || !offline) return null;
  return (
    <div
      role="status"
      className="mt-3 rounded-md bg-sky-50 dark:bg-sky-950/40 px-3 py-2 text-sm text-sky-800 dark:text-sky-200"
    >
      Waiting for connection. Your marks are kept on this device and will save when it returns.
    </div>
  );
}
