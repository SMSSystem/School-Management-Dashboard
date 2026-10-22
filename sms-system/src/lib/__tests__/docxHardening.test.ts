import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { DocxError, MAX_INFLATED_BYTES, readDocxLines } from '../docxText';
import { cleanImportedText, questionsFromRows } from '../examImport';
import { EXAM_LIMITS } from '@/types/exams';

// Crafted Word files (EXAMS_FEATURE_SPEC.md §4.4, §13: the imported file is untrusted input). Each case used to freeze the
// browser tab, throw a raw error at the teacher, or let a huge text through; they must now finish quickly and say so.

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const wrap = (body: string) => strToU8(`<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`);
const docx = (xmlBody: string, numbering?: string): Uint8Array =>
  zipSync({
    'word/document.xml': wrap(xmlBody),
    ...(numbering ? { 'word/numbering.xml': strToU8(`<?xml version="1.0"?><w:numbering ${NS}>${numbering}</w:numbering>`) } : {}),
  });
const timed = <T>(run: () => T): { value: T | undefined; error: unknown; ms: number } => {
  const start = performance.now();
  try {
    return { value: run(), error: undefined, ms: performance.now() - start };
  } catch (error) {
    return { value: undefined, error, ms: performance.now() - start };
  }
};

describe('markup that is never closed', () => {
  it('reads 800 KB of unterminated comments, instructions and CDATA in well under a second (it was quadratic)', () => {
    for (const unit of ['<!--', '<?', '<![CDATA[']) {
      const bytes = zipSync({ 'word/document.xml': strToU8(`<w:document ${NS}><w:body><w:p><w:r><w:t>kept</w:t></w:r></w:p>${unit.repeat(200_000)}`) });
      const { value, error, ms } = timed(() => readDocxLines(bytes));
      expect(error, unit).toBeUndefined();
      expect(value?.lines, unit).toEqual(['kept']);
      expect(ms, unit).toBeLessThan(1500);
    }
  });

  it('reads many stray angle brackets in linear time, and keeps the text around them', () => {
    const bytes = zipSync({ 'word/document.xml': strToU8(`<w:document ${NS}><w:body>${'<'.repeat(300_000)}<w:p><w:r><w:t>still here</w:t></w:r></w:p></w:body></w:document>`) });
    const { value, ms } = timed(() => readDocxLines(bytes));
    expect(value?.lines).toEqual(['still here']);
    expect(ms).toBeLessThan(1500);
  });

  it('still skips a closed comment, an instruction and CDATA correctly', () => {
    const body = '<w:p><w:r><w:t>a<!-- <w:t>no</w:t> -->b</w:t></w:r></w:p><?x y?><w:p><w:r><w:t><![CDATA[1 < 2 & 3]]></w:t></w:r></w:p>';
    expect(readDocxLines(docx(body)).lines).toEqual(['ab', '1 < 2 & 3']);
  });
});

describe('a file that inflates to far more than it says', () => {
  it('is refused at the size cap, without inflating all of it', () => {
    const bomb = zipSync({ 'word/document.xml': new Uint8Array(MAX_INFLATED_BYTES * 3) }); // zeros: a few tens of KB
    expect(bomb.length).toBeLessThan(200_000);
    const { error, ms } = timed(() => readDocxLines(bomb));
    expect(error).toBeInstanceOf(DocxError);
    expect((error as DocxError).message).toContain('too large');
    expect(ms).toBeLessThan(3000);
  });

  it('is refused even when the zip claims a small size, because the claimed size is not trusted', () => {
    const bomb = zipSync({ 'word/document.xml': new Uint8Array(MAX_INFLATED_BYTES * 2) });
    const at = (sig: number) => {
      for (let i = 0; i < bomb.length - 4; i += 1) if (new DataView(bomb.buffer, bomb.byteOffset).getUint32(i, true) === sig) return i;
      return -1;
    };
    const view = new DataView(bomb.buffer, bomb.byteOffset);
    view.setUint32(at(0x04034b50) + 22, 1000, true); // local header: uncompressed size
    view.setUint32(at(0x02014b50) + 24, 1000, true); // central directory: uncompressed size
    const { error, ms } = timed(() => readDocxLines(bomb));
    expect(error).toBeInstanceOf(DocxError);
    expect(ms).toBeLessThan(3000);
  });

  it('refuses an encrypted entry and a file with a damaged central directory in words a teacher can use', () => {
    const file = docx('<w:p><w:r><w:t>x</w:t></w:r></w:p>');
    const encrypted = file.slice();
    const view = new DataView(encrypted.buffer);
    for (let i = 0; i < encrypted.length - 4; i += 1) {
      if (view.getUint32(i, true) === 0x02014b50) view.setUint16(i + 8, view.getUint16(i + 8, true) | 1, true);
    }
    expect(() => readDocxLines(encrypted)).toThrow(DocxError);
    const damaged = file.slice(0, file.length - 30);
    expect(() => readDocxLines(damaged)).toThrow(/could not be read as a Word document/);
  });
});

describe('a list level that is not a level', () => {
  it('is clamped to Word’s nine levels instead of failing with a raw error', () => {
    const numbering = '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
    for (const level of ['4294967295', '-5', 'x', '99999999999']) {
      const body = `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Q</w:t></w:r></w:p>`;
      expect(() => readDocxLines(docx(body, numbering)), level).not.toThrow();
    }
  });
});

describe('imported text', () => {
  it('has control characters and text-direction overrides taken out, and keeps tabs and line breaks', () => {
    expect(cleanImportedText('a\u0000b\u0007c‮d⁦e\u007Ff\tg\nh')).toBe('abcdef\tg\nh');
    expect(cleanImportedText('Zoë — 日本語 ✓')).toBe('Zoë — 日本語 ✓');
  });

  it('is cut at the length the builder accepts, with a warning, for a question and for an option', () => {
    const rows = [{ Question: 'q'.repeat(EXAM_LIMITS.questionTextMax + 50), 'Option A': 'a'.repeat(EXAM_LIMITS.optionTextMax + 10), 'Option B': 'short', Correct: 'A' }];
    const result = questionsFromRows(rows, 'single');
    expect(result.questions[0].text).toHaveLength(EXAM_LIMITS.questionTextMax);
    expect(result.questions[0].options[0].text).toHaveLength(EXAM_LIMITS.optionTextMax);
    expect(result.questions[0].options[1].text).toBe('short');
    expect(result.warnings.map((w) => w.message)).toEqual([
      expect.stringContaining(`question was longer than ${EXAM_LIMITS.questionTextMax}`),
      expect.stringContaining(`option A was longer than ${EXAM_LIMITS.optionTextMax}`),
    ]);
  });
});
