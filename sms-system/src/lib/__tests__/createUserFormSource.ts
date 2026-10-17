// The Create Account form as text, for the tests that pin what it does (they read source, like the
// other guard tests). The form is AdminCreateUserForm.tsx plus the files it hands its schema, its
// account creation, its lookups and its field groups to, so a test asks for the whole of it here
// instead of naming one file. Line endings are made "\n".

const files = import.meta.glob(
  [
    '../../components/forms/AdminCreateUserForm.tsx',
    '../../components/forms/createUser/*.{ts,tsx}',
    '../../lib/createUserSchema.ts',
    '../../lib/createUserDocument.ts',
    '../../lib/createUserAccount.ts',
    '../../hooks/useCreateUserOptions.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const norm = (s: string) => s.split('\r\n').join('\n');

/** One file of the form, by its path under src/ (for example "lib/createUserSchema.ts"). */
export function createUserFormFile(path: string): string {
  const text = files[`../../${path}`];
  if (typeof text !== 'string') throw new Error(`no Create Account form file ${path}`);
  return norm(text);
}

/** The form's main file and every file it hands work to, joined (the main file first). */
export const createUserFormSource: string = Object.keys(files)
  .sort((a, b) => (a.endsWith('/AdminCreateUserForm.tsx') ? -1 : b.endsWith('/AdminCreateUserForm.tsx') ? 1 : a.localeCompare(b)))
  .map((k) => norm(files[k]))
  .join('\n');
