import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ClassCheckList from '../../components/forms/ClassCheckList';
import classScopeRaw from '../../components/forms/subject/ClassScopeFields.tsx?raw';
import formRaw from '../../components/forms/LessonNoteForm.tsx?raw';

// A lesson note's form lets the person tick several classes (it was one select). The checkbox list is shared with the
// subject form's "Specific Class(es)" list; the form stores the classes through classFieldsFor().

const lf = (s: string) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const form = lf(formRaw);
const classes = [{ id: 'a', name: 'Grade 1A' }, { id: 'b', name: 'Grade 1B' }];

describe('ClassCheckList', () => {
  it('renders one checkbox per class, ticked for the selected ones', () => {
    const html = renderToStaticMarkup(createElement(ClassCheckList, { classes, selectedIds: ['b'], onToggle: vi.fn() }));
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toMatch(/checked=""[^>]*\/>Grade 1B|checked=""\/?>Grade 1B/);
    expect(html).not.toMatch(/checked=""[^>]*\/>Grade 1A/);
  });

  it('says so when there are no classes', () => {
    expect(renderToStaticMarkup(createElement(ClassCheckList, { classes: [], selectedIds: [], onToggle: vi.fn() }))).toContain(
      'No classes found.',
    );
    expect(
      renderToStaticMarkup(createElement(ClassCheckList, { classes: [], selectedIds: [], onToggle: vi.fn(), emptyText: 'None' })),
    ).toContain('None');
  });

  it('is what the subject form uses for its class list too', () => {
    expect(lf(classScopeRaw)).toContain('<ClassCheckList classes={liveClasses} selectedIds={selectedClassIds} onToggle={toggleClass} />');
  });
});

describe('the lesson note form', () => {
  it('lists the classes as checkboxes and no longer has a single Class select or a classId field', () => {
    expect(form).toContain('<ClassCheckList');
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

  it('refuses more classes than the rules allow, and drops classes a new subject no longer allows', () => {
    expect(form).toContain('selectedClassIds.length > MAX_LESSON_NOTE_CLASSES');
    expect(form).toContain('setSelectedClassIds((prev) => prev.filter((id) => allowed.has(id)));');
  });

  it('stays under the 600-line limit', () => {
    expect(form.split('\n').length).toBeLessThan(600);
  });
});
