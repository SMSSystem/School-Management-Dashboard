// The Back and Next buttons at the foot of an Academic Year wizard step. The last step has Back and Publish instead
// (BackButton alone). The ids are what the product tour points at.

const BACK_CLS =
  "rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800";
const NEXT_CLS = "rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600";

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button id="tour-academic-calendar-wizard-back" type="button" onClick={onClick} className={BACK_CLS}>
      ← Back
    </button>
  );
}

export function WizardStepNav({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="mt-6 flex gap-3">
      <BackButton onClick={onBack} />
      <button id="tour-academic-calendar-wizard-next" type="button" onClick={onNext} className={NEXT_CLS}>
        Next →
      </button>
    </div>
  );
}
