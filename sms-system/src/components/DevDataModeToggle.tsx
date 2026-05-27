/**
 * DevDataModeToggle
 *
 * Dev-only floating badge that shows the active data mode and lets a developer
 * flip between mock data and blank data without a full rebuild.
 *
 * Precedence (highest → lowest):
 *   1. localStorage key 'sms_data_mode' ('mock' | 'live')  — session override
 *   2. VITE_USE_MOCK_DATA env var                           — per-environment default
 *
 * Changing the mode writes to localStorage and triggers a page reload so that
 * data.ts (a module evaluated once on load) picks up the new value.
 *
 * This component renders null in production builds (import.meta.env.DEV === false).
 */

import { useState } from 'react';

const DATA_MODE_KEY = 'sms_data_mode';
type DataMode = 'mock' | 'live';

function getActiveMode(): DataMode {
  const envDefault: DataMode =
    import.meta.env.VITE_USE_MOCK_DATA === 'true' ? 'mock' : 'live';
  const stored = localStorage.getItem(DATA_MODE_KEY) as DataMode | null;
  return stored ?? envDefault;
}

function getEnvDefault(): DataMode {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true' ? 'mock' : 'live';
}

const DevDataModeToggle = () => {
  if (!import.meta.env.DEV) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [mode] = useState<DataMode>(getActiveMode);
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

  const toggle = () => applyMode(mode === 'mock' ? 'live' : 'mock');

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-gray-900/90 text-white text-xs px-3 py-1.5 shadow-lg backdrop-blur-sm border border-gray-700 select-none"
      title={
        isOverridden
          ? `localStorage override active — env default is '${envDefault}'. Click ✕ to revert.`
          : `Using env default (VITE_USE_MOCK_DATA=${import.meta.env.VITE_USE_MOCK_DATA})`
      }
    >
      <span className="font-mono tracking-tight">
        {mode === 'mock' ? '🧪 MOCK DATA' : '📭 BLANK DATA'}
      </span>

      {isOverridden && (
        <span className="text-yellow-400 text-[10px] font-semibold uppercase tracking-wider">
          override
        </span>
      )}

      <button
        onClick={toggle}
        className="rounded-full bg-gray-700 hover:bg-gray-500 px-2 py-0.5 transition-colors cursor-pointer"
        title={`Switch to ${mode === 'mock' ? 'blank' : 'mock'} data`}
      >
        ↔ switch
      </button>

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
