import { describe, expect, it } from 'vitest';
import pageRaw from '../../scenes/(dashboard)/list/lesson-notes/index.tsx?raw';

// The Lesson Notes table must not squeeze: long names, classes and teachers are cut to one line with a tooltip,
// the Content icons keep their room, and the Subject column shows only while the Subject dropdown does not.
// Source-text pins, like the other page guards.

const page = pageRaw.split('\r\n').join('\n');

describe('the Lesson Notes table', () => {
  it('has the Subject column only when the Subject dropdown is not shown, from one shared condition', () => {
    expect(page).toContain('const hasSubjectFilter = subjects.length > 1;');
    expect(page).toContain('columns(!hasSubjectFilter)');
    expect(page).toContain('{!hasSubjectFilter && (');
    expect(page).toContain('{hasSubjectFilter && (');
    expect(page).not.toContain('subjects.length > 1 &&');
  });

  it('cuts Name, Class, Subject and Teacher to one line and keeps the full text as a tooltip', () => {
    for (const field of ['item.name', 'classLabel(item)', 'subjectLabel(item)', 'item.teacherName']) {
      expect(page, field).toContain(`title={${field}}`);
    }
    expect(page.match(/<div className="truncate"/g)?.length).toBe(4);
    expect(page.match(/max-w-0/g)?.length).toBe(4);
  });

  it('keeps the Content icons on one line with room before the action buttons', () => {
    expect(page).toContain('<td className="whitespace-nowrap pr-6">{contentIcons(item)}</td>');
  });

  it('still shows the subject on a phone card', () => {
    const card = page.slice(page.indexOf('const renderCard'));
    // One chip per subject now (a note can have several).
    expect(card).toContain('noteSubjectNames(item).map((name) => (');
  });
});
