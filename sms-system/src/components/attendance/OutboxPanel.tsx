import { useEffect, useState } from "react";
import DialogShell from "@/components/DialogShell";
import type { OutboxItem } from "@/lib/offline/outboxStore";
import {
  clashNameOf,
  downloadOutboxCsv,
  needsAttention,
  registerLabel,
  statusLabel,
} from "@/lib/offline/outboxExport";
import { isExpired } from "@/lib/offline/outboxPolicy";
import { discardItem, sendAnyway } from "@/lib/offline/outboxActions";
import { wakeOutbox } from "@/lib/offline/outboxSender";
import { ConflictDialog } from "./OutboxNotices";

// The header tray's panel (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C2): every register this person
// has saved on this device and not yet sent, across all registers, with what can be done about each.

export const TRAY_BUTTON =
  "rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";

/**
 * Discard, in two clicks: the first asks "Discard for good?", the second deletes. After a sign-in the register page's
 * draft is gone, so a discarded save can't be got back. It asks again from scratch after 5 seconds.
 */
export function ConfirmDiscardButton({ item }: { item: OutboxItem }) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => setAsking(false), 5000);
    return () => clearTimeout(timer);
  }, [asking]);
  return (
    <button
      type="button"
      className={
        asking
          ? "rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
          : TRAY_BUTTON
      }
      onClick={() => (asking ? void discardItem(item) : setAsking(true))}
    >
      {asking ? "Discard for good?" : "Discard"}
    </button>
  );
}

/** Sends an expired save anyway (it stopped sending on its own at 7 days). Shared by the panel and the expiry dialog. */
export function SendAnywayButton({ item }: { item: OutboxItem }) {
  return (
    <button
      type="button"
      className={TRAY_BUTTON}
      onClick={() => void sendAnyway(item)}
    >
      Send anyway
    </button>
  );
}

/** Saves these items as a CSV the person keeps. Shared by the panel ("Export all") and the expiry dialog ("Export"). */
export function ExportButton({
  items,
  label,
}: {
  items: OutboxItem[];
  label: string;
}) {
  return (
    <button
      type="button"
      className={TRAY_BUTTON}
      onClick={() => void downloadOutboxCsv(items)}
    >
      {label}
    </button>
  );
}

function ItemActions({
  item,
  now,
  sending,
  onChoose,
}: {
  item: OutboxItem;
  now: number;
  sending: boolean;
  onChoose: (item: OutboxItem) => void;
}) {
  const expired = isExpired(item, now);
  return (
    <span className="flex gap-2">
      {item.state === "conflict" && (
        <button
          type="button"
          className={TRAY_BUTTON}
          onClick={() => onChoose(item)}
        >
          Choose marks
        </button>
      )}
      {expired && sending && item.state !== "conflict" && (
        <SendAnywayButton item={item} />
      )}
      {(needsAttention(item, now) || !sending) && (
        <ConfirmDiscardButton item={item} />
      )}
    </span>
  );
}

export default function OutboxPanel({
  items,
  now,
  sending,
  onClose,
}: {
  items: OutboxItem[];
  now: number;
  sending: boolean;
  onClose: () => void;
}) {
  const [choosing, setChoosing] = useState<OutboxItem | null>(null);
  if (choosing)
    return (
      <ConflictDialog
        item={choosing}
        label={registerLabel(choosing)}
        nameOf={clashNameOf(choosing)}
        onClose={() => setChoosing(null)}
      />
    );
  return (
    <DialogShell title="Unsent attendance" onClose={onClose}>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {sending
          ? "These registers are saved on this device, encrypted, and are sent when the connection allows."
          : "Sending is turned off for your school. Export or discard these."}
      </p>
      {items.length === 0 ? (
        <p className="text-sm">Everything has been sent.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.opId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
            >
              <span className="flex flex-col">
                <span className="font-medium">{registerLabel(item)}</span>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {statusLabel(item, now)}
                </span>
              </span>
              <ItemActions
                item={item}
                now={now}
                sending={sending}
                onChoose={setChoosing}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {sending && items.length > 0 && (
          <button
            type="button"
            className={TRAY_BUTTON}
            onClick={() => void wakeOutbox()}
          >
            Send now
          </button>
        )}
        {items.length > 0 && <ExportButton items={items} label="Export all" />}
      </div>
    </DialogShell>
  );
}
