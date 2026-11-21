// What a person can do with an outbox item that waits for them (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md,
// slice C): settle a clash, discard a save, or send an expired one anyway (slice C2). The register page's notices (components/attendance/
// OutboxNotices.tsx) call these, and the sender is woken to send what they queue.

import {
  OUTBOX_KEEP_MS,
  enqueueSave,
  putItem,
  removeItem,
  type OutboxItem,
} from "./outboxStore";
import { resolveClashes } from "./registerCommands";
import { wakeOutbox } from "./outboxSender";

/**
 * Settles a clash: students kept as "mine" are queued again with what the other device wrote as their base, so they
 * apply over it; students kept as "theirs" are dropped. The new item is never folded into an older one for the same
 * register, whose older base would make the same students clash again.
 */
export async function resolveConflict(
  item: OutboxItem,
  keep: Record<string, "mine" | "theirs">,
): Promise<void> {
  const command = resolveClashes(item.payload.clash ?? {}, keep);
  const {
    kind,
    institutionId,
    docId,
    targetKey,
    fields,
    actor,
    audit,
    summary,
  } = item.payload;
  if (Object.keys(command.changes).length > 0)
    await enqueueSave(
      {
        kind,
        institutionId,
        docId,
        targetKey,
        fields,
        actor,
        audit,
        summary,
        command,
        markedAt: Date.now(),
      },
      Date.now(),
      { fold: false },
    );
  await removeItem(item.opId);
  void wakeOutbox();
}

/** Drops a refused save. Its marks stay in the page's draft, so nothing typed is lost. */
export async function discardItem(item: OutboxItem): Promise<void> {
  await removeItem(item.opId);
  void wakeOutbox();
}

/** Sends an expired save after all: it gets another 7 days and is tried at once (slice C2). */
export async function sendAnyway(
  item: OutboxItem,
  now = Date.now(),
): Promise<void> {
  await putItem({
    ...item,
    state: "pending",
    expiresAt: now + OUTBOX_KEEP_MS,
    nextAttemptAt: now,
  });
  void wakeOutbox();
}
