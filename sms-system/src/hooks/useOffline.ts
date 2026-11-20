import { useSyncExternalStore } from "react";
import {
  getConnectionState,
  subscribeConnection,
} from "@/lib/connectionStatus";

const isOffline = () =>
  getConnectionState().offline ||
  (typeof navigator !== "undefined" && navigator.onLine === false);

/**
 * Whether the app can't reach the server right now: lib/connectionStatus.ts, or the browser itself (which covers a
 * tab that started offline, when no `offline` event fires).
 */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribeConnection, isOffline, isOffline);
}
