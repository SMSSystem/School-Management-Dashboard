import { Component, type ErrorInfo, type ReactNode } from "react";
import { buildDescription } from "@/lib/appVersion";
import { deviceOnline } from "@/lib/connectionStatus";

/** What a page that can't load offline shows instead. */
function OfflinePage() {
  return (
    <div role="status" className="bg-white dark:bg-gray-800 p-6 rounded-md m-4 flex flex-col gap-3 items-start">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">This page needs the internet</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        The attendance registers work offline, from the menu. Other pages open again when you're back online.
      </p>
    </div>
  );
}

// Catches an error thrown while a page renders, so one broken page shows a short message inside
// the dashboard (sidebar and header stay) instead of blanking the whole app. `resetKey` is the
// current route: moving to another page clears the error.
type Props = { children: ReactNode; resetKey?: string };
type State = { failed: boolean; key?: string };

class PageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  // Remembers the route the current state belongs to; a different route clears a failure.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.key) return null;
    return { key: props.resetKey, failed: false };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`A page failed to render (${buildDescription()}):`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Offline, the usual cause is a page whose code isn't on this device: only the registers' code is kept for offline
    // use (lib/serviceWorker/precacheSelection.ts), so say that rather than "something went wrong".
    if (!deviceOnline()) return <OfflinePage />;
    return (
      <div role="alert" className="bg-white dark:bg-gray-800 p-6 rounded-md m-4 flex flex-col gap-3 items-start">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Something went wrong on this page</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          The rest of the app still works. Try reloading, or go back to the dashboard.
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">If you report this, include the version: {buildDescription()}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-md transition-colors"
          >
            Reload
          </button>
          <a
            href="/"
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm rounded-md transition-colors"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }
}

export default PageErrorBoundary;
