import { lazy, Suspense } from "react";
import type { Role } from "@/types/people";
import { worksOffline } from "@/lib/offline/offlineStart";

// The header's place for the tray of unsent attendance (OutboxTray.tsx, slice C2). The tray and the outbox code are
// loaded on demand, only for staff who work offline, so the header stays small for everyone else.

const OutboxTray = lazy(() => import("@/components/attendance/OutboxTray"));

export default function HeaderOutbox({
  role,
  askSignOut,
  onCancelSignOut,
  onSignOut,
}: {
  role: Role | null | undefined;
  askSignOut: boolean;
  onCancelSignOut: () => void;
  onSignOut: () => void;
}) {
  if (!worksOffline(role)) return null;
  return (
    <Suspense fallback={null}>
      <OutboxTray
        askSignOut={askSignOut}
        onCancelSignOut={onCancelSignOut}
        onSignOut={onSignOut}
      />
    </Suspense>
  );
}
