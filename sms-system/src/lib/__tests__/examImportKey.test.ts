import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ImportKeyEntry from '../../components/exam/builder/ImportKeyEntry';
import dialogRaw from '../../components/exam/builder/ExamImportDialog.tsx?raw';
import { applyKeys, toggleChoice, unanswered } from '../examImportKey';
import { questionsFromLines } from '../examDocumentText';
import { KIND_MARKER_PREFIX } from '../examImportPictures';
import type { ImportResult } from '../examImport';

// The answer key step of a Google Forms import (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.5).

const norm = (s: string) => s.split('\r\n').join('\n');
const dialog = norm(dialogRaw);
const noop = () => undefined;

const result: ImportResult = questionsFromLines(
  ['1. One answer? [1 point]', `${KIND_MARKER_PREFIX}single`, 'A. a', 'B. b', 'C. c', '2. Several answers? [2 points]', `${KIND_MARKER_PREFIX}multiple`, 'A. x', 'B. y', 'C. z', '3. Left alone? [1 point]', `${KIND_MARKER_PREFIX}single`, 'A. p', 'B. q'],
  'both',
);
const [q1, q2] = result.questions;

describe('choosing answers', () => {
  it('a single question keeps the one option chosen last, and a multiple question toggles', () => {
    let c = toggleChoice({}, q1, q1.options[0].id);
    c = toggleChoice(c, q1, q1.options[2].id);
    expect(c[q1.id]).toEqual([q1.options[2].id]);
    c = toggleChoice(c, q2, q2.options[0].id);
    c = toggleChoice(c, q2, q2.options[1].id);
    expect(c[q2.id]).toEqual([q2.options[0].id, q2.options[1].id]);
    c = toggleChoice(c, q2, q2.options[0].id);
    expect(c[q2.id]).toEqual([q2.options[1].id]);
  });

  it('counts the questions that have no answer', () => {
    expect(unanswered(result, {})).toBe(3);
    expect(unanswered(result, { [q1.id]: [q1.options[0].id], [q2.id]: [] })).toBe(2);
    expect(unanswered(result, { [q1.id]: ['no-such-option'] })).toBe(3);
  });
});

describe('applying the answers to the result', () => {
  it('sets the key of each answered question, in option order of the choice, and leaves the others alone', () => {
    const out = applyKeys(result, { [q1.id]: [q1.options[1].id], [q2.id]: [q2.options[0].id, q2.options[2].id] });
    expect(out.questions[0].correct).toEqual([q1.options[1].id]);
    expect(out.questions[1].correct).toEqual([q2.options[0].id, q2.options[2].id]);
    expect(out.questions[2].correct).toEqual([]);
    expect(out.questions.map((q) => q.text)).toEqual(result.questions.map((q) => q.text));
  });

  it('drops the no-answer warning of an answered question only', () => {
    expect(result.warnings.filter((w) => w.message.startsWith('No correct answer is given')).map((w) => w.question)).toEqual([1, 2, 3]);
    const out = applyKeys(result, { [q2.id]: [q2.options[1].id] });
    expect(out.warnings.filter((w) => w.message.startsWith('No correct answer is given')).map((w) => w.question)).toEqual([1, 3]);
  });

  it('ignores an option that is not the question’s, a repeated one and a second choice for a single question', () => {
    const out = applyKeys(result, { [q1.id]: ['x', q1.options[0].id, q1.options[1].id], [q2.id]: [q2.options[0].id, q2.options[0].id] });
    expect(out.questions[0].correct).toEqual([q1.options[0].id]);
    expect(out.questions[1].correct).toEqual([q2.options[0].id]);
  });

  it('does not change the result it was given', () => {
    const before = JSON.stringify(result);
    applyKeys(result, { [q1.id]: [q1.options[0].id] });
    expect(JSON.stringify(result)).toBe(before);
  });
});

describe('the key step as it renders', () => {
  const screen = (choices: Record<string, string[]> = {}) =>
    renderToStaticMarkup(createElement(ImportKeyEntry, { result, choices, onToggle: noop, onBack: noop, onContinue: noop }));

  it('shows each question with radio buttons for one answer, check boxes for several, and how many are answered', () => {
    const html = screen();
    expect(html).toContain('A printout of a form has no answers in it');
    expect(html).toContain('0 of 3 questions answered.');
    expect(html.match(/type="radio"/g)).toHaveLength(5);
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html).toContain('One correct answer');
    expect(html).toContain('Several correct answers');
    expect(html).toContain('Question 2, option C is correct');
    expect(html).toContain('Review in the builder');
    expect(html).toContain('Back');
  });

  it('shows the chosen options as checked and the count', () => {
    const html = screen({ [q1.id]: [q1.options[1].id], [q2.id]: [q2.options[0].id] });
    expect(html).toContain('2 of 3 questions answered.');
    expect(html.match(/checked=""/g)).toHaveLength(2);
  });
});

describe('in the dialog', () => {
  it('shows the step only for a printout, goes back to the step before it, and applies the choices when it finishes', () => {
    expect(dialog).toContain('const needsKey = result?.profile === "google_forms"');
    expect(dialog).toContain('onBack={() => setStep(keyFrom)}');
    expect(dialog).toContain('setKeyFrom("pictures")');
    expect(dialog).toContain('setKeyFrom("file")');
    expect(dialog).toContain('needsKey ? applyKeys(result, choices) : result');
    expect(dialog).toContain('setChoices({})');
  });
});
