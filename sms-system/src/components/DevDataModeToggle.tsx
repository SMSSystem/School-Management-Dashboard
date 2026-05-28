/**
 * DevDataModeToggle
 *
 * Dev-only floating badge that lets a developer select the active data mode
 * without a full rebuild. Three modes are available:
 *   🧪 Mock  — hardcoded fake data; zero Firestore reads
 *   📭 Blank — empty states; zero Firestore reads
 *   🔴 Live  — real Firestore queries; reads from production database
 *
 * Precedence (highest → lowest):
 *   1. localStorage key 'sms_data_mode_v2' ('mock' | 'blank' | 'live') — session override
 *   2. VITE_USE_MOCK_DATA env var                                        — per-environment default
 *
 * Changing the mode writes to localStorage and triggers a page reload so that
 * data.ts (a module evaluated once on load) picks up the new value.
 *
 * This component renders null in production builds (import.meta.env.DEV === false).
 */

import type { DataMode } from '@/lib/data';

const DATA_MODE_KEY = 'sms_data_mode_v2';
const _valid: DataMode[] = ['mock', 'blank', 'live'];

function getActiveMode(): DataMode {
  const envDefault: DataMode =
    import.meta.env.VITE_USE_MOCK_DATA === 'true' ? 'mock' : 'blank';
  const stored = localStorage.getItem(DATA_MODE_KEY);
  const override =
    stored && (_valid as string[]).includes(stored) ? (stored as DataMode) : null;
  return override ?? envDefault;
}

function getEnvDefault(): DataMode {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true' ? 'mock' : 'blank';
}

const DevDataModeToggle = () => {
  if (!import.meta.env.DEV) return null;

  const mode = getActiveMode();
  const isOverridden = localStorage.getItem(DATA_MODE_KEY) !== null;
  const envDefault = getEnvDefault();

  const applyMode = (next: DataMode) => {
    localStorage.setItem(DATA_MODE_KEY, next);
    window.location.reload();
  };

  const clearOverride = () => {
    localStorage.removeItem(DATA_MODE_KEY);
    window.location.reload();
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-gray-900/90 text-white text-xs px-3 py-1.5 shadow-lg backdrop-blur-sm border border-gray-700 select-none"
      title={
        isOverridden
          ? `localStorage override active — env default is '${envDefault}'. Click ✕ to revert.`
          : `Using env default (VITE_USE_MOCK_DATA=${import.meta.env.VITE_USE_MOCK_DATA})`
      }
    >
      <select
        value={mode}
        onChange={(e) => applyMode(e.target.value as DataMode)}
        className="bg-transparent text-white text-xs font-mono tracking-tight cursor-pointer outline-none"
      >
        <option value="mock">🧪 Mock Data</option>
        <option value="blank">📭 Blank Data</option>
        <option
          value="live"
          title="Queries production Firestore — consumes real quota"
        >
          🔴 Live Data
        </option>
      </select>

      {isOverridden && (
        <span className="text-yellow-400 text-[10px] font-semibold uppercase tracking-wider">
          override
        </span>
      )}

      {isOverridden && (
        <button
          onClick={clearOverride}
          className="text-gray-400 hover:text-white transition-colors cursor-pointer"
          title={`Clear override — revert to env default ('${envDefault}')`}
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default DevDataModeToggle;
