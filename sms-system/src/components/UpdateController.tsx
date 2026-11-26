import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useDeviceOnline } from "@/hooks/useDeviceOnline";
import {
  applyUpdate,
  subscribeSwUpdate,
  swUpdateState,
} from "@/lib/serviceWorker/swRegistration";
import {
  isSafeMoment,
  isSignInPage,
  isSwitchMoment,
  safeMomentFacts,
} from "@/lib/serviceWorker/safeMoment";
import { idleLockState, subscribeIdleLock } from "@/lib/offline/idleLock";
import { updateText } from "@/lib/serviceWorker/updateText";

// Moves the tab to a new version of the app (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice E). The new
// service worker waits until a safe moment: a page change, or the untouched sign-in page, while online, not locked,
// with no register draft and nothing unsent (lib/serviceWorker/safeMoment.ts). Until then a small notice offers to
// update now. Part of the app's main code, never loaded on demand, so it works offline.

/** Whether anything has been typed on this sign-in page. */
function useSignInFormTouched(pathname: string): boolean {
  const [touchedOn, setTouchedOn] = useState<string | null>(null);
  const onSignInPage = isSignInPage(pathname);
  useEffect(() => {
    if (!onSignInPage) return;
    const onInput = () => setTouchedOn(pathname);
    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, [onSignInPage, pathname]);
  return onSignInPage && touchedOn === pathname;
}

/** Switches at a safe moment (isSwitchMoment, then isSafeMoment). */
function useSwitchAtSafeMoment(pending: boolean): void {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const formTouched = useSignInFormTouched(pathname);
  const lastPath = useRef(pathname);
  useEffect(() => {
    const prevPath = lastPath.current;
    lastPath.current = pathname;
    if (!pending) return;
    if (
      !isSwitchMoment({
        prevPath,
        path: pathname,
        signedIn: !!user,
        formTouched,
      })
    )
      return;
    let cancelled = false;
    void safeMomentFacts().then((facts) => {
      if (!cancelled && isSafeMoment(facts)) applyUpdate();
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, pending, user, formTouched]);
}

function UpdateNotice({ onLater }: { onLater: () => void }) {
  const online = useDeviceOnline();
  const [confirming, setConfirming] = useState(false);

  async function update() {
    const facts = await safeMomentFacts();
    if (facts.hasDrafts || facts.hasUnsent) return setConfirming(true);
    applyUpdate();
  }

  const button =
    "rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-50";
  return (
    <div
      role="status"
      aria-label={updateText.title}
      className="fixed left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-96 z-40 rounded-lg bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 p-3 text-sm flex flex-col gap-2"
      style={{ bottom: "calc(var(--offline-banner-h, 0px) + 1rem)" }}
    >
      <p className="flex items-center gap-2 font-semibold">
        <RefreshCw className="w-4 h-4" aria-hidden="true" /> {updateText.title}
      </p>
      <p className="text-slate-600 dark:text-slate-300">
        {confirming ? updateText.keptWork : updateText.body}
      </p>
      {!online && (
        <p className="text-xs text-slate-500">{updateText.offline}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={confirming ? () => setConfirming(false) : onLater}
          className={`${button} border border-slate-300 dark:border-slate-600`}
        >
          {confirming ? updateText.cancel : updateText.later}
        </button>
        <button
          type="button"
          disabled={!online}
          onClick={confirming ? () => applyUpdate() : () => void update()}
          className={`${button} bg-sky-600 text-white`}
        >
          {confirming ? updateText.confirm : updateText.update}
        </button>
      </div>
    </div>
  );
}

export default function UpdateController() {
  const update = useSyncExternalStore(
    subscribeSwUpdate,
    swUpdateState,
    swUpdateState,
  );
  const locked =
    useSyncExternalStore(subscribeIdleLock, idleLockState, idleLockState) !==
    null;
  const [hidden, setHidden] = useState(false);
  const pending = update.waiting || update.reloadPending;
  useSwitchAtSafeMoment(pending);
  if (!pending || hidden || locked) return null;
  return <UpdateNotice onLater={() => setHidden(true)} />;
}
