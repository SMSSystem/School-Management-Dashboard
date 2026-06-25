import type { CardComponentProps } from "nextstepjs";

const TourCard = ({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) => {
  const isLast = currentStep + 1 === totalSteps;
  const progressPct = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="min-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-xl">
      <div className="p-5 flex flex-col gap-3">
        <div className="h-1 bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              backgroundColor: "var(--brand-button-bg, #0284c7)",
            }}
          />
        </div>

        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 leading-snug">
          {step.title}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          {step.content}
        </p>

        <div className="flex items-center justify-between pt-1">
          {skipTour ? (
            <button
              onClick={skipTour}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Skip Tour
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={prevStep}
                className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                ← Prev
              </button>
            )}
            <button
              onClick={nextStep}
              className="px-4 py-1.5 text-sm text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
            >
              {isLast ? "Finish Tour" : "Next →"}
            </button>
          </div>
        </div>
      </div>

      {arrow}
    </div>
  );
};

export default TourCard;
