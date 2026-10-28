import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NavigationGuardProvider from '../../components/NavigationGuardProvider';
import providerRaw from '../../components/NavigationGuardProvider.tsx?raw';
import hookRaw from '../../hooks/useNavigationGuard.ts?raw';
import mainRaw from '../../main.tsx?raw';
import menuRaw from '../../components/Menu.tsx?raw';
import headerRaw from '../../components/TopHeader.tsx?raw';
import pageRaw from '../../scenes/(dashboard)/list/exams/build/index.tsx?raw';
import inactivityHookRaw from '../../hooks/useInactivityLogout.ts?raw';
import inactivityGuardRaw from '../../components/InactivityGuard.tsx?raw';

// The unsaved-changes guard is wired where it should be, and not where it must not be (a sign-out after inactivity is
// never stopped).

const norm = (s: string) => s.split('\r\n').join('\n');
const provider = norm(providerRaw);
const hook = norm(hookRaw);
const main = norm(mainRaw);
const menu = norm(menuRaw);
const header = norm(headerRaw);
const page = norm(pageRaw);

describe('the provider', () => {
  it('renders only its children while nothing is pending', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(NavigationGuardProvider, null, createElement('p', null, 'the page'))));
    expect(html).toBe('<p>the page</p>');
  });

  it('asks in one dialog, in the words the page gave or else general ones that name no page', () => {
    expect(provider).toContain('title="Leave without saving?"');
    expect(provider).toContain('message={message ?? GENERAL_MESSAGE}');
    expect(provider).toContain('const GENERAL_MESSAGE = "You have unsaved changes. Leaving now loses them.";');
    expect(provider).not.toContain('this exam');
    expect(provider).toContain('cancelLabel="Stay"');
    expect(provider).toContain('confirmLabel="Leave without saving"');
    expect(provider).toContain('tone="danger"');
  });

  it('listens for links and for the tab closing only while it is on and the person has not chosen to leave', () => {
    expect(provider).toContain('const watching = active && !released;');
    expect(provider).toContain('watchLinks(browser()');
    expect(provider).toContain('watchUnload(browser())');
  });

  it('pushes the marker entry once and reads it from the router\'s own state', () => {
    expect(provider).toContain('navigate(here().path, { state: GUARD_STATE });');
    expect(provider).toContain('markerAt.current = historyIndex() + 1;');
    expect(provider).toContain('popDecision({ guardActive: behind, state: location.state })');
    expect(provider).toContain('const behind = historyIndex() < markerAt.current;');
  });

  it('replaces the marker with the page it leaves to, and goes back one entry when leaving by the back button', () => {
    expect(provider).toContain('navigate(chosen.to, { replace: onMarker() })');
    expect(provider).toContain('navigate(-1)');
  });

  it('is not built from a browser object when the file loads, so a page without a browser can import it', () => {
    expect(provider).toContain('const browser = (): WatchEnv => ({ document, window, here });');
  });
});

describe('the marker entry after the changes are saved', () => {
  it('is stepped back over when the page stops asking while it is the current entry, and not when the person chose to leave', () => {
    expect(provider).toContain('if (!active && markerAt.current !== null && onMarker()) navigate(-1);');
    expect(provider).toContain('const watching = active && !released;');
  });
});

describe('the hooks', () => {
  it('switch the guard on while a page asks, and off when it stops or goes away', () => {
    expect(hook).toContain('setActive?.(active, message);');
    expect(hook).toContain('return () => setActive?.(false);');
  });

  it('let a button run at once when no provider is there', () => {
    expect(hook).toContain('?? runAtOnce');
  });
});

describe('where the guard is used', () => {
  it('wraps the app inside the router', () => {
    expect(main).toContain('<NavigationGuardProvider>\n                <App />\n              </NavigationGuardProvider>');
    expect(main.indexOf('<BrowserRouter>')).toBeLessThan(main.indexOf('<NavigationGuardProvider>'));
  });

  it('is switched on by the builder while it holds unsaved changes, which no longer has a dialog or a listener of its own', () => {
    expect(page).toContain('useNavigationGuard(dirty, UNSAVED_MESSAGE);');
    expect(page).toContain('Preview as student shows only the saved version, and leaving now loses your changes.');
    expect(page).not.toContain('beforeunload');
    expect(page).not.toContain('setLeaving');
    expect(page).not.toContain('Leave without saving');
  });

  it('keeps the builder\'s Back and Preview links as plain links, which the guard stops itself', () => {
    expect(page).toContain('<Link to="/dashboard/list/exams" className=');
    expect(page).toContain('to={`/dashboard/list/exams/${exam.id}/preview`}');
  });

  it('is asked by the two buttons a person presses to leave: Sign out and Start Tour', () => {
    expect(header).toContain('confirmLeave(async () => {\n      await signOut();');
    expect(menu).toContain('onClick={() => confirmLeave(() => { onNavigate?.(); navigate(\'/dashboard\'); startNextStep(role ?? \'\'); })}');
  });

  it('is never in the way of the sign-out after inactivity', () => {
    for (const raw of [inactivityHookRaw, inactivityGuardRaw]) {
      expect(norm(raw)).not.toMatch(/NavigationGuard|useConfirmLeave|confirmLeave/);
    }
  });
});
