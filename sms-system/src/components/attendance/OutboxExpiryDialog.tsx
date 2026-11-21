import DialogShell from "@/components/DialogShell";
import type { OutboxItem } from "@/lib/offline/outboxStore";
import { downloadOutboxCsv, registerLabel } from "@/lib/offline/outboxExport";
import { discardItem, sendAnyway } from "@/lib/offline/outboxActions";
import { TRAY_BUTTON } from "./OutboxPanel";

// Register saves that weren't sent within 7 days (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C2).
// They stopped sending on their own, so a week-old mark can't overwrite newer work, and nothing is deleted until the
// person chooses. A device clock set ahead only brings this dialog early.

export default function OutboxExpiryDialog({
  items,
  sending,
  onClose,
}: {
  items: OutboxItem[];
  sending: boolean;
  onClose: () => void;
}) {
  return (
    <DialogShell title="Attendance not sent" onClose={onClose}>
      <p className="text-sm">
        These registers were saved on this device more than 7 days ago and
        haven't been sent. Export them to keep a copy, then send or discard each
        one.
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.opId}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span className="font-medium">{registerLabel(item)}</span>
            <span className="flex gap-2">
              {sending && item.state !== "conflict" && (
                <button
                  type="button"
                  className={TRAY_BUTTON}
                  onClick={() => void sendAnyway(item)}
                >
                  Send anyway
                </button>
              )}
              <button
                type="button"
                className={TRAY_BUTTON}
                onClick={() => void discardItem(item)}
              >
                Discard
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button
          type="button"
          className={TRAY_BUTTON}
          onClick={() => void downloadOutboxCsv(items)}
        >
          Export
        </button>
      </div>
    </DialogShell>
  );
}
