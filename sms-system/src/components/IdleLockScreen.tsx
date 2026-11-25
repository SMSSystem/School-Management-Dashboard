import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  getConnectionState,
  subscribeConnection,
} from "@/lib/connectionStatus";
import {
  MAX_UNLOCK_FAILURES,
  afterPasswordCheck,
  idleLockState,
  recordFailure,
  unlockTab,
} from "@/lib/offline/idleLock";
import { checkPassword, hasVerifier } from "@/lib/offline/unlockVerifier";
import { lockScreenText } from "@/lib/offline/idleLockText";

// What replaces the dashboard while the tab is locked (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice D):
// staff who work offline went idle while the device was offline. The page behind is unmounted, so no school data is
// on screen or in the page; register drafts were already saved, encrypted, and come back after unlocking. The password
// is checked against this tab's verifier (lib/offline/unlockVerifier.ts), with no network.

const browserOnline = () =>
  !(typeof navigator !== "undefined" && navigator.onLine === false);

/** Online as the connection banner sees it: the browser says so and the app last reached its servers. */
function useOnline(): boolean {
  const state = useSyncExternalStore(
    subscribeConnection,
    getConnectionState,
    getConnectionState,
  );
  const [browser, setBrowser] = useState(browserOnline);
  useEffect(() => {
    const update = () => setBrowser(browserOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return browser && !state.offline;
}

/** Signs out once, however many times it's asked. signOut changes on every render of the provider, hence the ref. */
function useLeave(): () => void {
  const { signOut } = useAuth();
  const signOutRef = useRef(signOut);
  const leaving = useRef(false);
  useEffect(() => {
    signOutRef.current = signOut;
  });
  return useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    void signOutRef.current();
  }, []);
}

function UnlockForm({ uid, leave }: { uid: string; leave: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const triesLeft = MAX_UNLOCK_FAILURES - (idleLockState()?.failures ?? 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    const result = await checkPassword(uid, password);
    setPassword("");
    const failures = result === "ok" ? 0 : recordFailure();
    const next = afterPasswordCheck(result, failures);
    if (next === "unlock") return unlockTab();
    if (next === "sign-out") {
      setMessage(lockScreenText.signingOut);
      return leave();
    }
    setMessage(lockScreenText.wrong(MAX_UNLOCK_FAILURES - failures));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {lockScreenText.intro}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className="rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2"
        />
      </label>
      {message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !password}
        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? lockScreenText.checking : lockScreenText.unlock}
      </button>
      {!message && triesLeft < MAX_UNLOCK_FAILURES && (
        <p className="text-xs text-slate-500">
          {lockScreenText.triesLeft(triesLeft)}
        </p>
      )}
    </form>
  );
}

function SignOutChoice({
  online,
  leave,
}: {
  online: boolean;
  leave: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-start text-xs text-slate-500 underline"
      >
        Sign out instead
      </button>
    );
  return (
    <div
      role="alertdialog"
      aria-label="Sign out"
      className="flex flex-col gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 p-3 text-sm"
    >
      <p>{lockScreenText.signOutWarning(online)}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md border px-2.5 py-1 text-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={leave}
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function IdleLockScreen({ uid }: { uid: string }) {
  const { displayName, institution } = useAuth();
  const online = useOnline();
  const leave = useLeave();
  const canUnlock = hasVerifier(uid);

  // A tab with no verifier can't be unlocked offline: it signs out, as idle tabs normally do, once it's back online.
  useEffect(() => {
    if (!canUnlock && online) leave();
  }, [canUnlock, online, leave]);

  return (
    <main className="min-h-dvh flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <section
        aria-labelledby="idle-lock-title"
        className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-800 shadow p-6 flex flex-col gap-4"
      >
        <div className="flex items-center gap-3">
          <img
            src={institution?.logoUrl ?? "/logo.png"}
            alt=""
            className="w-10 h-10 object-contain"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {institution?.name ?? "School Management"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {displayName}
            </p>
          </div>
        </div>
        <h1
          id="idle-lock-title"
          className="flex items-center gap-2 text-lg font-bold"
        >
          <Lock className="w-5 h-5" aria-hidden="true" /> {lockScreenText.title}
        </h1>
        {canUnlock ? (
          <UnlockForm uid={uid} leave={leave} />
        ) : (
          <p
            role="status"
            className="text-sm text-slate-600 dark:text-slate-300"
          >
            {lockScreenText.noVerifier}
          </p>
        )}
        <SignOutChoice online={online} leave={leave} />
      </section>
    </main>
  );
}
