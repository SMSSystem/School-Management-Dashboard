import { useEffect, useRef, useState } from "react";
import DialogShell from "@/components/DialogShell";
import type { OutboxItem } from "@/lib/offline/outboxStore";
import { downloadOutboxCsv } from "@/lib/offline/outboxExport";
import { wakeOutbox } from "@/lib/offline/outboxSender";
import { signOutDetail, signOutWarning } from "@/lib/offline/copyLabels";
import { TRAY_BUTTON } from "./OutboxPanel";

// Asked before the Logout button signs out while register saves are still on this device
// (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C2). The idle sign-out doesn't ask: the work stays, and
// the next sign-in says so.

/** How long "Send now" waits for the outbox to empty before giving the choice back. */
const SEND_WAIT_MS = 15_000;

export default function OutboxSignOutDialog({
  items,
  sending,
  onCancel,
  onSignOut,
}: {
  items: OutboxItem[];
  sending: boolean;
  onCancel: () => void;
  onSignOut: () => void;
}) {
  const [trying, setTrying] = useState(false);
  const signOutRef = useRef(onSignOut);
  useEffect(() => {
    signOutRef.current = onSignOut;
  });

  // Once "Send now" has emptied the outbox, sign out as asked.
  useEffect(() => {
    if (trying && items.length === 0) signOutRef.current();
  }, [trying, items.length]);

  useEffect(() => {
    if (!trying) return;
    const timer = setTimeout(() => setTrying(false), SEND_WAIT_MS);
    return () => clearTimeout(timer);
  }, [trying]);

  const online = typeof navigator === "undefined" || navigator.onLine !== false;

  return (
    <DialogShell title="Unsent attendance" onClose={onCancel} busy={trying}>
      <p className="text-sm">{signOutWarning(items.length)}</p>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {signOutDetail(items.length)}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {sending && online && (
          <button
            type="button"
            className={TRAY_BUTTON}
            disabled={trying}
            onClick={() => {
              setTrying(true);
              void wakeOutbox();
            }}
          >
            {trying ? "Sending…" : "Send now"}
          </button>
        )}
        <button
          type="button"
          className={TRAY_BUTTON}
          disabled={trying}
          onClick={() => void downloadOutboxCsv(items)}
        >
          Export
        </button>
        <button
          type="button"
          disabled={trying}
          onClick={onSignOut}
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Sign out anyway
        </button>
      </div>
    </DialogShell>
  );
}
