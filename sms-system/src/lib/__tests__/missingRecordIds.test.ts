import { describe, expect, it } from 'vitest';
import { NO_RECORD_ID_MESSAGE } from '../formMessages';
import { readSourceTexts } from '../../../scripts/readSourcesLogic.mjs';

// Thirteen Add/Edit forms logged "no string ID (mock mode)" (or "no UID available") with console.log and silently
// returned when asked to update a record that had no id, so the Update button looked broken. They show a message now
// (hooks in components/forms/MissingRecordNotice.tsx), and no console.log is left in the app.

const lf = (s: string) => s.split('\r\n').join('\n');

describe('no console.log is left in the app', () => {
  const sources = readSourceTexts(['src']);
  const app = [...sources].filter(([file]) => !file.includes('/src/dev/') && !file.includes('/__tests__/') && !/\.test\.tsx?$/.test(file));

  it('(the scan sees the app)', () => {
    expect(app.length).toBeGreaterThan(300);
  });

  it('outside the dev-only mock folder and the tests', () => {
    const found = app.filter(([, text]) => /console\.log\(/.test(text)).map(([file]) => file.slice(file.indexOf('/src/') + 1));
    expect(found).toEqual([]);
  });
});

describe('a form opened to update a record that has no id', () => {
  const FORMS = [
    'AssignmentForm', 'ClassForm', 'DisciplinaryActionForm', 'ExamForm', 'FeedbackCommentForm', 'InstitutionAdminForm', 'ParentForm',
    'ResultForm', 'RubricForm', 'StudentForm', 'SubjectForm', 'TeacherForm', 'TimetableSlotForm',
  ];
  const sources = readSourceTexts(['src/components/forms']);
  const formSource = (name: string) => lf([...sources].find(([file]) => file.endsWith(`/forms/${name}.tsx`))![1]);

  it.each(FORMS)('%s shows a message instead of logging and doing nothing', (name) => {
    const text = formSource(name);
    expect(text).toContain('const missingId = useMissingRecordNotice();');
    expect(text).toContain('missingId.show();');
    expect(text).toContain('{missingId.notice}');
    expect(text).not.toContain('console.log');
  });

  it('says what to do', () => {
    expect(NO_RECORD_ID_MESSAGE).toBe("This record has no id, so it can't be updated. Close the form and try again.");
  });
});
