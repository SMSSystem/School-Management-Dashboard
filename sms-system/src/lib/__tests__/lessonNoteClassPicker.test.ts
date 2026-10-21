import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import NameCheckList from '../../components/forms/NameCheckList';
import classScopeRaw from '../../components/forms/subject/ClassScopeFields.tsx?raw';
import formRaw from '../../components/forms/LessonNoteForm.tsx?raw';
import targetsRaw from '../../components/forms/lessonNote/useNoteTargets.ts?raw';

// A lesson note's form lets the person tick several classes (it was one select). The checkbox list is shared with the
// subject form's "Specific Class(es)" list; the form stores the classes through classFieldsFor().

const lf = (s: string) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const form = lf(formRaw);
const classes = [{ id: 'a', name: 'Grade 1A' }, { id: 'b', name: 'Grade 1B' }];

describe('NameCheckList', () => {
  it('renders one checkbox per class, ticked for the selected ones', () => {
    const html = renderToStaticMarkup(createElement(NameCheckList, { classes, selectedIds: ['b'], onToggle: vi.fn() }));
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toMatch(/checked=""[^>]*\/>Grade 1B|checked=""\/?>Grade 1B/);
    expect(html).not.toMatch(/checked=""[^>]*\/>Grade 1A/);
  });

  it('is a labelled group when given a label, and a plain box otherwise', () => {
    const labelled = renderToStaticMarkup(createElement(NameCheckList, { classes, selectedIds: [], onToggle: vi.fn(), label: 'Classes' }));
    expect(labelled).toContain('role="group"');
    expect(labelled).toContain('aria-label="Classes"');
    expect(renderToStaticMarkup(createElement(NameCheckList, { classes, selectedIds: [], onToggle: vi.fn() }))).not.toContain('role=');
  });

  it('says so when there are no classes', () => {
    expect(renderToStaticMarkup(createElement(NameCheckList, { classes: [], selectedIds: [], onToggle: vi.fn() }))).toContain(
      'No classes found.',
    );
    expect(
      renderToStaticMarkup(createElement(NameCheckList, { classes: [], selectedIds: [], onToggle: vi.fn(), emptyText: 'None' })),
    ).toContain('None');
  });

  it('is what the subject form uses for its class list too', () => {
    expect(lf(classScopeRaw)).toContain('<NameCheckList classes={liveClasses} selectedIds={selectedClassIds} onToggle={toggleClass} />');
  });
});

describe('the lesson note form', () => {
  it('lists the classes as checkboxes and no longer has a single Class select or a classId field', () => {
    expect(form).toContain('<NameCheckList');
    expect(form).toContain('Classes (optional, up to {MAX_LESSON_NOTE_CLASSES})');
    expect(form).not.toContain('register("classId")');
    expect(form).not.toContain('classId: z.string()');
  });

  it('writes all four class fields on a create and removes all four on an update with none chosen', () => {
    expect(form).toContain('...(classFields ?? {}),');
    for (const f of ['classId', 'className', 'classIds', 'classNames']) {
      expect(form).toContain(`${f}: classFields ?`);
    }
    expect(form).toContain('classFields.classIds : deleteField()');
  });

  it('puts the class names in the audit entry and the first class as its target', () => {
    expect(form).toContain('classNames: classFields?.classNames,');
    expect(form).toContain('targetUid: classFields?.classId || noteId,');
  });

  it('refuses more classes and more subjects than the rules allow', () => {
    expect(form).toContain('selectedClassIds.length > MAX_LESSON_NOTE_CLASSES');
    expect(form).toContain('selectedSubjectIds.length > MAX_LESSON_NOTE_SUBJECTS');
  });

  it('lists the subjects as checkboxes too, and stores them like the classes', () => {
    expect(form).toContain('Subjects (optional, up to {MAX_LESSON_NOTE_SUBJECTS})');
    expect(form).toContain('label="Subjects"');
    expect(form).toContain('label="Classes"');
    expect(form).not.toContain('register("subjectId")');
    expect(form).toContain('...(subjectFields ?? {}),');
    for (const f of ['subjectId', 'subjectName', 'subjectIds', 'subjectNames']) {
      expect(form).toContain(`${f}: subjectFields ?`);
    }
    expect(form).toContain('subjectNames: subjectFields?.subjectNames,');
  });

  it('stays under the 600-line limit', () => {
    expect(form.split('\n').length).toBeLessThan(600);
  });
});

describe('the subjects and classes the lesson note form offers (useNoteTargets)', () => {
  const targets = lf(targetsRaw);

  it('is what the form takes its choices and selections from', () => {
    expect(form).toContain('useNoteTargets({ note: data, rawSubjects, allClasses, uid: user?.uid, isTeacherRole })');
  });

  it('offers the classes where any ticked subject is taught, and drops ticked classes that are no longer offered', () => {
    expect(targets).toContain('classOptionsForSubjects(chosenSubjects, taughtClasses)');
    expect(targets).toContain('setSelectedClassIds((prev) => prev.filter((cid) => allowed.has(cid)));');
  });

  it('stops a sixth subject and keeps a note\'s own subjects and classes selectable', () => {
    expect(targets).toContain('selectedSubjectIds.length < MAX_LESSON_NOTE_SUBJECTS');
    expect(targets).toContain('if (!list.some((x) => x.id === s.id)) list.push(s);');
    expect(targets).toContain('if (!list.some((x) => x.id === c.id)) list.push(c);');
  });
});

