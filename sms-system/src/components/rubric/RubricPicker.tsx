import { useId } from "react";
import type { FoundRubric } from "@/lib/rubricImportRead";
import {
  fileTitle,
  resolveTitle,
  type TitleChoice,
  type TitleState,
} from "@/lib/rubricTitles";

export type RubricPick = { include: boolean; title: TitleState };

const FIELD_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";

const criteriaCount = (count: number) =>
  `${count} ${count === 1 ? "criterion" : "criteria"}`;

/** One rubric found: whether to use it, and its title (D23). */
function FoundItem({
  found,
  index,
  count,
  fileName,
  pick,
  existing,
  disabled,
  onChange,
}: {
  found: FoundRubric;
  index: number;
  count: number;
  fileName: string;
  pick: RubricPick;
  existing: ReadonlySet<string>;
  disabled: boolean;
  onChange: (pick: RubricPick) => void;
}) {
  const id = useId();
  const fromFile = fileTitle(fileName, index, count);
  const title = resolveTitle(pick.title, found.heading, fromFile);
  const choose = (choice: TitleChoice) =>
    onChange({ ...pick, title: { ...pick.title, choice } });
  const options: { choice: TitleChoice; label: string; off?: boolean }[] = [
    {
      choice: "heading",
      label: found.heading
        ? `From the file: ${found.heading}`
        : "From the file: none found",
      off: !found.heading,
    },
    { choice: "file", label: `File name: ${fromFile}` },
    { choice: "typed", label: "Type a title" },
  ];
  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-200 p-3 dark:border-gray-700">
      {count > 1 ? (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={pick.include}
            disabled={disabled}
            onChange={(e) => onChange({ ...pick, include: e.target.checked })}
          />
          {found.source} · {criteriaCount(found.criteria.length)}
        </label>
      ) : (
        <p className="text-sm font-medium">
          {criteriaCount(found.criteria.length)} found
        </p>
      )}
      {pick.include && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs text-gray-500 dark:text-gray-300">
            Title
          </legend>
          {options.map(({ choice, label, off }) => (
            <label
              key={choice}
              className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300"
            >
              <input
                type="radio"
                name={id}
                checked={pick.title.choice === choice}
                disabled={disabled || off}
                onChange={() => choose(choice)}
              />
              <span className="break-words">{label}</span>
            </label>
          ))}
          {pick.title.choice === "typed" && (
            <input
              aria-label={`Title for ${found.source}`}
              value={pick.title.typed}
              maxLength={150}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...pick,
                  title: { ...pick.title, typed: e.target.value },
                })
              }
              className={FIELD_CLS}
            />
          )}
          {title && existing.has(title.toLowerCase()) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              A rubric with this title already exists. You can still save this
              one.
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}

// The rubrics found in a file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D18 and D23). With several, each has a tick and is
// saved as its own rubric; each has a title choice. The duplicate title check uses the list the page already holds.
export default function RubricPicker({
  found,
  fileName,
  picks,
  existingTitles,
  disabled,
  onChange,
}: {
  found: readonly FoundRubric[];
  fileName: string;
  picks: readonly RubricPick[];
  existingTitles: readonly string[];
  disabled: boolean;
  onChange: (index: number, pick: RubricPick) => void;
}) {
  const existing = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-600 dark:text-gray-300">
        {found.length > 1
          ? `The app found ${found.length} rubrics in this file. Choose the ones to keep; each is saved as its own rubric.`
          : "The app found a rubric in this file."}{" "}
        Only the grid is kept, not the file.
      </p>
      {found.map((item, index) => (
        <FoundItem
          key={`${index}:${item.source}`}
          found={item}
          index={index}
          count={found.length}
          fileName={fileName}
          pick={picks[index]}
          existing={existing}
          disabled={disabled}
          onChange={(pick) => onChange(index, pick)}
        />
      ))}
    </div>
  );
}
