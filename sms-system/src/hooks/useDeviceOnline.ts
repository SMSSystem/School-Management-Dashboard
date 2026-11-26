import { useSyncExternalStore } from "react";
import {
  browserOnline,
  deviceOnline,
  subscribeConnection,
} from "@/lib/connectionStatus";

// React views of lib/connectionStatus.ts. The store notifies on its own changes and on the browser's online/offline
// events, so both stay current, including in a tab that started offline. Which one to use is explained there.

/**
 * Online as the connection banner sees it: the browser says so and the app last reached its servers. Used by what the
 * person sees and decides on: the offline idle lock, the Lock button, the update notice, Save buttons.
 */
export function useDeviceOnline(): boolean {
  return useSyncExternalStore(subscribeConnection, deviceOnline, deviceOnline);
}

/** Only the browser's opinion, for buttons that try the network anyway (sending unsent saves). */
export function useBrowserOnline(): boolean {
  return useSyncExternalStore(
    subscribeConnection,
    browserOnline,
    browserOnline,
  );
}
