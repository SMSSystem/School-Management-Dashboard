import { useId } from "react";
import { RUBRIC_FILE_CONFIRMATION } from "@/lib/rubricFileKinds";
import type { RubricSheet } from "@/lib/rubricFile";

// What a teacher must see and confirm before a rubric file is saved (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D13). The
// whole file is stored and students and parents can download it, and the app can't tell whether it holds student data, so this
// asks. A workbook with more than one sheet, or a hidden one, lists them, because a mark sheet beside a rubric is easy to forget.
export default function RubricFileConfirm({
  sheets,
  confirmed,
  disabled,
  onChange,
}: {
  sheets: readonly RubricSheet[];
  confirmed: boolean;
  disabled: boolean;
  onChange: (confirmed: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      {sheets.length > 0 && (
        <div className="rounded-md border border-amber-300 p-2 text-xs text-amber-700 dark:border-amber-700 dark:text-amber-300">
          <p className="font-medium">
            This workbook has {sheets.length} sheet
            {sheets.length === 1 ? "" : "s"}, and everyone who downloads it gets
            all of them. Check each one:
          </p>
          <ul className="mt-1 list-disc pl-4">
            {sheets.map((sheet, i) => (
              <li key={`${i}:${sheet.name}`}>
                {sheet.name}
                {sheet.hidden ? " (hidden)" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <label
        htmlFor={id}
        className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300"
      >
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0"
          checked={confirmed}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{RUBRIC_FILE_CONFIRMATION}</span>
      </label>
    </div>
  );
}
