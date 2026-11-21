import { useEffect, useState } from "react";
import { outboxItems, type OutboxItem } from "@/lib/offline/outboxStore";
import { onOutboxChange } from "@/lib/offline/outboxSender";
import { offlineSession, onOfflineSession } from "@/lib/offline/offlineStore";
import { nextExpiry } from "@/lib/offline/outboxPolicy";

// This person's outbox items, kept current (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C): read again
// whenever the outbox changes, in this tab or another, and when the person's key arrives at sign-in. Shared by the
// register pages (useRegisterOutbox) and the header's tray (components/attendance/OutboxTray.tsx).

export type OutboxSnapshot = {
  items: OutboxItem[];
  /** When the list was read, for expiry: the clock is read here, not while rendering. 0 until the first read. */
  at: number;
  /** Whether the person's key was available, so an empty list means nothing is waiting. */
  ready: boolean;
};

const NOTHING: OutboxSnapshot = { items: [], at: 0, ready: false };
/** setTimeout's limit is about 24.8 days; a longer wait just looks again sooner. */
const LONGEST_TIMER_MS = 2 ** 31 - 1;

export function useOutboxItems(active: boolean): OutboxSnapshot {
  const [snapshot, setSnapshot] = useState<OutboxSnapshot>(NOTHING);

  useEffect(() => {
    if (!active) return;
    let current = true;
    const refresh = () =>
      void outboxItems().then(
        (items) => {
          if (current)
            setSnapshot({
              items,
              at: Date.now(),
              ready: offlineSession() !== null,
            });
        },
        () => undefined,
      );
    refresh();
    const stopChanges = onOutboxChange(refresh);
    const stopSession = onOfflineSession(refresh);
    return () => {
      current = false;
      stopChanges();
      stopSession();
    };
  }, [active]);

  // An item that passes its 7 days changes nothing in the outbox, so look again then, or the page would still show it
  // as waiting to send.
  const { items, at } = snapshot;
  useEffect(() => {
    if (!active || at === 0) return;
    const expires = nextExpiry(items, at);
    if (expires === null) return;
    const timer = setTimeout(
      () => setSnapshot((s) => ({ ...s, at: Date.now() })),
      Math.min(LONGEST_TIMER_MS, Math.max(0, expires - at) + 1000),
    );
    return () => clearTimeout(timer);
  }, [active, items, at]);

  return active ? snapshot : NOTHING;
}
