import { Component, lazy, Suspense, type ReactNode } from "react";
import { reportError } from "@/lib/reportError";
import type { Role } from "@/types/people";
import { worksOffline } from "@/lib/offline/offlineStart";

// The header's place for the tray of unsent attendance (OutboxTray.tsx, slice C2). The tray and the outbox code are
// loaded on demand, only for staff who work offline, so the header stays small for everyone else.

const OutboxTray = lazy(() => import("@/components/attendance/OutboxTray"));

/**
 * The header sits outside every page's error boundary, so a tray that fails to load (a chunk gone after a deploy, or
 * the connection lost before it loaded) must show nothing rather than take the whole app down. The work stays on the
 * device either way; the tray comes back at the next page load.
 */
class QuietBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error, { what: "the unsent attendance tray", quiet: true });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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
    <QuietBoundary>
      <Suspense fallback={null}>
        <OutboxTray
          askSignOut={askSignOut}
          onCancelSignOut={onCancelSignOut}
          onSignOut={onSignOut}
        />
      </Suspense>
    </QuietBoundary>
  );
}
