import { describe, expect, it } from 'vitest';
import hookRaw from '../../hooks/useOwnTeacherProfile.ts?raw';
import resultFormRaw from '../../components/forms/ResultForm.tsx?raw';
import feedbackFormRaw from '../../components/forms/FeedbackCommentForm.tsx?raw';
import lessonNoteFormRaw from '../../components/forms/LessonNoteForm.tsx?raw';

// What was left between the Result and Feedback Comment forms after their pickers were shared, and the lesson note
// form's two identical file rows: the signed-in person's own department and name are read by one hook, the pickers take
// the record itself, and the file list uses one FileRow. (Browser comparison: result-feedback-forms-dom.spec.ts for a
// regular and a senior teacher, 20 captures, and lesson-note-form-dom.spec.ts, 6 captures, identical before and after.)

const lf = (s: string) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const hook = lf(hookRaw);
const forms = { ResultForm: lf(resultFormRaw), FeedbackCommentForm: lf(feedbackFormRaw) };
const lessonNote = lf(lessonNoteFormRaw);

describe('useOwnTeacherProfile', () => {
  it('reads the signed-in person\'s own users document once and reports a failure', () => {
    expect(hook).toContain('getDoc(doc(db, "users", user.uid))');
    expect(hook).toContain('setDepartmentId(snap.data().departmentId ?? "");');
    expect(hook).toContain('setTeacherName(snap.data().name ?? "");');
    expect(hook).toContain('onLoadError("your profile")');
    expect(hook).toContain('if (!user?.uid) return;');
    expect(hook).toContain('}, [user?.uid]);');
  });
});

describe('the Result and Feedback Comment forms', () => {
  it.each(Object.entries(forms))('%s takes the department and name from the hook and passes the record to the pickers', (_name, text) => {
    expect(text).toContain('const { departmentId, teacherName } = useOwnTeacherProfile();');
    expect(text).not.toContain('setDepartmentId');
    expect(text).not.toContain('setTeacherName');
    expect(text).toMatch(/<ScopePickers[\s\S]*?\n {10}data=\{data\}\n/);
    expect(text).not.toContain('defaults={{');
  });

  it('the Result form still reads the institution\'s grading system, in its own effect', () => {
    expect(forms.ResultForm).toContain('getDoc(doc(db, "institutions", institutionId))');
    expect(forms.ResultForm).toContain('onLoadError("the grading system")');
  });
});

describe('the lesson note form file list', () => {
  it('uses one FileRow for the files already attached and the ones just added', () => {
    expect((lessonNote.match(/<FileRow /g) ?? []).length).toBe(2);
    expect(lessonNote).toContain('function FileRow({ file, onRemove }');
    expect(lessonNote).toContain('aria-label={`Remove ${file.fileName}`}');
    expect(lessonNote).toContain('onRemove={() => setKeptIds((prev) => prev.filter((id) => id !== f.id))}');
    expect(lessonNote).toContain('onRemove={() => setAdded((prev) => prev.filter((x) => x.id !== f.id))}');
  });
});
