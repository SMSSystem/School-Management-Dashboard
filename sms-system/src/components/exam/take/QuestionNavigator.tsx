import { forwardState, type NavigatorItem } from "@/lib/examTakeLogic";

// The numbered buttons that jump between questions (EXAMS_FEATURE_SPEC.md §4.5): answered, not answered, and
// flagged for review, with the current question outlined. The state is spoken in each button's label, not only
// shown by colour. In a forward-only exam every button but the current one is off (a question left cannot be reached again
// and one ahead is reached by Next), and each says so.
export default function QuestionNavigator({
  items,
  currentId,
  onSelect,
  forwardOnly = false,
}: {
  items: readonly NavigatorItem[];
  currentId: string | undefined;
  onSelect: (questionId: string) => void;
  forwardOnly?: boolean;
}) {
  const currentIndex = items.findIndex((item) => item.id === currentId);
  return (
    <nav aria-label="Questions">
      <ul className="flex flex-wrap gap-2">
        {items.map((item, itemIndex) => {
          const where = forwardOnly ? forwardState(itemIndex, currentIndex) : "current";
          const off = forwardOnly && where !== "current";
          const state = [
            item.answered ? "answered" : "not answered",
            item.flagged ? "flagged" : "",
            off ? (where === "left" ? "already left, you cannot go back" : "not reached yet") : "",
          ]
            .filter(Boolean)
            .join(", ");
          const colour = item.flagged
            ? "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700"
            : item.answered
              ? "bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-900/30 dark:text-sky-200 dark:ring-sky-700"
              : "bg-white text-gray-600 ring-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600";
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                disabled={off}
                aria-label={`Question ${item.number}, ${state}`}
                aria-current={item.id === currentId ? "true" : undefined}
                className={`h-9 w-9 rounded-md text-sm font-medium ring-1 ${colour} ${
                  item.id === currentId ? "outline outline-2 outline-offset-2 outline-sky-500" : ""
                } ${off ? "cursor-not-allowed opacity-60" : ""}`}
              >
                {item.number}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
