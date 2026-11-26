import { Lock } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useDeviceOnline } from "@/hooks/useDeviceOnline";
import { useConfirmLeave } from "@/hooks/useNavigationGuard";
import { lockTab, manualLockAllowed } from "@/lib/offline/idleLock";
import { hasVerifier } from "@/lib/offline/unlockVerifier";
import { lockScreenText } from "@/lib/offline/idleLockText";

// The top bar's Lock button (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice D): staff who work offline
// lock the screen on purpose before stepping away from a shared computer while offline, instead of waiting for the
// idle lock. It only appears when manualLockAllowed says so (offline, a role that works offline, and a tab that can
// check the password offline). Locking goes through lockTab, so the lock screen, the stopped idle timer and the held
// update all follow as for the idle lock. Part of the app's main code, never loaded on demand: it shows offline.

export default function LockButton() {
  const { user, role } = useAuth();
  const online = useDeviceOnline();
  const confirmLeave = useConfirmLeave();
  const uid = user?.uid;
  // hasVerifier reads this tab's sessionStorage; it's cheap, and re-read on each render the connection triggers.
  if (
    !uid ||
    !manualLockAllowed({ role, online, hasVerifier: hasVerifier(uid) })
  )
    return null;
  return (
    <button
      type="button"
      // Locking unmounts the page, so a form with unsaved changes asks first, as Logout does.
      onClick={() => confirmLeave(() => lockTab(uid, "manual"))}
      className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-150"
      aria-label={lockScreenText.lockButtonLabel}
    >
      <Lock className="w-3.5 h-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{lockScreenText.lockButton}</span>
    </button>
  );
}
