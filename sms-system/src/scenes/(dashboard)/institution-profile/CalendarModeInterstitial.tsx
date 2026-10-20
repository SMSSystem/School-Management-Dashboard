import { useState } from 'react';
import { setCalendarMode } from '@/lib/institutionProfileSave';
import { CALENDAR_MODE_OPTIONS } from '@/lib/institutionProfileLogic';

// Shown once, before Step 1, only when institution.calendarMode is still
// unset — meaning the super_admin skipped the onboarding choice
// (InstitutionForm.tsx's primary path always writes it). Deliberately not a
// numbered WizardStep: it's a gate passed through at most once, not
// something the admin navigates back to. Writes calendarMode immediately
// via its own write (not deferred to saveProfile()) so a mid-wizard
// refresh can't lose the choice and re-prompt.
export function CalendarModeInterstitial({
  institutionId,
  onChosen,
}: {
  institutionId: string;
  onChosen: () => Promise<void>;
}) {
  const [saving, setSaving] = useState<'academic_year' | 'custom' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (mode: 'academic_year' | 'custom') => {
    setSaving(mode);
    setError(null);
    try {
      await setCalendarMode(institutionId, mode);
      await onChosen();
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(null);
    }
  };

  return (
    <div className="w-full p-4 sm:p-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
        How is your academic calendar structured?
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        A one-time choice made when your institution was set up. It decides how terms and classes
        work across the platform.
      </p>
      <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:p-6 flex flex-col gap-3">
        {CALENDAR_MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={saving !== null}
            onClick={() => void choose(opt.value)}
            className="flex flex-col items-start gap-1 rounded-md border border-gray-200 dark:border-gray-700 p-4 text-left transition hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {saving === opt.value ? 'Saving…' : opt.label}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{opt.description}</span>
          </button>
        ))}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
