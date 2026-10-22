// The look of the Create / Edit / Duplicate exam form: the same as the Edit Student Details form (StudentForm.tsx): a
// label above each field, bordered inputs with a focus ring, and the fields flowing four to a row from the large screen
// (two from the medium one, one on a phone) inside titled sections. The shared InputField and
// TermSubjectClassTeacherFields components take `variant="roomy"` to use these; every other form keeps its own look.

export const ROOMY_FIELD_CLS = "flex flex-col gap-1 w-full";
export const ROOMY_LABEL_CLS = "text-sm font-medium text-gray-700 dark:text-gray-200";
export const ROOMY_INPUT_CLS =
  "mt-0.5 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400 disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-800";

/** An item that takes the whole row of a section's grid. */
export const FULL_ROW_CLS = "col-span-1 md:col-span-2 lg:col-span-4";

/** The grid inside a section. */
export const SECTION_GRID_CLS = "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4";

export type FieldVariant = "default" | "roomy";
