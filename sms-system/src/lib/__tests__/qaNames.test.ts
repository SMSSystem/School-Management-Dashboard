import { afterEach, describe, expect, it, vi } from 'vitest';

// e2e/qa-names.ts: the names and addresses of the QA fixtures come from .env.qa (QA_EMAIL_PREFIX, QA_DEPARTMENT_NAME,
// QA_TERM_NAME), with defaults that keep the suite's current addresses. A second test reads every e2e file as text so that a
// spec cannot go back to a hard-coded fixture address or to the names of the institution the suite moved away from.

const load = async () => {
  vi.resetModules();
  return import('../../../e2e/qa-names');
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the QA names', () => {
  it('keep the current addresses and names when nothing is set', async () => {
    vi.stubEnv('QA_EMAIL_PREFIX', '');
    vi.stubEnv('QA_DEPARTMENT_NAME', '');
    vi.stubEnv('QA_TERM_NAME', '');
    const names = await load();
    expect(names.qaEmail('lessons.teacher')).toBe('qa.lessons.teacher@demo.com');
    expect(names.qaEmail('assignments.seniorteacher2')).toBe('qa.assignments.seniorteacher2@demo.com');
    expect(names.DEPARTMENT_NAME).toBe('QA Department');
    expect(names.TERM_NAME).toBe('QA Term');
  });

  it('take the prefix and the names from the environment, trimmed', async () => {
    vi.stubEnv('QA_EMAIL_PREFIX', '  qa.bf ');
    vi.stubEnv('QA_DEPARTMENT_NAME', 'Science');
    vi.stubEnv('QA_TERM_NAME', ' Term One');
    const names = await load();
    expect(names.QA_EMAIL_PREFIX).toBe('qa.bf');
    expect(names.qaEmail('nodept.teacher')).toBe('qa.bf.nodept.teacher@demo.com');
    expect(names.DEPARTMENT_NAME).toBe('Science');
    expect(names.TERM_NAME).toBe('Term One');
  });
});

describe('the e2e files', () => {
  const files = import.meta.glob('../../../e2e/*.ts', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;
  const entries = Object.entries(files).filter(([path]) => !path.endsWith('/qa-names.ts'));

  it('are found', () => {
    expect(entries.length).toBeGreaterThan(20);
  });

  it('write no fixture address by hand: they come from qaEmail()', () => {
    const offenders = entries.filter(([, text]) => /['"`]qa\.(assignments|lessons|nodept)\.[a-z0-9.]*@demo\.com/.test(text)).map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('name no fixed term or department and no institution that was left behind', () => {
    for (const word of ['Christmas Term', 'Example Department', 'Example School', 'QA_FALLBACK']) {
      const offenders = entries.filter(([, text]) => text.includes(word)).map(([path]) => path);
      expect(offenders, word).toEqual([]);
    }
  });

  it('open the registration page by an id from .env.qa, not one written in the spec', () => {
    const spec = entries.find(([path]) => path.endsWith('/04-registration-form.spec.ts'))![1];
    expect(spec).toContain('process.env.QA_INSTITUTION_ID');
    expect(spec).toContain('process.env.QA_CUSTOM_INSTITUTION_ID');
    expect(spec).not.toMatch(/['"][A-Za-z0-9]{20}['"]/);
  });

  it('no longer include the calendar-mode fallback spec', () => {
    expect(entries.some(([path]) => /\/07-calendar-mode-fallback/.test(path))).toBe(false);
  });
});
