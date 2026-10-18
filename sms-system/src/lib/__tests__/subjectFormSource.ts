// The subject form as text, for the tests that pin what it does (they read source, like the other guard tests).
// The form is SubjectForm.tsx plus the files it hands its rules, enrolment state, saving and field groups to, so
// a test asks for the whole of it here instead of naming one file. The libs and the hook come first and the form
// itself last, because one test reads the text from `async function writeEnrollments` up to the form's
// `const onSubmit`. Line endings are made "\n".

const files = import.meta.glob(
  [
    '../subjectFormLogic.ts',
    '../subjectFormSave.ts',
    '../../hooks/useSubjectEnrollmentChoices.ts',
    '../../components/forms/subject/*.{ts,tsx}',
    '../../components/forms/SubjectForm.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const norm = (s: string) => s.split('\r\n').join('\n');
const last = (k: string) => (k.endsWith('/SubjectForm.tsx') ? 1 : 0);

/** The form and every file of it, joined (the form itself last). */
export const subjectFormSource: string = Object.keys(files)
  .sort((a, b) => last(a) - last(b) || a.localeCompare(b))
  .map((k) => norm(files[k]))
  .join('\n');
