import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { markdownLines, questionsFromMarkdown } from '../examMarkdown';
import { MARKDOWN_PICTURE_NOTE, buildExampleMarkdown } from '../exampleMarkdown';
import { buildExamplePdf } from '../examplePdf';
import { buildExampleDocx } from '../exampleDocx';
import { EXAMPLE_PARAGRAPHS } from '../exampleText';
import { questionsFromDocx } from '../examDocx';
import { questionsFromPdf } from '../examPdf';
import { examTemplateRows, questionsFromRows } from '../examImport';
import { makePdf } from '../pdfWriter';
import type { BuilderQuestion } from '../examBuilderLogic';

// Reading a Markdown file and the three templates made in the browser (EXAMS_FEATURE_SPEC.md §4.4). Each template read
// back through its own reader must give the same three questions as the spreadsheet template, with nothing to check.

const strip = (qs: BuilderQuestion[]) =>
  qs.map((q) => ({
    text: q.text,
    kind: q.kind,
    points: q.points,
    options: q.options.map((o) => o.text),
    correct: q.options.filter((o) => q.correct.includes(o.id)).map((o) => o.text),
  }));
const template = strip(questionsFromRows(examTemplateRows(), 'both').questions);

describe('markdownLines', () => {
  it('takes the marks off headings, bold, italics, code, quotes and bullets in front of options', () => {
    const text = ['# Quiz', '1. **Which** planet is _red_?', '- A. `Venus`', '* B) Mars', '+ (C) Earth', '> D. Jupiter', '**Answer:** B'].join('\n');
    expect(markdownLines(text).lines).toEqual(['Quiz', '1. Which planet is red?', 'A. Venus', 'B) Mars', '(C) Earth', 'D. Jupiter', 'Answer: B']);
  });

  it('keeps a bullet that is not in front of a question, an option or an answer, and escaped punctuation', () => {
    expect(markdownLines('- plain note\n1\\. not a marker \\*kept\\*').lines).toEqual(['- plain note', '1. not a marker *kept*']);
  });

  it('drops tags but keeps their text, skips rules and fences, and counts table lines', () => {
    const text = ['<b>1. Tagged</b>', '---', '```', 'A. in a fence', '```', '| a | b |', '|---|---|'].join('\n');
    const out = markdownLines(text);
    expect(out.lines).toEqual(['1. Tagged', 'A. in a fence']);
    expect(out.notes).toEqual(['2 table lines were ignored; put questions in ordinary lines.']);
  });

  it('reads line breaks of any kind, and a trailing backslash', () => {
    expect(markdownLines('1. A\r\nA. b \\\rB. c').lines).toEqual(['1. A', 'A. b', 'B. c']);
  });
});

describe('questionsFromMarkdown', () => {
  it('reads a Markdown exam written with headings, bold and bullets as the three template questions', () => {
    const text = [
      '# Science quiz',
      '',
      '1. Which planet is known as the Red Planet?',
      '- A. Venus',
      '- B. Mars',
      '- C. Jupiter',
      '- D. Mercury',
      '**Answer:** B',
      '',
      '2. Which of these are prime numbers? **[2 marks]**',
      '- A. 2',
      '- B. 4',
      '- C. 7',
      '- D. 9',
      '**Answers:** A, C',
      '',
      '3. Water boils at 100 degrees Celsius at sea level.',
      '- A. True',
      '- B. False',
      '**Answer:** A',
    ].join('\n');
    const out = questionsFromMarkdown(text, 'both');
    expect(strip(out.questions)).toEqual(template);
    expect(out.warnings).toEqual([{ message: '1 line before the first question (a title or instructions) was ignored.' }]);
  });

  it('puts the note about skipped tables first, before the checks', () => {
    const out = questionsFromMarkdown('| x |\n1. Q\nA. a\nB. b\nAnswer: A', 'single');
    expect(out.warnings[0].message).toContain('1 table line was ignored');
    expect(out.questions).toHaveLength(1);
  });

  it('cleans and clips crafted text like every other import', () => {
    const out = questionsFromMarkdown(`1. ${'q'.repeat(1200)}‮\nA. a\nB. b\nAnswer: A`, 'single');
    expect(out.questions[0].text).toHaveLength(1000);
    expect(out.questions[0].text).not.toContain('‮');
  });
});

describe('the templates read back as the template questions, with nothing to check', () => {
  it('Markdown', () => {
    const text = buildExampleMarkdown();
    expect(text.endsWith('\n')).toBe(true);
    expect(text.split('\n').slice(0, -1)).toEqual([MARKDOWN_PICTURE_NOTE, ...EXAMPLE_PARAGRAPHS]);
    const out = questionsFromMarkdown(text, 'both');
    expect(strip(out.questions)).toEqual(template);
    expect(out.warnings).toEqual([]);
    expect(out.images).toBeUndefined();
  });

  it('Markdown: the note at the top says pictures are not imported yet and is ignored by the reader', () => {
    expect(MARKDOWN_PICTURE_NOTE).toMatch(/^<!-- .* -->$/);
    expect(MARKDOWN_PICTURE_NOTE).toContain('data:image/png;base64');
    expect(MARKDOWN_PICTURE_NOTE).not.toContain('![');
    expect(markdownLines(MARKDOWN_PICTURE_NOTE).pictures).toEqual([]);
    const lines = markdownLines(MARKDOWN_PICTURE_NOTE).lines;
    expect(lines.every((line) => line === '')).toBe(true);
    expect(markdownLines(MARKDOWN_PICTURE_NOTE).notes).toEqual([]);
  });

  it('Word', () => {
    const out = questionsFromDocx(buildExampleDocx(), 'both');
    expect(strip(out.questions)).toEqual(template);
    expect(out.warnings).toEqual([]);
  });

  it('PDF, through the real pdf.js', async () => {
    const bytes = buildExamplePdf();
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toBe('%PDF-1.4');
    const out = await questionsFromPdf(pdfjs, bytes, 'both');
    expect(strip(out.questions)).toEqual(template);
    expect(out.warnings).toEqual([]);
  });
});

describe('the PDF writer', () => {
  it('writes only what the standard font has, escaping brackets and backslashes, and a question mark for the rest', () => {
    const text = new TextDecoder().decode(makePdf([['A (b) \\ c', 'Zoë']]));
    expect(text).toContain('(A \\(b\\) \\\\ c) Tj');
    expect(text).toContain('(Zo?) Tj');
  });
});
