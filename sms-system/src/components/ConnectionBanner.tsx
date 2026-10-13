import { useEffect, useSyncExternalStore } from "react";
import { WifiOff, X } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import {
  bannerVisible,
  dismissOffline,
  getConnectionState,
  setOffline,
  setOnline,
  subscribeConnection,
} from "@/lib/connectionStatus";

// A fixed banner shown when the app cannot reach its servers (lib/connectionStatus.ts
// explains the signals). Mounted in main.tsx OUTSIDE the auth gate, so it also shows on
// the login page, signed in or not. It makes no reads of its own.
const ConnectionBanner = () => {
  const state = useSyncExternalStore(subscribeConnection, getConnectionState, getConnectionState);

  useEffect(() => {
    const onOffline = () => setOffline();
    const onOnline = () => setOnline();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    // A query that succeeds means the server answered: the connection is back.
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success" && getConnectionState().offline) setOnline();
    });
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      unsubscribe();
    };
  }, []);

  if (!bannerVisible(state)) return null;

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-3 bg-orange-100 dark:bg-orange-900/90 border-b border-orange-300 dark:border-orange-700 px-4 py-2 text-sm text-orange-900 dark:text-orange-100"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>We can't reach the server. Check your internet connection: pages may not load and changes may not save.</span>
      <button
        type="button"
        onClick={dismissOffline}
        className="ml-2 rounded p-1 hover:bg-orange-200 dark:hover:bg-orange-800"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ConnectionBanner;
