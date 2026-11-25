import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  idleLockState,
  subscribeIdleLock,
  unlockTab,
} from "@/lib/offline/idleLock";
import IdleLockScreen from "@/components/IdleLockScreen";

// The offline idle lock's gate (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice D). While this tab is
// locked, the lock screen is rendered instead of the dashboard: the header, sidebar and page are unmounted, so the
// school's data isn't on screen or in the page. The state is in the tab's sessionStorage, so a reload stays locked.
// The screen is imported directly, not loaded on demand: it shows when the device is offline, when a chunk that wasn't
// downloaded yet couldn't load.

export default function IdleLockGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const lock = useSyncExternalStore(
    subscribeIdleLock,
    idleLockState,
    idleLockState,
  );
  const stale = !!lock && !!user && lock.uid !== user.uid;

  // A lock left by someone else on this tab is not this person's; the purge normally clears it at sign-out.
  useEffect(() => {
    if (stale) unlockTab();
  }, [stale]);

  if (!lock || !user || stale) return <>{children}</>;
  return <IdleLockScreen uid={user.uid} />;
}
