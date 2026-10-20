import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import NamedSelect from '../../components/NamedSelect';
import gradebookFiltersRaw from '../../scenes/(dashboard)/list/gradebook/GradebookFilters.tsx?raw';
import resultsPageRaw from '../../scenes/(dashboard)/list/results/index.tsx?raw';

// The Gradebook's term, class and subject dropdowns and the Results page's class, subject and term dropdowns were
// six hand-written <select>s. They are NamedSelect now, each page passing its own class string and its own onChange.
// The browser comparison (every <select> on both pages at four states for the Brookfield administrator and both
// teachers, identical before and after) is prod-bundle-e2e/class-subject-filters-dom.spec.ts.

const lf = (s: string) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const props = {
  value: 'c1',
  onChange: vi.fn(),
  options: [{ id: 'c1', name: '5A' }, { id: 'c2', name: '5B' }],
  placeholder: 'Select class',
  className: 'a b',
};

describe('NamedSelect', () => {
  it('renders the class string, the placeholder option and one option per record', () => {
    const html = renderToStaticMarkup(createElement(NamedSelect, props));
    expect(html).toBe('<select class="a b"><option value="">Select class</option><option value="c1" selected="">5A</option><option value="c2">5B</option></select>');
  });

  it('can be disabled', () => {
    expect(renderToStaticMarkup(createElement(NamedSelect, { ...props, disabled: true }))).toContain('<select class="a b" disabled="">');
  });
});

describe('the two pages', () => {
  it('the Gradebook filters use it for term, class and subject, with the cascade (a term or class change clears the subject)', () => {
    const text = lf(gradebookFiltersRaw);
    expect((text.match(/<NamedSelect/g) ?? []).length).toBe(3);
    expect(text).not.toContain('<select');
    expect(text).toContain('disabled={role === "senior_teacher"}');
    expect(text).toContain('disabled={!selectedClassId}');
    expect(text).toMatch(/setSelectedTermId\(termId\);\s*setSelectedSubjectId\(""\);/);
    expect(text).toMatch(/setSelectedClassId\(classId\);\s*setSelectedSubjectId\(""\);/);
  });

  it('the Results filters use it for class, subject and term, with the same rules', () => {
    const text = lf(resultsPageRaw);
    expect((text.match(/<NamedSelect/g) ?? []).length).toBe(3);
    expect(text).not.toContain('<select');
    expect(text).toContain('disabled={role === "senior_teacher"}');
    expect(text).toMatch(/placeholder="All Subjects"/);
    expect(text).toMatch(/placeholder="All Terms"/);
    expect(text).toMatch(/setSelectedClassId\(classId\);\s*setSelectedSubjectId\(""\);/);
  });
});
