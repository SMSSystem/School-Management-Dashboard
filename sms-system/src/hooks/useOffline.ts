import { useDeviceOnline } from "@/hooks/useDeviceOnline";

/**
 * Whether the app can't reach the server right now: the browser says it's offline, or lib/connectionStatus.ts last
 * failed to reach the servers. The inverse of useDeviceOnline, named for the places that ask "are we offline?"
 * (register Save buttons and notices, the Grade dialog).
 */
export function useOffline(): boolean {
  return !useDeviceOnline();
}
