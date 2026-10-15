import { describe, expect, it } from 'vitest';
import { COMMENT_KEY } from '../commentKey';
import { CONDUCT_LABELS, conductLabel, feedbackCommentText } from '../feedbackComment';
import PageErrorBoundary from '../../components/PageErrorBoundary';
import feedbackRaw from '../../scenes/(dashboard)/list/feedback/index.tsx?raw';
import appRaw from '../../App.tsx?raw';
import disciplinaryRaw from '../../scenes/(dashboard)/disciplinary-actions/index.tsx?raw';
import registrationsRaw from '../../scenes/(dashboard)/registrations/index.tsx?raw';
import gradebookRaw from '../../scenes/(dashboard)/list/gradebook/index.tsx?raw';
import feedbackFormRaw from '../../components/forms/FeedbackCommentForm.tsx?raw';

// The Feedback page used to render `item.comment.length`, but the app's own writers store only
// commentNumbers + conductGrade, so any real feedback document crashed the page, and with no
// error boundary the whole app went blank. These pin the fix, plus the paging resets.

const norm = (s: string) => s.split('\r\n').join('\n');
const feedback = norm(feedbackRaw);
const app = norm(appRaw);

describe('feedbackCommentText', () => {
  it('builds the sentence from a comment number, with the first name and the subject', () => {
    const text = feedbackCommentText([1], 'Kemar Brown', 'Mathematics');
    expect(text).toBe(
      COMMENT_KEY[0]
        .split('{name_of_student}').join('Kemar')
        .split('{name_of_subject}').join('Mathematics')
        .split('{His_Her}').join('His/her')
        .split('{he_she}').join('he/she'),
    );
    expect(text).toContain('Kemar is a keen student');
    expect(text).toContain('Mathematics');
  });

  it('uses neutral pronouns, because the document has no gender', () => {
    expect(feedbackCommentText([12], 'Kemar Brown', 'Science')).toBe(
      "Kemar has done a satisfactory term's work. He/she has the potential to achieve great results.",
    );
  });

  it('joins several numbers in order', () => {
    const text = feedbackCommentText([10, 20], 'Ana Reid', 'Art');
    expect(text.endsWith('Needs individual attention.')).toBe(true);
    expect(text.startsWith('Ana demonstrates willingness')).toBe(true);
  });

  it('never throws: anything that is not a list of valid numbers gives nothing for those entries', () => {
    expect(feedbackCommentText(undefined)).toBe('');
    expect(feedbackCommentText(null)).toBe('');
    expect(feedbackCommentText('1,2')).toBe('');
    expect(feedbackCommentText([])).toBe('');
    expect(feedbackCommentText([0, 21, 2.5, '3', null])).toBe('');
    expect(feedbackCommentText([20, 99])).toBe('Needs individual attention.');
  });

  it('falls back to "The student" and "the subject" when they are missing', () => {
    expect(feedbackCommentText([8])).toContain('The student is capable');
  });
});

describe('conductLabel', () => {
  it('matches the report card key, passes an unknown code through and dashes an empty one', () => {
    expect(CONDUCT_LABELS).toEqual({ G: 'Good', S: 'Satisfactory', F: 'Fair', U: 'Unsatisfactory', P: 'Poor', D: 'Disruption' });
    expect(conductLabel('G')).toBe('G — Good');
    expect(conductLabel('X')).toBe('X');
    for (const v of ['', undefined, null, 5]) expect(conductLabel(v), String(v)).toBe('—');
  });
});

describe('the writers of feedback documents', () => {
  it('store comment numbers and conduct, never a comment sentence (so the page must not assume one)', () => {
    for (const raw of [gradebookRaw, feedbackFormRaw]) {
      const src = norm(raw);
      expect(src).toContain('commentNumbers');
      expect(src).not.toMatch(/feedback_comments[\s\S]{0,600}\n\s+comment:/);
    }
  });
});

describe('the Feedback page', () => {
  it('no longer reads the missing comment field unguarded', () => {
    expect(feedback).not.toContain('item.comment.length');
    expect(feedback).toContain('feedbackCommentText(commentNumbers, item.studentName, subjectName)');
    expect(feedback).toContain('item.comment ||');
  });

  it('resolves the term and subject names from the cached hooks, since the Gradebook stores no termName', () => {
    expect(feedback).toContain('useInstitutionTerms()');
    expect(feedback).toContain('useAllInstitutionSubjects()');
    expect(feedback).toContain('item.termName || ');
  });

  it('guards every displayed field so a malformed document cannot throw', () => {
    for (const f of ['studentName', 'className', 'teacherName']) expect(feedback).toContain(`item.${f} ?? "—"`);
    expect(feedback).toContain('conductLabel(item.conductGrade)');
  });

  it('keeps its single listener and the existing create, edit and delete actions', () => {
    expect(feedback.match(/onSnapshot\(/g)).toHaveLength(1);
    expect(feedback).toContain('table="feedback_comment" type="create"');
    expect(feedback).toContain('table="feedback_comment" type="update"');
    expect(feedback).toContain('table="feedback_comment" type="delete"');
  });
});

describe('PageErrorBoundary', () => {
  type State = { failed: boolean; key?: string };
  const derive = (props: { resetKey?: string }, state: State) =>
    (PageErrorBoundary as unknown as {
      getDerivedStateFromProps: (p: unknown, s: State) => Partial<State> | null;
    }).getDerivedStateFromProps({ children: null, ...props }, state);

  it('marks the page failed when a child throws', () => {
    expect((PageErrorBoundary as unknown as { getDerivedStateFromError: () => State }).getDerivedStateFromError()).toEqual({ failed: true });
  });

  it('keeps a failure while the route is the same, and clears it when the route changes', () => {
    expect(derive({ resetKey: '/a' }, { failed: true, key: '/a' })).toBeNull();
    expect(derive({ resetKey: '/b' }, { failed: true, key: '/a' })).toEqual({ key: '/b', failed: false });
    expect(derive({ resetKey: '/a' }, { failed: false })).toEqual({ key: '/a', failed: false });
  });

  it('is mounted inside the dashboard layout, around the routes, keyed by the path, so the sidebar survives a crash', () => {
    expect(app).toContain('import PageErrorBoundary from "@/components/PageErrorBoundary";');
    const layout = app.indexOf('<DashboardLayout>');
    const boundary = app.indexOf('<PageErrorBoundary resetKey={location.pathname}>');
    const routes = app.indexOf('<Routes>', boundary);
    expect(layout).toBeGreaterThan(0);
    expect(boundary).toBeGreaterThan(layout);
    expect(routes).toBeGreaterThan(boundary);
    expect(app.indexOf('</PageErrorBoundary>')).toBeGreaterThan(app.indexOf('</Routes>', routes));
    expect(app.indexOf('</PageErrorBoundary>')).toBeLessThan(app.indexOf('</DashboardLayout>'));
  });
});

describe('paging resets on a filter or search change', () => {
  it('Disciplinary Actions: the type chips and the search box return to page 1', () => {
    const src = norm(disciplinaryRaw);
    expect(src).toContain('setTypeFilter(t);\n                  setPage(1);');
    expect(src).toContain('setSearch(e.target.value);\n              setPage(1);');
  });

  it('Registrations: the status chips return to page 1', () => {
    expect(norm(registrationsRaw)).toContain('setStatusFilter(s);\n                setPage(1);');
  });
});
