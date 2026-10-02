// Which fields of a record an edit form actually changed, for the audit entry's
// `detail` ("Updated phone, class for Jane Doe"). Field NAMES only: audit
// entries are permanent, so old/new values are deliberately never recorded.

export const FIELD_LABELS: Record<string, string> = {
  firstName: 'first name',
  lastName: 'last name',
  email: 'email',
  phone: 'phone',
  phone2: 'second phone',
  idNumber: 'ID number',
  institutionStudentId: 'student ID',
  dateOfBirth: 'date of birth',
  gender: 'gender',
  classId: 'class',
  houseId: 'house',
  departmentId: 'department',
  assignedClassId: 'homeroom class',
  homeroomRoom: 'homeroom room',
  homeroomBuilding: 'homeroom building',
  subjects: 'subjects',
  linkedStudents: 'linked students',
};

// undefined, null, "" and an empty array are all "empty"; strings are trimmed;
// Firestore Timestamps and Dates compare by millisecond value; arrays compare
// as a set (order and duplicates ignored). The result is always comparable
// with ===.
function normalise(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    return JSON.stringify([...new Set(v.map((x) => normalise(x)))].sort());
  }
  if (typeof v === 'object' && 'toMillis' in v && typeof (v as { toMillis: unknown }).toMillis === 'function') {
    return (v as { toMillis(): number }).toMillis();
  }
  return v;
}

// The profile fields each edit form changes: what its audit entry reports on.
// Kept here (not in the forms) so a test can check each against the shape of the
// row that form is opened with.
export const STUDENT_EDIT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'phone2',
  'idNumber',
  'institutionStudentId',
  'dateOfBirth',
  'gender',
  'classId',
  'houseId',
];

export const PARENT_EDIT_FIELDS = ['firstName', 'lastName', 'email', 'phone'];

// A senior teacher's form also edits the homeroom fields. Subject assignments are
// reported separately by the form (they live on the subject documents).
export function teacherEditFields(senior: boolean): string[] {
  return [
    'firstName',
    'lastName',
    'phone',
    'departmentId',
    ...(senior ? ['assignedClassId', 'homeroomRoom', 'homeroomBuilding'] : []),
  ];
}

// The parents list shows a missing phone as an em dash and hands that to the form.
export const parentPhoneNormalizer = (canonicalize: (v: string) => string) => (v: string) =>
  canonicalize(v === '—' ? '' : v);

export type DiffOptions = {
  // Applied to a string field's value on BOTH sides before comparing. A phone
  // number needs this: the forms rewrite a stored bare NANP number to
  // +1-XXX-XXX-XXXX on submit, so comparing the raw stored value with the
  // submitted one would report "phone" on an unrelated save.
  normalizers?: Record<string, (value: string) => string>;
};

function prepared(v: unknown, field: string, options: DiffOptions | undefined): unknown {
  const fn = options?.normalizers?.[field];
  return normalise(typeof v === 'string' && fn ? fn(v) : v);
}

// The labels of the listed fields whose value differs between `before` (what the
// list row passed to the form) and `after` (what is being submitted). A field the
// row does not carry counts as changed only when `after` has a value for it.
export function diffChangedFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  fields: string[],
  options?: DiffOptions,
): string[] {
  return fields
    .filter((f) => prepared(before?.[f], f, options) !== prepared(after[f], f, options))
    .map((f) => FIELD_LABELS[f] ?? f);
}

// "Updated phone, class for Jane Doe" (empty string when nothing changed).
export function describeProfileEdit(changed: string[], targetName: string): string {
  return changed.length > 0 ? `Updated ${changed.join(', ')} for ${targetName}` : '';
}
