import { useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { worksOffline } from "@/lib/offline/offlineStart";

/** Whether register saves go through the outbox (slice C): staff who work offline, where a super admin turned it on. */
export function useOutboxEnabled(): boolean {
  const { role, institution } = useAuth();
  return worksOffline(role) && institution?.offlineOutbox === true;
}

/**
 * Starts the outbox sender from any page, loaded on demand (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md,
 * slice C): after a reload, a teacher with unsent saves may not open a register again that day.
 */
export function useOutboxSender(): void {
  const enabled = useOutboxEnabled();
  useEffect(() => {
    if (enabled)
      void import("@/lib/offline/outboxSender").then((m) =>
        m.startOutboxSender(),
      );
  }, [enabled]);
}
