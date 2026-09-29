import { describe, it, expect } from 'vitest';
import { rescaleScore } from '../gradebookRescale';

describe('rescaleScore', () => {
  it('rescales a score proportionally onto the target column max', () => {
    // 15/20 (75%) onto a column out of 100 -> 75.
    expect(rescaleScore(15, 20, 100)).toBe(75);
  });

  it('rescales down onto a smaller column max', () => {
    // 8/10 (80%) onto a column out of 5 -> 4.
    expect(rescaleScore(8, 10, 5)).toBe(4);
  });

  it('preserves a perfect score as the full new max regardless of scale', () => {
    expect(rescaleScore(20, 20, 100)).toBe(100);
    expect(rescaleScore(5, 5, 5)).toBe(5);
  });

  it('preserves a zero score as zero', () => {
    expect(rescaleScore(0, 20, 100)).toBe(0);
  });

  it('returns 0 instead of NaN when oldMaxScore is 0 (guards a divide-by-zero on malformed legacy data)', () => {
    expect(rescaleScore(10, 0, 100)).toBe(0);
  });

  it('returns 0 instead of NaN when oldMaxScore is negative', () => {
    expect(rescaleScore(10, -5, 100)).toBe(0);
  });
});
