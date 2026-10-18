// The assignment form as text, for the tests that pin what it does (they read source, like the other guard
// tests). The form is AssignmentForm.tsx plus the files it hands its rules, reads, saving and field groups to,
// so a test asks for the whole of it here instead of naming one file. The libs and the hook come first and the
// form itself last, because one test pins the order of the save sequence (upload, then add or update, then
// removing the replaced file) before the form's own `onClose?.()`. Line endings are made "\n".

const files = import.meta.glob(
  [
    '../assignmentFormLogic.ts',
    '../assignmentFormSave.ts',
    '../../hooks/useAssignmentFormOptions.ts',
    '../../components/forms/assignment/*.{ts,tsx}',
    '../../components/forms/AssignmentForm.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const norm = (s: string) => s.split('\r\n').join('\n');
const last = (k: string) => (k.endsWith('/AssignmentForm.tsx') ? 1 : 0);

/** The form and every file of it, joined (the form itself last). */
export const assignmentFormSource: string = Object.keys(files)
  .sort((a, b) => last(a) - last(b) || a.localeCompare(b))
  .map((k) => norm(files[k]))
  .join('\n');
