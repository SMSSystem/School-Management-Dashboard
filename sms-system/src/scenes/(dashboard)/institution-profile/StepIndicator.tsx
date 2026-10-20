import { STEP_LABELS, type WizardStep } from '@/lib/institutionProfileLogic';

export function StepIndicator({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center gap-1 mb-6 flex-wrap">
      {STEP_LABELS.map((label, i) => {
        const num = i + 1;
        const active = num === step;
        const done = num < step;
        return (
          <div key={num} className="flex items-center gap-1">
            <div
              className={[
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                done
                  ? 'bg-sky-500 text-white'
                  : active
                  ? 'bg-sky-100 text-sky-700 ring-2 ring-sky-500 dark:bg-sky-900/40 dark:text-sky-300'
                  : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
              ].join(' ')}
            >
              {done ? '✓' : num}
            </div>
            <span
              className={[
                'hidden sm:block text-xs',
                active
                  ? 'text-sky-700 font-semibold dark:text-sky-400'
                  : done
                  ? 'text-gray-500 dark:text-gray-400'
                  : 'text-gray-400 dark:text-gray-500',
              ].join(' ')}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={[
                  'mx-1 h-px w-4 shrink-0',
                  done ? 'bg-sky-400' : 'bg-gray-200 dark:bg-gray-700',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
