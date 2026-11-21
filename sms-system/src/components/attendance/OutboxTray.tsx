import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloudUpload } from "lucide-react";
import { useOutboxItems, type OutboxSnapshot } from "@/hooks/useOutboxItems";
import { useOutboxEnabled } from "@/hooks/useOutboxSender";
import { useToast } from "@/lib/ToastContext";
import { dropAbandoned } from "@/lib/offline/outboxStore";
import { isExpired } from "@/lib/offline/outboxPolicy";
import { needsAttention } from "@/lib/offline/outboxExport";
import { OUTBOX_SIGNIN_NOTED_KEY } from "@/lib/offline/offlineStore";
import { setUnsentCount } from "@/lib/offline/unsentCount";
import {
  signInNotice,
  unsentButtonName,
  unsentLabel,
} from "@/lib/offline/copyLabels";
import OutboxPanel from "./OutboxPanel";
import OutboxSignOutDialog from "./OutboxSignOutDialog";
import OutboxExpiryDialog from "./OutboxExpiryDialog";

// The header's tray of unsent register saves (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C2), loaded on
// demand for staff who work offline. It shows "N unsent" while anything waits, warns before Logout, says at sign-in
// what an earlier session left unsent, and asks about saves that weren't sent within 7 days. It reads only this
// device's encrypted outbox: no Firestore reads.

/** True the first time this tab sees the signed-in person's outbox since sign-in. */
function firstLookSinceSignIn(): boolean {
  try {
    if (sessionStorage.getItem(OUTBOX_SIGNIN_NOTED_KEY)) return false;
    sessionStorage.setItem(OUTBOX_SIGNIN_NOTED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/** Once per sign-in: says how many saves an earlier session left, and removes rows abandoned on this device. */
function useSignInNotice({ items, ready }: OutboxSnapshot, sending: boolean) {
  const { showToast } = useToast();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !ready) return;
    done.current = true;
    void dropAbandoned();
    if (!firstLookSinceSignIn()) return;
    const waiting = items.filter(
      (item) => item.state === "pending" || item.state === "sending",
    ).length;
    if (waiting > 0)
      showToast({ message: signInNotice(waiting, sending), variant: "info" });
  }, [items, ready, sending, showToast]);
}

export default function OutboxTray({
  askSignOut,
  onCancelSignOut,
  onSignOut,
}: {
  askSignOut: boolean;
  onCancelSignOut: () => void;
  onSignOut: () => void;
}) {
  const sending = useOutboxEnabled();
  const snapshot = useOutboxItems(true);
  const { items, at } = snapshot;
  const [open, setOpen] = useState(false);
  const [expiryClosed, setExpiryClosed] = useState(false);
  useSignInNotice(snapshot, sending);

  useEffect(() => setUnsentCount(items.length), [items.length]);
  useEffect(() => () => setUnsentCount(0), []);

  const expired = items.filter((item) => isExpired(item, at));
  const attention = items.some((item) => needsAttention(item, at));

  return (
    <>
      {items.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={unsentButtonName(items.length)}
          className="relative flex items-center gap-1.5 rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950/40"
        >
          <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{unsentLabel(items.length)}</span>
          {attention && (
            <span
              className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500"
              aria-hidden="true"
            />
          )}
        </button>
      )}
      {/* At the page's top level: inside the sticky header (z-30) the dialogs would sit under the connection banner. */}
      {createPortal(
        <>
          {open && (
            <OutboxPanel
              items={items}
              now={at}
              sending={sending}
              onClose={() => setOpen(false)}
            />
          )}
          {askSignOut && (
            <OutboxSignOutDialog
              items={items}
              sending={sending}
              onCancel={onCancelSignOut}
              onSignOut={onSignOut}
            />
          )}
          {expired.length > 0 && !open && !askSignOut && !expiryClosed && (
            <OutboxExpiryDialog
              items={expired}
              sending={sending}
              onClose={() => setExpiryClosed(true)}
            />
          )}
        </>,
        document.body,
      )}
    </>
  );
}
