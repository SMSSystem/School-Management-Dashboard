import DialogShell from "@/components/DialogShell";
import { PRIMARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { submitHint, type NavigatorItem } from "@/lib/examTakeLogic";
import QuestionNavigator from "./QuestionNavigator";

const LEGEND = [
  { label: "Answered", swatch: "bg-sky-100 ring-1 ring-sky-300 dark:bg-sky-900/30 dark:ring-sky-700" },
  { label: "Not answered", swatch: "bg-white ring-1 ring-gray-300 dark:bg-gray-800 dark:ring-gray-600" },
  { label: "Flagged", swatch: "bg-amber-100 ring-1 ring-amber-300 dark:bg-amber-900/30 dark:ring-amber-700" },
  { label: "This question", swatch: "bg-white outline outline-2 outline-sky-500 dark:bg-gray-800" },
];

// The list of the questions as a sheet from the bottom of the screen, for the carousel layout, where a hundred numbered
// buttons in the page would push the question away: how many are answered and flagged, the numbered buttons to jump to a
// question (answered, not answered, flagged and current, in words as well as colour), and Submit. In a forward-only exam it
// only shows where the student is: the buttons stay off. It is an overlay inside the page, so opening it is not leaving it.
export default function QuestionSheet({
  items,
  currentId,
  forwardOnly,
  timeUp,
  unanswered,
  onSelect,
  onSubmit,
  onClose,
}: {
  items: readonly NavigatorItem[];
  currentId: string | undefined;
  forwardOnly: boolean;
  timeUp: boolean;
  unanswered: number;
  onSelect: (questionId: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const flagged = items.filter((item) => item.flagged).length;
  return (
    <DialogShell title="Questions" onClose={onClose} sheet>
      <p className="text-sm font-medium">
        {items.length - unanswered} of {items.length} answered{flagged > 0 && ` · ${flagged} flagged`}
      </p>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300" aria-label="What the numbers mean">
        {LEGEND.map((entry) => (
          <li key={entry.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-3.5 w-3.5 rounded ${entry.swatch}`} aria-hidden="true" />
            {entry.label}
          </li>
        ))}
      </ul>

      <QuestionNavigator
        items={items}
        currentId={currentId}
        forwardOnly={forwardOnly}
        disabled={timeUp}
        large
        onSelect={(id) => {
          onSelect(id);
          onClose();
        }}
      />

      {forwardOnly && <p className="text-xs text-gray-500 dark:text-gray-400">Questions you have left cannot be opened again.</p>}

      <div className="flex flex-col gap-1 border-t border-gray-200 pt-3 dark:border-gray-700">
        {unanswered > 0 && (
          <p id="sheet-submit-hint" className="text-xs text-gray-500 dark:text-gray-400">
            {submitHint(unanswered)}
          </p>
        )}
        <button
          type="button"
          disabled={unanswered > 0 || timeUp}
          aria-describedby={unanswered > 0 ? "sheet-submit-hint" : undefined}
          onClick={() => {
            onClose();
            onSubmit();
          }}
          className={`${PRIMARY_BUTTON_CLS} min-h-11 justify-center`}
          style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        >
          Submit exam
        </button>
      </div>
    </DialogShell>
  );
}
