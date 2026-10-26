import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { PICTURE_MARKER_PREFIX, pictureIndexOf } from '../examImportPictures';
import { questionsFromLines } from '../examDocumentText';
import { questionsFromDocx } from '../examDocx';
import { buildPng } from './imageFixtures';

// Where the pictures of a document go (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.1): each marker line is
// put on the question being read, clear, check or unassigned, and the questions themselves are read as without it.

const m = (n: number) => `${PICTURE_MARKER_PREFIX}${n}`;
const Q = (n: number, ...rest: string[]) => [`${n}. Question ${n}?`, ...rest];
const OPTIONS = ['A. one', 'B. two'];
const ANSWER = 'Answer: A';

describe('the marker line', () => {
  it('names a picture index, and no other line does', () => {
    expect(pictureIndexOf(m(0))).toBe(0);
    expect(pictureIndexOf(m(41))).toBe(41);
    expect(pictureIndexOf('IMG:1')).toBeNull();
    expect(pictureIndexOf(`${PICTURE_MARKER_PREFIX}-1`)).toBeNull();
    expect(pictureIndexOf(`${PICTURE_MARKER_PREFIX}1.5`)).toBeNull();
    expect(pictureIndexOf('')).toBeNull();
  });
});

describe('where a picture goes', () => {
  it('is clear after the question text and before the first option', () => {
    const out = questionsFromLines([...Q(1, m(0), ...OPTIONS, ANSWER)], 'single');
    expect(out.images).toEqual([{ index: 0, questionIndex: 0, confidence: 'clear' }]);
    expect(out.questions).toHaveLength(1);
  });

  it('is clear when the question text wraps over two lines', () => {
    expect(questionsFromLines(['1. A long question', 'that wraps?', m(0), ...OPTIONS, ANSWER], 'single').images).toEqual([
      { index: 0, questionIndex: 0, confidence: 'clear' },
    ]);
  });

  it('is unassigned when the question has no text, because that question is left out', () => {
    const out = questionsFromLines(['1.', m(0), ...OPTIONS, ANSWER], 'single');
    expect(out.questions).toEqual([]);
    expect(out.images).toEqual([{ index: 0, questionIndex: null, confidence: 'unassigned' }]);
  });

  it('is check between the options, after the last option and after the answer line', () => {
    const lines = [...Q(1, 'A. one', m(0), 'B. two', m(1), ANSWER, m(2))];
    expect(questionsFromLines(lines, 'single').images).toEqual([
      { index: 0, questionIndex: 0, confidence: 'check' },
      { index: 1, questionIndex: 0, confidence: 'check' },
      { index: 2, questionIndex: 0, confidence: 'check' },
    ]);
  });

  it('is check for a second picture on the same question, the first staying clear', () => {
    expect(questionsFromLines([...Q(1, m(0), m(1), ...OPTIONS, ANSWER)], 'single').images).toEqual([
      { index: 0, questionIndex: 0, confidence: 'clear' },
      { index: 1, questionIndex: 0, confidence: 'check' },
    ]);
  });

  it('is unassigned before the first question, and is not counted as a line before it', () => {
    const out = questionsFromLines(['Unit test', m(0), ...Q(1, ...OPTIONS, ANSWER)], 'single');
    expect(out.images).toEqual([{ index: 0, questionIndex: null, confidence: 'unassigned' }]);
    expect(out.warnings).toEqual([{ message: '1 line before the first question (a title or instructions) was ignored.' }]);
  });

  it('goes to the previous question when it stands after its options and before the next number', () => {
    const out = questionsFromLines([...Q(1, ...OPTIONS, ANSWER, m(0)), ...Q(2, ...OPTIONS, ANSWER)], 'single');
    expect(out.images).toEqual([{ index: 0, questionIndex: 0, confidence: 'check' }]);
  });

  it('keeps each picture on its own question across several questions, in picture order', () => {
    const out = questionsFromLines([...Q(1, m(1), ...OPTIONS, ANSWER), ...Q(2, ...OPTIONS, ANSWER), ...Q(3, m(0), ...OPTIONS, ANSWER)], 'single');
    expect(out.images).toEqual([
      { index: 0, questionIndex: 2, confidence: 'clear' },
      { index: 1, questionIndex: 0, confidence: 'clear' },
    ]);
  });

  it('is unassigned when the file has pictures and no question at all', () => {
    const out = questionsFromLines(['Just a title', m(0)], 'single');
    expect(out.questions).toEqual([]);
    expect(out.images).toEqual([{ index: 0, questionIndex: null, confidence: 'unassigned' }]);
  });
});

describe('a question that is not in the result', () => {
  it('leaves its picture unassigned and gives the later pictures the right question', () => {
    // Question 2 has no text, so the shared reader leaves it out; the picture under it belongs to no question.
    const lines = [...Q(1, m(0), ...OPTIONS, ANSWER), '2.', m(1), ...OPTIONS, ANSWER, ...Q(3, m(2), ...OPTIONS, ANSWER)];
    const out = questionsFromLines(lines, 'single');
    expect(out.questions.map((q) => q.text)).toEqual(['Question 1?', 'Question 3?']);
    expect(out.images).toEqual([
      { index: 0, questionIndex: 0, confidence: 'clear' },
      { index: 1, questionIndex: null, confidence: 'unassigned' },
      { index: 2, questionIndex: 1, confidence: 'clear' },
    ]);
  });

  it('leaves the pictures of questions past the limit of 100 unassigned', () => {
    const lines: string[] = [];
    for (let n = 1; n <= 101; n += 1) lines.push(...Q(n, m(n - 1), ...OPTIONS, ANSWER));
    const out = questionsFromLines(lines, 'single');
    expect(out.questions).toHaveLength(100);
    expect(out.images![99]).toEqual({ index: 99, questionIndex: 99, confidence: 'clear' });
    expect(out.images![100]).toEqual({ index: 100, questionIndex: null, confidence: 'unassigned' });
  });
});

describe('the questions themselves', () => {
  it('are read exactly as without the markers, and a file without markers gets no picture keys', () => {
    const plain = [...Q(1, ...OPTIONS, ANSWER), ...Q(2, ...OPTIONS, 'Answer: B')];
    const marked = [...Q(1, m(0), ...OPTIONS, ANSWER, m(1)), m(2), ...Q(2, ...OPTIONS, 'Answer: B')];
    const strip = (r: ReturnType<typeof questionsFromLines>) => r.questions.map((q) => [q.text, q.options.map((o) => o.text), q.correct.length, q.points]);
    const a = questionsFromLines(plain, 'single');
    const b = questionsFromLines(marked, 'single');
    expect(strip(b)).toEqual(strip(a));
    expect(b.warnings).toEqual(a.warnings);
    expect(Object.keys(a)).toEqual(['questions', 'warnings', 'missingHeaders']);
    expect(a.images).toBeUndefined();
  });

  it('keep the points and the answer of a question whose picture stands among its lines', () => {
    const out = questionsFromLines(['1. Which tool? [3 marks]', m(0), 'A. vice', 'B. clamp', 'Answer: B'], 'single');
    expect(out.questions[0].points).toBe(3);
    expect(out.questions[0].correct).toHaveLength(1);
    expect(out.warnings).toEqual([]);
  });
});

describe('a Word file', () => {
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const PNG = buildPng({ width: 40, height: 30 });
  const p = (s: string) => `<w:p><w:r><w:t xml:space="preserve">${s}</w:t></w:r></w:p>`;
  const picture = (alt: string) =>
    `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="P" descr="${alt}"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  const docx = (body: string) =>
    zipSync({
      'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`),
      'word/_rels/document.xml.rels': strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/a.png"/></Relationships>',
      ),
      'word/media/a.png': PNG,
    });

  it('returns the pictures with their places: clear, check and unassigned', () => {
    const body =
      picture('Title picture') +
      p('1. Which tool is this?') + picture('A vice') + p('A. A vice') + p('B. A clamp') + p('Answer: A') +
      p('2. Which is stronger?') + p('A. one') + picture('Option picture') + p('B. two') + p('Answer: B');
    const out = questionsFromDocx(docx(body), 'single');
    expect(out.questions).toHaveLength(2);
    expect(out.images).toEqual([
      { index: 0, questionIndex: null, confidence: 'unassigned' },
      { index: 1, questionIndex: 0, confidence: 'clear' },
      { index: 2, questionIndex: 1, confidence: 'check' },
    ]);
    expect(out.pictures!.map((x) => x.alt)).toEqual(['Title picture', 'A vice', 'Option picture']);
    expect([...out.pictures![1].bytes!]).toEqual([...PNG]);
    expect(out.warnings).toEqual([]);
  });

  it('has no picture keys for a file without pictures', () => {
    const out = questionsFromDocx(docx(p('1. Q?') + p('A. a') + p('B. b') + p('Answer: A')), 'single');
    expect(out.images).toBeUndefined();
    expect(out.pictures).toBeUndefined();
  });
});
