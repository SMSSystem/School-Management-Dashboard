// What a person can do with an outbox item that waits for them (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md,
// slice C): settle a clash, or discard a refused save. The register page's notices (components/attendance/
// OutboxNotices.tsx) call these, and the sender is woken to send what they queue.

import { enqueueSave, removeItem, type OutboxItem } from "./outboxStore";
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
