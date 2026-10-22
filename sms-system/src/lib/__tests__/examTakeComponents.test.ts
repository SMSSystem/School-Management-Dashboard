import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StudentQuestionView from '../../components/exam/take/StudentQuestionView';
import QuestionNavigator from '../../components/exam/take/QuestionNavigator';
import { navigatorState } from '../examTakeLogic';
import type { ExamQuestion } from '@/types/exams';

// The question view and navigator the staff preview and the student's attempt share (EXAMS_FEATURE_SPEC.md §4.5).

const single: ExamQuestion = {
  id: 'q1',
  text: 'What is 2 + 2?\nShow no work.',
  kind: 'single',
  options: [
    { id: 'o1', text: '3' },
    { id: 'o2', text: '4' },
    { id: 'o3', text: '<b>5</b>' },
  ],
  points: 2,
};
const multiple: ExamQuestion = { ...single, id: 'q2', kind: 'multiple', points: 1 };
const noop = () => undefined;

const view = (question: ExamQuestion, over: Partial<Parameters<typeof StudentQuestionView>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(StudentQuestionView, {
      question,
      number: 3,
      total: 10,
      chosen: [],
      flagged: false,
      onToggleOption: noop,
      onToggleFlag: noop,
      ...over,
    }),
  );

describe('StudentQuestionView', () => {
  it('shows the position, the points and the text', () => {
    const html = view(single);
    expect(html).toContain('Question 3 of 10');
    expect(html).toContain('(2 points)');
    expect(html).toContain('What is 2 + 2?');
    expect(view(multiple)).toContain('(1 point)');
  });

  it('uses radio buttons for a single question and checkboxes for a multiple one, with a hint for each', () => {
    const radios = view(single);
    expect(radios.match(/type="radio"/g)).toHaveLength(3);
    expect(radios).not.toContain('type="checkbox"');
    expect(radios).toContain('Choose one answer.');
    const boxes = view(multiple);
    expect(boxes.match(/type="checkbox"/g)).toHaveLength(3);
    expect(boxes).toContain('Select all that apply.');
  });

  it('checks the chosen options only', () => {
    const html = view(multiple, { chosen: ['o1', 'o3'] });
    expect(html.match(/checked=""/g)).toHaveLength(2);
  });

  it('shows text as plain text, never as markup', () => {
    const html = view(single);
    expect(html).toContain('&lt;b&gt;5&lt;/b&gt;');
    expect(html).not.toContain('<b>5</b>');
    expect(html).not.toContain('dangerouslySetInnerHTML');
  });

  it('shows the flag state and can be disabled', () => {
    expect(view(single)).toContain('aria-pressed="false"');
    expect(view(single)).toContain('Flag for review');
    expect(view(single, { flagged: true })).toContain('aria-pressed="true"');
    expect(view(single, { flagged: true })).toContain('Flagged for review');
    const off = view(single, { disabled: true });
    expect(off.match(/disabled=""/g)?.length).toBe(4);
  });
});

describe('QuestionNavigator', () => {
  const items = navigatorState([single, multiple, { ...single, id: 'q3' }], { q1: ['o1'] }, ['q2']);

  it('has a numbered button per question, with its state in the label', () => {
    const html = renderToStaticMarkup(createElement(QuestionNavigator, { items, currentId: 'q1', onSelect: noop }));
    expect(html).toContain('aria-label="Question 1, answered"');
    expect(html).toContain('aria-label="Question 2, not answered, flagged"');
    expect(html).toContain('aria-label="Question 3, not answered"');
    expect(html.match(/<button/g)).toHaveLength(3);
  });

  it('marks the current question', () => {
    const html = renderToStaticMarkup(createElement(QuestionNavigator, { items, currentId: 'q2', onSelect: noop }));
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html.indexOf('aria-current="true"')).toBeGreaterThan(html.indexOf('Question 2'));
  });
});
