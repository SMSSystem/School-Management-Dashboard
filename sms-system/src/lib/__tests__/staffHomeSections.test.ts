import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The administrator's Home and the spectator's Home repeated the overdue alert, the four head-count cards and the two
// charts (31 duplicated lines). They share components/StaffHomeSections.tsx now; the tour ids belong to the
// administrator's page alone. There is no QA spectator account, so the spectator's Home cannot be opened in a browser
// (the administrator's was compared before and after with a local production-bundle Playwright capture, home-structure-dom, which is not part of the repository: identical); this
// renders what can be rendered here and pins how each page uses the sections.

vi.mock('../../components/AttendanceChart', () => ({ default: () => null }));
vi.mock('../../components/CountChart', () => ({ default: () => null }));
vi.mock('../../components/UserCard', () => ({ default: ({ type }: { type: string }) => createElement('i', { 'data-card': type }) }));

const { HomeCell, MetricCardsRow, OverdueRegisterAlert, ChartsRow } = await import('../../components/StaffHomeSections');
const adminRaw = (await import('../../scenes/(dashboard)/admin/index.tsx?raw')).default;
const spectatorRaw = (await import('../../scenes/(dashboard)/spectator/index.tsx?raw')).default;

const lf = (s: string) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const ALERT_CLASS =
  'rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 px-4 py-2.5 text-sm text-orange-800 dark:text-orange-300';
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('OverdueRegisterAlert', () => {
  it('renders nothing when no register is overdue', () => {
    expect(html(createElement(OverdueRegisterAlert, { count: 0 }))).toBe('');
  });

  it('is the administrator\'s alert, with its two tour ids', () => {
    expect(html(createElement(OverdueRegisterAlert, { count: 3, tour: true }))).toBe(
      `<div class="col-span-12"><div id="tour-home-overdue-alert" class="${ALERT_CLASS}"><span class="font-medium">3 register slots</span> overdue today. <a id="tour-home-overdue-alert-link" href="/dashboard/attendance/general" class="underline">View register →</a></div></div>`,
    );
  });

  it('is the spectator\'s alert, the same without ids, and says "slot" for one', () => {
    expect(html(createElement(OverdueRegisterAlert, { count: 1 }))).toBe(
      `<div class="col-span-12"><div class="${ALERT_CLASS}"><span class="font-medium">1 register slot</span> overdue today. <a href="/dashboard/attendance/general" class="underline">View register →</a></div></div>`,
    );
  });
});

describe('the rows', () => {
  it('HomeCell is a div with the given class around its card', () => {
    expect(html(createElement(HomeCell, { className: 'col-span-12 lg:col-span-6 h-full', children: 'card' }))).toBe('<div class="col-span-12 lg:col-span-6 h-full">card</div>');
  });

  it('the head-count row has the four cards in order and the administrator\'s id only with tour', () => {
    const withTour = html(createElement(MetricCardsRow, { tour: true }));
    const without = html(createElement(MetricCardsRow, {}));
    expect(withTour.startsWith('<div id="tour-home-user-card-row" class="col-span-12 grid grid-cols-12 gap-4">')).toBe(true);
    expect(without.startsWith('<div class="col-span-12 grid grid-cols-12 gap-4">')).toBe(true);
    expect([...withTour.matchAll(/data-card="(\w+)"/g)].map((m) => m[1])).toEqual(['student', 'teacher', 'parent', 'class']);
    expect((withTour.match(/col-span-12 sm:col-span-6 xl:col-span-3/g) ?? []).length).toBe(4);
  });

  it('the chart row has the attendance id only with tour', () => {
    expect(html(createElement(ChartsRow, { tour: true }))).toContain('id="tour-home-attendance-chart" class="col-span-12 lg:col-span-8 h-[clamp(22rem,45vh,32rem)]"');
    expect(html(createElement(ChartsRow, {}))).not.toContain('tour-home');
    expect(html(createElement(ChartsRow, {}))).toContain('<div class="col-span-12 lg:col-span-4 h-[clamp(22rem,45vh,32rem)]">');
  });
});

describe('the two pages', () => {
  const admin = lf(adminRaw);
  const spectator = lf(spectatorRaw);

  it('the administrator\'s Home passes tour to the three shared sections', () => {
    expect(admin).toContain('<OverdueRegisterAlert count={overdueCount} tour />');
    expect(admin).toContain('<MetricCardsRow tour />');
    expect(admin).toContain('<ChartsRow tour />');
  });

  it('the spectator\'s Home uses them without tour ids and keeps its own cards', () => {
    expect(spectator).toContain('<OverdueRegisterAlert count={overdueCount} />');
    expect(spectator).toContain('<MetricCardsRow />');
    expect(spectator).toContain('<ChartsRow />');
    expect(spectator).not.toContain('tour');
    expect(spectator).toContain('<SpectatorQuickLinks />');
    expect(spectator).toContain('<AwaitingSignInCard includeSpectators={false} />');
  });
});
