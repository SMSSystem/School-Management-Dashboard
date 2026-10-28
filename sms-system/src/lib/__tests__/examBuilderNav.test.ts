import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BuilderStrip from '../../components/exam/builder/BuilderStrip';
import pageRaw from '../../scenes/(dashboard)/list/exams/build/index.tsx?raw';
import { activeIndex, firstNewId, idAfterDelete, indexOfId, questionLabel, stepId } from '../examBuilderNav';

// Which question the builder shows, and where the choice goes after an edit; the strip above the editor; how the page uses
// them.

const norm = (s: string) => s.split('\r\n').join('\n');
const page = norm(pageRaw);
const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('finding the chosen question', () => {
  it('knows where an id is, and that it is not', () => {
    expect(indexOfId(list, 'c')).toBe(2);
    expect(indexOfId(list, 'zzz')).toBe(-1);
    expect(indexOfId(list, null)).toBe(-1);
    expect(indexOfId(list, undefined)).toBe(-1);
    expect(indexOfId([], 'a')).toBe(-1);
  });

  it('shows the first question when none is chosen or the chosen one is gone', () => {
    expect(activeIndex(list, 'c')).toBe(2);
    expect(activeIndex(list, null)).toBe(0);
    expect(activeIndex(list, 'gone')).toBe(0);
    expect(activeIndex([], 'a')).toBe(0);
  });

  it('follows a question that was moved, because it is chosen by id', () => {
    const moved = [list[0], list[2], list[1], list[3]];
    expect(activeIndex(moved, 'c')).toBe(1);
  });
});

describe('stepping', () => {
  it('goes one question on or back, and stops at the ends', () => {
    expect(stepId(list, 'b', 1)).toBe('c');
    expect(stepId(list, 'b', -1)).toBe('a');
    expect(stepId(list, 'a', -1)).toBe('a');
    expect(stepId(list, 'd', 1)).toBe('d');
  });

  it('starts from the first question when none is chosen, and gives nothing for an empty list', () => {
    expect(stepId(list, null, 1)).toBe('b');
    expect(stepId([], 'a', 1)).toBeNull();
  });
});

describe('after a delete', () => {
  it('shows the question that took its place, else the one before', () => {
    expect(idAfterDelete(list, 'b')).toBe('c');
    expect(idAfterDelete(list, 'a')).toBe('b');
    expect(idAfterDelete(list, 'd')).toBe('c');
  });

  it('shows nothing when the last question goes, and the first when the id was not there', () => {
    expect(idAfterDelete([{ id: 'only' }], 'only')).toBeNull();
    expect(idAfterDelete(list, 'gone')).toBe('a');
    expect(idAfterDelete([], 'gone')).toBeNull();
  });
});

describe('after a copy or an import', () => {
  it('chooses the copy the list gained', () => {
    const after = [list[0], list[1], { id: 'copy' }, list[2], list[3]];
    expect(firstNewId(list, after)).toBe('copy');
  });

  it('chooses the first question an import brought, appended or replacing', () => {
    expect(firstNewId(list, [...list, { id: 'n1' }, { id: 'n2' }])).toBe('n1');
    expect(firstNewId(list, [{ id: 'n1' }, { id: 'n2' }])).toBe('n1');
  });

  it('chooses nothing when nothing is new', () => {
    expect(firstNewId(list, list)).toBeNull();
    expect(firstNewId(list, [])).toBeNull();
  });
});

describe('how a question is named', () => {
  it('is its first words on one line', () => {
    expect(questionLabel({ text: 'What is 2 + 2?' })).toBe('What is 2 + 2?');
    expect(questionLabel({ text: '  Which\n\nplanet   is closest?  ' })).toBe('Which planet is closest?');
  });

  it('is cut at 40 characters, and says when there is no text yet', () => {
    const long = 'a'.repeat(60);
    expect(questionLabel({ text: long })).toBe(`${'a'.repeat(40)}…`);
    expect(questionLabel({ text: 'x'.repeat(40) })).toBe('x'.repeat(40));
    expect(questionLabel({ text: '   ' })).toBe('(no text yet)');
    expect(questionLabel({ text: '' })).toBe('(no text yet)');
  });
});

describe('the strip', () => {
  const noop = () => undefined;
  const strip = (over: Partial<Parameters<typeof BuilderStrip>[0]> = {}) =>
    renderToStaticMarkup(createElement(BuilderStrip, { index: 2, total: 20, canAdd: true, onPrevious: noop, onNext: noop, onAdd: noop, ...over }));

  it('sticks to the top with an opaque background, and says where the editor is', () => {
    const html = strip();
    expect(html).toContain('sticky top-0 z-20');
    expect(html).toContain('bg-white');
    expect(html).toContain('Question 3 of 20');
    expect(html).toContain('aria-live="polite"');
  });

  it('has Previous, Next and Add question, with big buttons below md', () => {
    const html = strip();
    expect(html).toContain('>Previous<');
    expect(html).toContain('>Next<');
    expect(html).toContain('Add question');
    expect(html.match(/min-h-11 md:min-h-0/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('turns Previous off on the first question and Next off on the last', () => {
    expect(strip({ index: 0 })).toMatch(/<button[^>]*disabled=""[^>]*>Previous/);
    expect(strip({ index: 19 })).toMatch(/<button[^>]*disabled=""[^>]*>Next/);
    expect(strip()).not.toMatch(/<button[^>]*disabled=""[^>]*>(Previous|Next)/);
  });

  it('turns Add off at the limit, and leaves it out when the exam cannot be changed', () => {
    expect(strip({ total: 100, index: 5 })).toMatch(/<button[^>]*disabled=""[^>]*>[^]*Add question/);
    expect(strip({ canAdd: false })).not.toContain('Add question');
  });

  it('has nothing but Add for an empty exam', () => {
    const html = strip({ total: 0, index: 0 });
    expect(html).not.toContain('Previous');
    expect(html).not.toContain('Question 1 of 0');
    expect(html).toContain('Add question');
  });
});

describe('the page', () => {
  it('shows one editor, chosen by id, with the strip above it', () => {
    expect(page).toContain('const [activeId, setActiveId] = useState<string | null>(null);');
    expect(page).toContain('const at = activeIndex(draft, activeId);');
    expect(page).toContain('<BuilderStrip');
    expect(page).not.toContain('draft.map((question');
    expect(page.match(/<QuestionEditor/g)).toHaveLength(1);
    expect(page).toContain('key={question.id}');
  });

  it('chooses the new question after an add, the neighbour after a delete, the copy after a duplicate and the first imported after an import', () => {
    expect(page).toContain('setActiveId(added.id);');
    expect(page).toContain('setActiveId(idAfterDelete(draft, pendingDelete.id));');
    expect(page).toContain('setActiveId(firstNewId(draft, after) ?? question.id);');
    expect(page).toContain('setActiveId(firstNewId(draft, merged.questions) ?? activeId);');
  });

  it('keeps the moved question chosen', () => {
    expect(page).toContain('b.setDraft((list) => moveQuestion(list, at, delta));\n              setActiveId(question.id);');
  });

  it('is marked, so the strip can stick', () => {
    expect(page).toContain('<div data-exam-builder');
  });
});
