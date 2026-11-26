import { useEffect, useState, useSyncExternalStore } from "react";
import {
  browserOnline,
  getConnectionState,
  subscribeConnection,
} from "@/lib/connectionStatus";

/**
 * Online as the connection banner sees it: the browser says so and the app last reached its servers. Used by the
 * offline idle lock and the update notice.
 */
export function useDeviceOnline(): boolean {
  const state = useSyncExternalStore(
    subscribeConnection,
    getConnectionState,
    getConnectionState,
  );
  const [browser, setBrowser] = useState(browserOnline);
  useEffect(() => {
    const update = () => setBrowser(browserOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return browser && !state.offline;
}
