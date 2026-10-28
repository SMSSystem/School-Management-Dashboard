import { describe, expect, it } from 'vitest';
import { GUARD_STATE, interceptTarget, isGuardState, popDecision, type LinkClick } from '../navigationGuard';

// The decisions behind the unsaved-changes guard: which link clicks ask first, and how the history sentinel is read.

const here = { origin: 'https://sms.example', path: '/dashboard/list/exams/e1/build' };
const click = (over: Partial<LinkClick> = {}): LinkClick => ({
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  href: 'https://sms.example/dashboard/list/exams/e1/preview',
  target: '',
  download: false,
  ...over,
});

describe('which link clicks ask before leaving', () => {
  it('a plain click on a link to another page does, and says where it goes', () => {
    expect(interceptTarget(click(), here)).toBe('/dashboard/list/exams/e1/preview');
    expect(interceptTarget(click({ href: 'https://sms.example/dashboard/list/exams?page=2#top' }), here)).toBe('/dashboard/list/exams?page=2#top');
    expect(interceptTarget(click({ target: '_self' }), here)).toBe('/dashboard/list/exams/e1/preview');
  });

  it('a click that opens somewhere else or does something else does not', () => {
    expect(interceptTarget(click({ ctrlKey: true }), here)).toBeNull();
    expect(interceptTarget(click({ metaKey: true }), here)).toBeNull();
    expect(interceptTarget(click({ shiftKey: true }), here)).toBeNull();
    expect(interceptTarget(click({ altKey: true }), here)).toBeNull();
    expect(interceptTarget(click({ button: 1 }), here)).toBeNull();
    expect(interceptTarget(click({ button: 2 }), here)).toBeNull();
    expect(interceptTarget(click({ target: '_blank' }), here)).toBeNull();
    expect(interceptTarget(click({ download: true }), here)).toBeNull();
  });

  it('a click something already handled does not', () => {
    expect(interceptTarget(click({ defaultPrevented: true }), here)).toBeNull();
  });

  it('a link to another site, a mail address or a script does not', () => {
    expect(interceptTarget(click({ href: 'https://other.example/dashboard' }), here)).toBeNull();
    expect(interceptTarget(click({ href: 'http://sms.example/dashboard' }), here)).toBeNull();
    expect(interceptTarget(click({ href: 'mailto:teacher@school.example' }), here)).toBeNull();
    expect(interceptTarget(click({ href: 'javascript:void(0)' }), here)).toBeNull();
    expect(interceptTarget(click({ href: 'not a url' }), here)).toBeNull();
  });

  it('a link to this same page, or to another place on it, does not', () => {
    expect(interceptTarget(click({ href: 'https://sms.example/dashboard/list/exams/e1/build' }), here)).toBeNull();
    expect(interceptTarget(click({ href: 'https://sms.example/dashboard/list/exams/e1/build#questions' }), here)).toBeNull();
  });

  it('the same path with another query is another page', () => {
    expect(interceptTarget(click({ href: 'https://sms.example/dashboard/list/exams/e1/build?x=1' }), here)).toBe('/dashboard/list/exams/e1/build?x=1');
  });
});

describe('the history sentinel', () => {
  it('is recognised by its marker only', () => {
    expect(isGuardState(GUARD_STATE)).toBe(true);
    expect(isGuardState({ examGuard: true, usr: null })).toBe(true);
    expect(isGuardState({ examGuard: false })).toBe(false);
    expect(isGuardState({ usr: 1 })).toBe(false);
    expect(isGuardState(null)).toBe(false);
    expect(isGuardState(undefined)).toBe(false);
    expect(isGuardState('examGuard')).toBe(false);
  });
});

describe('what to do when the browser changes history entry', () => {
  it('asks when the guard is on and the entry is not the sentinel: the user went back', () => {
    expect(popDecision({ guardActive: true, state: { idx: 2 } })).toBe('ask');
    expect(popDecision({ guardActive: true, state: null })).toBe('ask');
  });

  it('does nothing when the entry is the sentinel, or the guard is off', () => {
    expect(popDecision({ guardActive: true, state: GUARD_STATE })).toBe('ignore');
    expect(popDecision({ guardActive: false, state: { idx: 2 } })).toBe('ignore');
    expect(popDecision({ guardActive: false, state: GUARD_STATE })).toBe('ignore');
  });
});
