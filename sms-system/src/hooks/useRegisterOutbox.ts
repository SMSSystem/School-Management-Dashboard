import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutboxEnabled } from "@/hooks/useOutboxSender";
import {
  outboxItems,
  type OutboxItem,
  type OutboxState,
} from "@/lib/offline/outboxStore";
import { onOutboxChange, startOutboxSender } from "@/lib/offline/outboxSender";
import type { RegisterCommand } from "@/lib/offline/registerCommands";

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
  const [items, setItems] = useState<OutboxItem[]>([]);
  const watched = useRef(
    new Map<string, { draftKey: string; snapshot: string }>(),
  );
  const onSentRef = useRef(onSent);
  useEffect(() => {
    onSentRef.current = onSent;
  });

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }
    startOutboxSender();
    let current = true;
    const refresh = () =>
      void outboxItems().then(
        (list) => {
          if (!current) return;
          setItems(list);
          const keys = new Set(list.map((item) => item.payload.targetKey));
          for (const [targetKey, { draftKey, snapshot }] of watched.current) {
            if (keys.has(targetKey)) continue;
            watched.current.delete(targetKey);
            onSentRef.current(draftKey, snapshot);
          }
        },
        () => undefined,
      );
    refresh();
    const stop = onOutboxChange(refresh);
    return () => {
      current = false;
      stop();
    };
  }, [enabled]);

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
      const list = byTarget.get(targetKey) ?? [];
      if (list.some((item) => item.state === "sending")) return "sending";
      return list.some((item) => item.state === "pending") ? "pending" : null;
    },
    [byTarget],
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
