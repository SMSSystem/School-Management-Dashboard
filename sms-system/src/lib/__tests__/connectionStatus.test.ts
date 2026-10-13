import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OFFLINE_LOG_FRAGMENT,
  bannerVisible,
  dismissOffline,
  getConnectionState,
  isFirestoreOfflineLog,
  setOffline,
  setOnline,
  subscribeConnection,
} from '../connectionStatus';
import firebaseRaw from '../firebase.ts?raw';
import mainRaw from '../../main.tsx?raw';
import bannerRaw from '../../components/ConnectionBanner.tsx?raw';
import adminRaw from '../../scenes/(dashboard)/admin/index.tsx?raw';
import quickRaw from '../../components/AdminQuickActions.tsx?raw';
import chartRaw from '../../components/AttendanceChart.tsx?raw';

// The "can't reach the server" banner: the matcher for the Firestore SDK's message, the
// tiny store behind it, and where it is mounted. Also the small dashboard changes that
// shipped with it (attendance default, Log Attendance quick action).

const norm = (s: string) => s.split('\r\n').join('\n');
const SDK_MESSAGE =
  'Could not reach Cloud Firestore backend. Backend did not respond within 10 seconds.\nThis typically indicates that your device does not have a healthy Internet connection at the moment. The client will operate in offline mode until it is able to successfully connect to the backend.';

describe('isFirestoreOfflineLog', () => {
  it('matches the SDK message, and only strings that contain its stable part', () => {
    expect(isFirestoreOfflineLog(SDK_MESSAGE)).toBe(true);
    expect(isFirestoreOfflineLog(`[2026-10-14] @firebase/firestore: Firestore (12.15.0): ${SDK_MESSAGE}`)).toBe(true);
    expect(OFFLINE_LOG_FRAGMENT).toBe('Could not reach Cloud Firestore backend');
    for (const v of ['Missing or insufficient permissions.', '', null, undefined, 5, {}]) {
      expect(isFirestoreOfflineLog(v), String(v)).toBe(false);
    }
  });
});

describe('the connection store', () => {
  beforeEach(() => setOnline());

  it('shows after an outage starts, hides on dismiss, and clears when back online', () => {
    expect(bannerVisible(getConnectionState())).toBe(false);
    setOffline();
    expect(bannerVisible(getConnectionState())).toBe(true);
    dismissOffline();
    expect(bannerVisible(getConnectionState())).toBe(false);
    setOnline();
    expect(getConnectionState()).toEqual({ offline: false, dismissed: false });
  });

  it('keeps a dismissal during the same outage but shows again for a new one', () => {
    setOffline();
    dismissOffline();
    setOffline();
    expect(bannerVisible(getConnectionState())).toBe(false);
    setOnline();
    setOffline();
    expect(bannerVisible(getConnectionState())).toBe(true);
  });

  it('notifies subscribers only when the state changes, and stops after unsubscribe', () => {
    const fn = vi.fn();
    const off = subscribeConnection(fn);
    setOffline();
    setOffline();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    setOnline();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('wiring', () => {
  it('registers the SDK log hook once, at error level, where Firestore is created', () => {
    const firebase = norm(firebaseRaw);
    expect(firebase.match(/onLog\(/g)).toHaveLength(1);
    expect(firebase).toContain('if (isFirestoreOfflineLog(log.message)) setOffline();');
    expect(firebase).toContain("{ level: 'error' }");
  });

  it('mounts the banner at the root, before the auth-gated App, and listens to the browser events', () => {
    const main = norm(mainRaw);
    expect(main).toContain('<ConnectionBanner />');
    expect(main.indexOf('<ConnectionBanner />')).toBeLessThan(main.indexOf('<App />'));
    const banner = norm(bannerRaw);
    expect(banner).toContain('window.addEventListener("online"');
    expect(banner).toContain('window.addEventListener("offline"');
    expect(banner).toContain('getQueryCache().subscribe(');
    expect(banner).toContain('aria-label="Dismiss"');
  });
});

describe('small dashboard changes', () => {
  it('defaults the attendance card to the last 30 days', () => {
    expect(norm(chartRaw)).toContain('useState<View>("last-30-days")');
  });

  it('adds a Log Attendance quick action to the admin home', () => {
    const quick = norm(quickRaw);
    expect(quick).toContain('label: "Log Attendance"');
    expect(quick).toContain('href: "/dashboard/attendance/general"');
    expect(norm(adminRaw)).toContain('<AdminQuickActions />');
  });
});
