import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import BuilderMoreMenu from '../../components/exam/builder/BuilderMoreMenu';
import BuilderToolbar from '../../components/exam/builder/BuilderToolbar';
import menuRaw from '../../components/exam/builder/BuilderMoreMenu.tsx?raw';
import toolbarRaw from '../../components/exam/builder/BuilderToolbar.tsx?raw';
import pageRaw from '../../scenes/(dashboard)/list/exams/build/index.tsx?raw';

// The builder toolbar on a phone: the count of questions that need attention, and the More menu that holds the secondary
// buttons. (Static rendering has no window, so it draws what a computer gets; the phone's choice is pinned in the source.)

const norm = (s: string) => s.split('\r\n').join('\n');
const menu = norm(menuRaw);
const toolbar = norm(toolbarRaw);
const page = norm(pageRaw);
const noop = () => undefined;

const render = (over: Partial<Parameters<typeof BuilderToolbar>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(BuilderToolbar, {
      title: 'Unit 3 Quiz',
      subtitle: '3A · Maths',
      statusLabel: 'Draft',
      questionCount: 3,
      totalPoints: 4,
      mode: 'full',
      dirty: false,
      busy: false,
      notice: null,
      actions: [],
      onSave: noop,
      onStatus: noop,
      getBlockers: () => [],
      extra: createElement('span', null, 'the desktop buttons'),
      phoneExtra: createElement('span', null, 'the More menu'),
      ...over,
    }),
  );

describe('the count of questions that need attention', () => {
  it('says how many, in the singular and the plural, as a button', () => {
    expect(render({ attention: 3, onShowAttention: noop })).toMatch(/<button[^>]*>3 questions need attention<\/button>/);
    expect(render({ attention: 1, onShowAttention: noop })).toMatch(/<button[^>]*>1 question needs attention<\/button>/);
  });

  it('is not there when nothing needs attention, or there is nothing to do about it', () => {
    expect(render({ attention: 0, onShowAttention: noop })).not.toContain('attention');
    expect(render({ attention: 2 })).not.toContain('attention');
  });

  it('sits beside Save and the unsaved note', () => {
    const html = render({ attention: 2, onShowAttention: noop, dirty: true });
    expect(html.indexOf('Unsaved changes')).toBeLessThan(html.indexOf('2 questions need attention'));
  });
});

describe('the buttons beside Save', () => {
  it('are the desktop ones on a computer', () => {
    const html = render();
    expect(html).toContain('the desktop buttons');
    expect(html).not.toContain('the More menu');
  });

  it('are swapped for the More menu on a phone, and the others stay', () => {
    expect(toolbar).toContain('const phone = useMediaQuery(MOBILE_QUERY);');
    expect(toolbar).toContain('{phone && phoneExtra ? phoneExtra : extra}');
    const html = render({ actions: [{ to: 'published', action: 'published', label: 'Publish' }] });
    expect(html).toContain('Save');
    expect(html).toContain('Publish');
  });

  it('put the status and the counts under the title on a phone and beside it from md up', () => {
    expect(render()).toContain('flex w-full flex-col items-start gap-1 text-sm md:w-auto md:items-end');
  });
});

describe('the More menu', () => {
  const items = [
    { label: 'Import from file', onClick: noop },
    { label: 'Preview as student', to: '/dashboard/list/exams/e1/preview' },
  ];
  const closed = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(BuilderMoreMenu, { items })));

  it('is one button, with 44 px, that says it opens a menu, and shows nothing else until it is pressed', () => {
    expect(closed).toContain('aria-haspopup="menu"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('min-h-11');
    expect(closed).toContain('More');
    expect(closed).not.toContain('role="menu"');
    expect(closed).not.toContain('Import from file');
  });

  it('is not there without items', () => {
    expect(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(BuilderMoreMenu, { items: [] })))).toBe('');
  });

  it('is a menu of items that are buttons or links, 44 px high, closed by Escape, a tap outside or choosing one', () => {
    expect(menu).toContain('role="menu"');
    expect(menu).toContain('role="menuitem"');
    expect(menu).toContain('e.key === "Escape"');
    expect(menu).toContain('document.addEventListener("pointerdown", outside);');
    expect(menu).toContain('onClick={() => setOpen(false)}');
    expect(menu).toContain('min-h-11');
  });
});

describe('the page', () => {
  it('puts Import, Preview and Results in the menu, Import only while the exam can be changed and Results only after a draft', () => {
    expect(page).toContain('phoneExtra={');
    expect(page).toContain('...(full ? [{ label: "Import from file"');
    expect(page).toContain('{ label: "Preview as student"');
    expect(page).toContain('exam.status !== undefined && exam.status !== "draft"');
    expect(page).toContain('label: "Results"');
  });

  it('shows the questions that need attention as a sheet on a phone and as the first one in the rail elsewhere', () => {
    expect(page).toContain('const showAttention = () => {');
    expect(page).toContain('setOnlyIssues(true);');
    expect(page).toContain('if (phone) setSheetOpen(true);');
    expect(page).toContain('attention={attention}');
    expect(page).toContain('onShowAttention={showAttention}');
  });

  it('keeps Preview as a link, so the unsaved-changes guard asks before it', () => {
    expect(menu).toContain('<Link key={item.label} to={item.to}');
  });
});
