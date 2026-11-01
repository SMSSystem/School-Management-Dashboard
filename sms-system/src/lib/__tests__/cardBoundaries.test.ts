import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import CardErrorBoundary from '../../components/CardErrorBoundary';
import { buildDescription } from '../appVersion';
import { findUnwrappedCards } from '../../../scripts/cardBoundaryLogic.mjs';
import { buildStaticGraph } from '../../../scripts/bundleGraphLogic.mjs';

// A dashboard card that throws while rendering (a chart given a document shape it does not expect)
// used to replace the whole page with PageErrorBoundary's "Something went wrong on this page". Each
// card now sits in a CardErrorBoundary, so only that card is replaced by a short message.

const cards = (code: string) => findUnwrappedCards(new Map([['src/Page.tsx', code]])).map((c) => c.name);
const IMPORTS = 'import UserCard from "@/components/UserCard";\nimport { Quick } from "@/components/Quick";\nimport CardErrorBoundary from "@/components/CardErrorBoundary";\nimport { Link } from "react-router-dom";\n';

describe('CardErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders its children as they are while nothing fails, with no wrapper of its own', () => {
    const boundary = new CardErrorBoundary({ children: 'the card' });
    expect(boundary.render()).toBe('the card');
  });

  it("shows a short alert in the card's place after an error, and logs it", () => {
    expect(CardErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const boundary = new CardErrorBoundary({ children: 'the card' });
    boundary.state = CardErrorBoundary.getDerivedStateFromError();
    const out = boundary.render() as ReactElement<{ role: string; children: string }>;
    expect(out.props.role).toBe('alert');
    expect(out.props.children).toBe("This section couldn't be shown.");

    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('bad data');
    boundary.componentDidCatch(error, { componentStack: '\n at UserCard' });
    expect(log).toHaveBeenCalledWith(`A dashboard card failed to render (${buildDescription()}):`, error, '\n at UserCard');
  });
});

describe('the card scanner', () => {
  it('finds a card outside a boundary', () => {
    expect(cards(`${IMPORTS}export const P = () => <div><UserCard type="student" /></div>;`)).toEqual(['UserCard']);
    expect(cards(`${IMPORTS}export const P = () => <div><Quick /><UserCard /></div>;`)).toEqual(['Quick', 'UserCard']);
  });

  it('accepts cards inside a boundary, however deep, and ignores other elements', () => {
    expect(cards(`${IMPORTS}export const P = () => <div><CardErrorBoundary><UserCard /></CardErrorBoundary></div>;`)).toEqual([]);
    expect(cards(`${IMPORTS}export const P = () => <CardErrorBoundary><div><section><Quick /></section></div></CardErrorBoundary>;`)).toEqual([]);
    expect(cards(`${IMPORTS}export const P = () => <div><Link to="/x">x</Link><span /></div>;`)).toEqual([]);
  });

  it('treats the Home sections that wrap their own cards as boundaries (components/StaffHomeSections.tsx)', () => {
    const home = 'import { HomeCell, MetricCardsRow } from "@/components/StaffHomeSections";\n';
    expect(cards(`${IMPORTS}${home}export const P = () => <div><MetricCardsRow /><HomeCell className="x"><UserCard /></HomeCell></div>;`)).toEqual([]);
    // a card beside them is still found
    expect(cards(`${IMPORTS}${home}export const P = () => <div><HomeCell className="x"><UserCard /></HomeCell><Quick /></div>;`)).toEqual(['Quick']);
  });

  it('does not count an element after a boundary has closed', () => {
    expect(cards(`${IMPORTS}export const P = () => <div><CardErrorBoundary><UserCard /></CardErrorBoundary><Quick /></div>;`)).toEqual(['Quick']);
  });
});

const HOME_PAGES = [
  'admin',
  'student',
  'parent',
  'regular-teacher',
  'senior-teacher',
  'spectator',
  'super-admin',
].map((role) => `src/scenes/(dashboard)/${role}/index.tsx`);

describe('the dashboard home pages', () => {
  it('put every card in a CardErrorBoundary', () => {
    const files = buildStaticGraph().files;
    const pages = new Map(HOME_PAGES.map((p) => [p, files.get(p) ?? '']));
    for (const [page, text] of pages) expect(text.length, `${page} should exist`).toBeGreaterThan(0);
    const unwrapped = findUnwrappedCards(pages).map((c) => `${c.file}:${c.line} <${c.name}>`);
    expect(unwrapped, 'wrap these in <CardErrorBoundary> (components/CardErrorBoundary.tsx)').toEqual([]);
  }, 60_000);

  it('really wrap something (the scan is not passing on empty pages)', () => {
    const files = buildStaticGraph().files;
    for (const page of HOME_PAGES) {
      const text = files.get(page) ?? '';
      expect(text.includes('<CardErrorBoundary>') || text.includes('<HomeCell '), page).toBe(true);
    }
  }, 60_000);
});
