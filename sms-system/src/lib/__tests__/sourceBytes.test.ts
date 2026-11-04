import { describe, expect, it } from 'vitest';

// Guards the bytes of the source files. A NUL character or a carriage return that is not part of a CRLF pair makes
// git treat the file as binary: it then stores it with the wrong line endings and shows no readable diff (a scripted
// edit once left `\r\r\n` in three pages, and a key separator written as a raw NUL kept gradeEntryTracking.ts binary
// for months). Plain CRLF is fine: git normalises it on commit.

// Fallow would count this raw-text glob as importing every file, so this test is in ignorePatterns in .fallowrc.json.
const sources = import.meta.glob('../../**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('source files', () => {
  it('are found by the glob', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(500);
  });

  it('hold no NUL character (write "\\0" in a string instead)', () => {
    const offenders = Object.entries(sources)
      .filter(([, text]) => text.includes('\u0000'))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('hold no carriage return outside a CRLF pair', () => {
    const offenders = Object.entries(sources)
      .filter(([, text]) => /\r(?!\n)/.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
