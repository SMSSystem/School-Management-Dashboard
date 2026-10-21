import { describe, expect, it } from 'vitest';
import { linesOfPage, linesOfPages, looksScanned, type TextPiece } from '../pdfLines';

// Lines of text from the strings a PDF reader reports (EXAMS_FEATURE_SPEC.md §4.4).

const piece = (str: string, x: number, y: number, width = str.length * 6, height = 12): TextPiece => ({ str, x, y, width, height });

describe('linesOfPage', () => {
  it('orders lines from the top of the page to the bottom, whatever order they arrive in', () => {
    const lines = linesOfPage([piece('third', 72, 600), piece('first', 72, 700), piece('second', 72, 650)]);
    expect(lines).toEqual(['first', 'second', 'third']);
  });

  it('puts strings on one baseline together, left to right, with a space at a visible gap', () => {
    const lines = linesOfPage([piece('Mars', 120, 700), piece('A.', 72, 700, 12), piece('Venus', 300, 700)]);
    expect(lines).toEqual(['A. Mars Venus']);
  });

  it('does not add a space inside a word that arrives in pieces', () => {
    expect(linesOfPage([piece('Wa', 72, 700, 12), piece('ter', 84, 700, 18)])).toEqual(['Water']);
  });

  it('adds no second space when a piece already starts or ends with one', () => {
    expect(linesOfPage([piece('Hello ', 72, 700, 36), piece('world', 120, 700, 30)])).toEqual(['Hello world']);
    expect(linesOfPage([piece('Hello', 72, 700, 30), piece(' world', 150, 700, 36)])).toEqual(['Hello world']);
  });

  it('treats baselines a point or two apart as one line, and a full line apart as two', () => {
    expect(linesOfPage([piece('a', 72, 700), piece('b', 100, 698.5)])).toEqual(['a b']);
    expect(linesOfPage([piece('a', 72, 700), piece('b', 72, 686)])).toEqual(['a', 'b']);
  });

  it('drops empty strings and collapses runs of spaces', () => {
    expect(linesOfPage([piece('', 72, 700), piece('x    y', 72, 680), piece('   ', 72, 660)])).toEqual(['x y']);
  });

  it('returns nothing for a page with no text', () => {
    expect(linesOfPage([])).toEqual([]);
  });
});

describe('linesOfPages', () => {
  it('puts an empty line between pages', () => {
    expect(linesOfPages([[piece('page one', 72, 700)], [piece('page two', 72, 700)]])).toEqual(['page one', '', 'page two']);
  });

  it('has no leading empty line, and a page with no text leaves its gap', () => {
    expect(linesOfPages([[], [piece('only', 72, 700)]])).toEqual(['', 'only']);
    expect(linesOfPages([])).toEqual([]);
  });
});

describe('looksScanned', () => {
  it('calls a file with almost no text a scan', () => {
    expect(looksScanned([], 3)).toBe(true);
    expect(looksScanned(['  ', '1'], 1)).toBe(true);
    expect(looksScanned(['a'.repeat(9)], 1)).toBe(true);
  });

  it('accepts a short text PDF', () => {
    expect(looksScanned(['1. What is 2 + 2?', 'A. 3', 'B. 4', 'Answer: B'], 1)).toBe(false);
  });

  it('calls a many-page file with only a few words a page a scan (a few text labels on pictures)', () => {
    expect(looksScanned(['a'.repeat(30)], 5)).toBe(true);
    expect(looksScanned(['a'.repeat(80)], 5)).toBe(false);
  });
});
