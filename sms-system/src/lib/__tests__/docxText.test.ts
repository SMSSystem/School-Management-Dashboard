import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { DocxError, formatNumber, readDocxLines } from '../docxText';
import { questionsFromDocx } from '../examDocx';
import { buildExampleDocx, docxFromParagraphs, EXAMPLE_PARAGRAPHS } from '../exampleDocx';
import { examTemplateRows, questionsFromRows } from '../examImport';
import type { BuilderQuestion } from '../examBuilderLogic';
import type { RawRow } from '../spreadsheetImport';

// Reading the text of a Word file for the exam import (EXAMS_FEATURE_SPEC.md §4.4). The .docx files are made here.

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const docx = (body: string, numbering?: string): Uint8Array =>
  zipSync({
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`),
    ...(numbering ? { 'word/numbering.xml': strToU8(`<?xml version="1.0"?><w:numbering ${NS}>${numbering}</w:numbering>`) } : {}),
  });
const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const item = (numId: number, ilvl: number, text: string) =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const lvl = (ilvl: number, fmt: string, text: string, start = 1) =>
  `<w:lvl w:ilvl="${ilvl}"><w:start w:val="${start}"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/></w:lvl>`;
const abstract = (id: number, ...levels: string[]) => `<w:abstractNum w:abstractNumId="${id}">${levels.join('')}</w:abstractNum>`;
const num = (id: number, abstractId: number, restart = false) =>
  `<w:num w:numId="${id}"><w:abstractNumId w:val="${abstractId}"/>${restart ? '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>' : ''}</w:num>`;

const NUMBERED = abstract(0, lvl(0, 'decimal', '%1.'), lvl(1, 'upperLetter', '%2.')) + num(1, 0);

describe('the text of a paragraph', () => {
  it('gives one line per paragraph, with an empty paragraph as an empty line', () => {
    expect(readDocxLines(docx(`${p('First')}<w:p/>${p('Second')}`)).lines).toEqual(['First', '', 'Second']);
  });

  it('joins the runs of a paragraph, turns a tab into a space and a line break into a new line', () => {
    const body = '<w:p><w:r><w:t>Tom</w:t></w:r><w:r><w:t xml:space="preserve"> &amp; Jerry</w:t></w:r><w:r><w:tab/><w:t>&lt;3 &#65;&#x42;</w:t></w:r><w:r><w:br/><w:t>next</w:t></w:r></w:p>';
    expect(readDocxLines(docx(body)).lines).toEqual(['Tom & Jerry <3 AB', 'next']);
  });

  it('keeps inserted text and drops text deleted with tracked changes', () => {
    const body = '<w:p><w:ins w:id="1"><w:r><w:t>kept </w:t></w:r></w:ins><w:del w:id="2"><w:r><w:delText>deleted</w:delText></w:r></w:del><w:r><w:t>and more</w:t></w:r></w:p>';
    expect(readDocxLines(docx(body)).lines).toEqual(['kept and more']);
  });

  it('treats markup-looking text as text', () => {
    expect(readDocxLines(docx(p('&lt;script&gt;alert(1)&lt;/script&gt;'))).lines).toEqual(['<script>alert(1)</script>']);
  });
});

describe('automatic numbering', () => {
  it('writes the numbers and letters Word shows, restarting the letters after each question', () => {
    const body = item(1, 0, 'First?') + item(1, 1, 'one') + item(1, 1, 'two') + item(1, 0, 'Second?') + item(1, 1, 'x') + item(1, 1, 'y');
    expect(readDocxLines(docx(body, NUMBERED)).lines).toEqual(['1. First?', 'A. one', 'B. two', '2. Second?', 'A. x', 'B. y']);
  });

  it('follows the level text pattern and the number format', () => {
    const numbering = abstract(0, lvl(0, 'lowerRoman', '%1)'), lvl(1, 'lowerLetter', '(%2)')) + num(1, 0);
    const body = item(1, 0, 'a') + item(1, 1, 'b') + item(1, 1, 'c') + item(1, 0, 'd');
    expect(readDocxLines(docx(body, numbering)).lines).toEqual(['i) a', '(a) b', '(b) c', 'ii) d']);
  });

  it('starts from the level’s start value', () => {
    const numbering = abstract(0, lvl(0, 'decimal', '%1.', 5)) + num(1, 0);
    expect(readDocxLines(docx(item(1, 0, 'x') + item(1, 0, 'y'), numbering)).lines).toEqual(['5. x', '6. y']);
  });

  it('continues a list shared by two numbering ids, and restarts it where an id says so', () => {
    const shared = abstract(0, lvl(0, 'decimal', '%1.')) + num(1, 0) + num(2, 0);
    expect(readDocxLines(docx(item(1, 0, 'a') + item(2, 0, 'b'), shared)).lines).toEqual(['1. a', '2. b']);
    const restart = abstract(0, lvl(0, 'decimal', '%1.')) + num(1, 0) + num(2, 0, true);
    expect(readDocxLines(docx(item(1, 0, 'a') + item(1, 0, 'b') + item(2, 0, 'c'), restart)).lines).toEqual(['1. a', '2. b', '1. c']);
  });

  it('adds the dot a pattern without one would lack, and gives a bullet no marker', () => {
    const numbering = abstract(0, lvl(0, 'decimal', '%1')) + abstract(1, lvl(0, 'bullet', '•')) + num(1, 0) + num(2, 1);
    expect(readDocxLines(docx(item(1, 0, 'numbered') + item(2, 0, 'bullet'), numbering)).lines).toEqual(['1. numbered', 'bullet']);
  });

  it('leaves a paragraph with no list, or with numId 0 or an unknown list, as typed', () => {
    const body = p('typed') + item(0, 0, 'none') + item(9, 0, 'unknown');
    expect(readDocxLines(docx(body, NUMBERED)).lines).toEqual(['typed', 'none', 'unknown']);
  });

  it('reads a file with no numbering part', () => {
    expect(readDocxLines(docx(item(1, 0, 'x'))).lines).toEqual(['x']);
  });
});

describe('what it leaves out and says so', () => {
  it('skips a table, with the paragraphs inside it, and counts it', () => {
    const body = `${p('before')}<w:tbl><w:tr><w:tc>${p('inside')}</w:tc></w:tr></w:tbl>${p('after')}`;
    const out = readDocxLines(docx(body));
    expect(out.lines).toEqual(['before', 'after']);
    expect(out.notes).toEqual(['1 table was ignored; put questions in ordinary paragraphs.']);
  });

  it('counts a table inside a table once', () => {
    const body = `<w:tbl><w:tr><w:tc><w:tbl><w:tr><w:tc>${p('deep')}</w:tc></w:tr></w:tbl>${p('mid')}</w:tc></w:tr></w:tbl>${p('after')}`;
    const out = readDocxLines(docx(body));
    expect(out.lines).toEqual(['after']);
    expect(out.notes).toHaveLength(1);
  });

  it('skips images and text boxes and counts them', () => {
    const image = '<w:p><w:r><w:drawing><wp:inline><a:graphic/></wp:inline></w:drawing></w:r></w:p>';
    const box = `<w:p><w:r><mc:AlternateContent><mc:Choice><w:drawing><wps:txbx><w:txbxContent>${p('boxed')}</w:txbxContent></wps:txbx></w:drawing></mc:Choice><mc:Fallback><w:pict><v:textbox><w:txbxContent>${p('boxed')}</w:txbxContent></v:textbox></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>`;
    const out = readDocxLines(docx(`${p('kept')}${image}${box}`));
    expect(out.lines).not.toContain('boxed');
    expect(out.lines[0]).toBe('kept');
    expect(out.notes).toEqual(['2 images or text boxes were ignored.']);
  });

  it('has no notes for a plain document', () => {
    expect(readDocxLines(docx(p('plain'))).notes).toEqual([]);
  });
});

describe('a file that cannot be read', () => {
  it('says so for bytes that are not a zip (an old .doc, a password-protected file)', () => {
    expect(() => readDocxLines(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(DocxError);
    expect(() => readDocxLines(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/old \.doc file, password-protected or damaged/);
  });

  it('says so for a zip with no Word body', () => {
    const other = zipSync({ 'readme.txt': strToU8('hello') });
    expect(() => readDocxLines(other)).toThrow(/not a Word \(\.docx\) document/);
  });

  it('reads only the body and the numbering, whatever else the zip holds', () => {
    const file = zipSync({
      'word/document.xml': strToU8(`<w:document ${NS}><w:body>${p('only this')}</w:body></w:document>`),
      'word/media/huge.bin': new Uint8Array(1000),
      'docProps/core.xml': strToU8('<x/>'),
    });
    expect(readDocxLines(file).lines).toEqual(['only this']);
  });
});

describe('formatNumber', () => {
  it('writes numbers as Word does', () => {
    expect(formatNumber(3, 'decimal')).toBe('3');
    expect(formatNumber(7, 'decimalZero')).toBe('07');
    expect(formatNumber(1, 'upperLetter')).toBe('A');
    expect(formatNumber(26, 'lowerLetter')).toBe('z');
    expect(formatNumber(27, 'lowerLetter')).toBe('aa');
    expect(formatNumber(14, 'lowerRoman')).toBe('xiv');
    expect(formatNumber(4, 'upperRoman')).toBe('IV');
    expect(formatNumber(2, 'bullet')).toBe('');
  });
});

describe('the example file and whole exams', () => {
  const strip = (qs: BuilderQuestion[]) =>
    qs.map((q) => ({ text: q.text, kind: q.kind, points: q.points, options: q.options.map((o) => o.text), correct: q.options.filter((o) => q.correct.includes(o.id)).map((o) => o.text) }));

  it('reads back as the same three questions as the spreadsheet template, with nothing to check', () => {
    const fromWord = questionsFromDocx(buildExampleDocx(), 'both');
    expect(fromWord.warnings).toEqual([]);
    expect(strip(fromWord.questions)).toEqual(strip(questionsFromRows(examTemplateRows() as RawRow[], 'both').questions));
  });

  it('has the example’s paragraphs as its lines', () => {
    expect(readDocxLines(buildExampleDocx()).lines).toEqual([...EXAMPLE_PARAGRAPHS]);
  });

  it('escapes text it writes', () => {
    expect(readDocxLines(docxFromParagraphs(['1 < 2 & 3 > 2'])).lines).toEqual(['1 < 2 & 3 > 2']);
  });

  it('imports an exam typed with Word’s automatic numbering, with the answers typed', () => {
    const body =
      item(1, 0, 'Which planet is red?') + item(1, 1, 'Venus') + item(1, 1, 'Mars') + p('Answer: B') +
      item(1, 0, 'Which are prime? [2 marks]') + item(1, 1, '2') + item(1, 1, '4') + item(1, 1, '7') + p('Answers: A, C');
    const out = questionsFromDocx(docx(body, NUMBERED), 'both');
    expect(out.warnings).toEqual([]);
    expect(strip(out.questions)).toEqual([
      { text: 'Which planet is red?', kind: 'single', points: 1, options: ['Venus', 'Mars'], correct: ['Mars'] },
      { text: 'Which are prime?', kind: 'multiple', points: 2, options: ['2', '4', '7'], correct: ['2', '7'] },
    ]);
  });

  it('puts the notes about ignored content first among the warnings', () => {
    const body = `<w:tbl><w:tr><w:tc>${p('x')}</w:tc></w:tr></w:tbl>${p('1. Q?')}${p('A. a')}${p('B. b')}${p('Answer: A')}`;
    const out = questionsFromDocx(docx(body), 'single');
    expect(out.questions).toHaveLength(1);
    expect(out.warnings).toEqual([{ message: '1 table was ignored; put questions in ordinary paragraphs.' }]);
  });
});
