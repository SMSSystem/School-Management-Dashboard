import { useCallback, useEffect, useMemo, useRef } from "react";
import { useOutboxEnabled } from "@/hooks/useOutboxSender";
import { useOutboxItems } from "@/hooks/useOutboxItems";
import type { OutboxItem, OutboxState } from "@/lib/offline/outboxStore";
import { startOutboxSender } from "@/lib/offline/outboxSender";
import type { RegisterCommand } from "@/lib/offline/registerCommands";
import {
  isExpired,
  sentDrafts,
  type WatchedDraft,
} from "@/lib/offline/outboxPolicy";

// The outbox as a register page sees it (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C): whether it is
// on for this institution, each register's state, the unsent changes a new save is compared with, and the items that
// need the person (a clash or a refusal). A page keeps its draft until its item is sent, so queued marks stay on screen;
// `watch` then clears the draft once the item is gone, unless it was edited after the save.

const waiting = (state: OutboxState) =>
  state === "pending" || state === "sending";

export function useRegisterOutbox(
  onSent: (draftKey: string, snapshot: string) => void,
) {
  const enabled = useOutboxEnabled();
  const { items, at } = useOutboxItems(enabled);
  const watched = useRef(new Map<string, WatchedDraft>());
  const onSentRef = useRef(onSent);
  useEffect(() => {
    onSentRef.current = onSent;
  });

  useEffect(() => {
    if (enabled) startOutboxSender();
  }, [enabled]);

  // After each read of the outbox (`at` changes), clear the drafts whose saves have gone.
  useEffect(() => {
    if (at === 0) return;
    for (const { draftKey, snapshot } of sentDrafts(watched.current, items))
      onSentRef.current(draftKey, snapshot);
  }, [items, at]);

  const byTarget = useMemo(() => {
    const map = new Map<string, OutboxItem[]>();
    for (const item of items) {
      const list = map.get(item.payload.targetKey) ?? [];
      list.push(item);
      map.set(item.payload.targetKey, list);
    }
    return map;
  }, [items]);

  /** "sending", "pending" (saved on this device) or null, for a register's Save button. */
  const stateOf = useCallback(
    (targetKey: string): "sending" | "pending" | null => {
      // An expired item is no longer sent on its own: the button doesn't say it's on its way (the tray asks instead).
      const list = (byTarget.get(targetKey) ?? []).filter(
        (item) => !isExpired(item, at),
      );
      if (list.some((item) => item.state === "sending")) return "sending";
      return list.some((item) => item.state === "pending") ? "pending" : null;
    },
    [byTarget, at],
  );

  /** This person's unsent changes for a register, oldest first: a new save is compared with them. */
  const pendingFor = useCallback(
    (targetKey: string): RegisterCommand[] =>
      (byTarget.get(targetKey) ?? [])
        .filter((item) => waiting(item.state))
        .map((item) => item.payload.command),
    [byTarget],
  );

  /** Clears the page's draft for this register once its queued save has gone, unless the draft changed meanwhile. */
  const watch = useCallback(
    (targetKey: string, draftKey: string, snapshot: string) => {
      watched.current.set(targetKey, { draftKey, snapshot });
    },
    [],
  );

  const problems = useMemo(
    () => items.filter((item) => !waiting(item.state)),
    [items],
  );

  return { enabled, stateOf, pendingFor, watch, problems };
}

export type RegisterOutbox = ReturnType<typeof useRegisterOutbox>;
