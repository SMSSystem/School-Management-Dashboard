import { Inflate, strFromU8 } from 'fflate';

// The text of a Word (.docx) file, one line per paragraph, for the exam import (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §4.4). A .docx is a zip of XML parts. Only `word/document.xml` (the body) and `word/numbering.xml` (what Word's
// automatic lists show) are opened. Word's own numbering — the "1." and "A." it adds when a list is switched on — is not
// part of the paragraph text, so it is worked out here from the numbering definitions, and written in front of the
// paragraph as if it had been typed. Tables, images, text boxes and deleted (tracked-change) text are skipped and
// counted so the teacher can be told. The XML is scanned by hand, without a DOM, so this runs the same in the browser
// and in the unit tests. Only text is ever taken from the file.

/** The most XML a body or numbering part may inflate to; a few hundred pages of questions is well under this. */
export const MAX_INFLATED_BYTES = 20 * 1024 * 1024;

/** The deepest list level Word has (0 to 8). */
const MAX_LEVEL = 8;

export type DocxLines = { lines: string[]; notes: string[] };

export class DocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxError';
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

type Token =
  | { kind: 'open'; name: string; attrs: string; selfClosing: boolean }
  | { kind: 'close'; name: string }
  | { kind: 'text'; text: string };

const TAG_NAME = /^[A-Za-z][\w:.-]*/;

/**
 * The tags and text of an XML part. Scanned by position, not by one big pattern: a comment, instruction or CDATA section
 * that is never closed (which a crafted file can repeat thousands of times) ends the scan, where a lazy pattern would
 * search to the end of the text again for each one and take quadratic time. Every step moves forward, and each
 * search for a closing mark is made once.
 */
function* tokens(xml: string): Generator<Token> {
  const end = xml.length;
  let i = 0;
  let gt = -2; // the first '>' found after some earlier position; still the first one while it is ahead of i
  while (i < end) {
    if (xml.charCodeAt(i) !== 60) {
      const next = xml.indexOf('<', i);
      const stop = next === -1 ? end : next;
      yield { kind: 'text', text: xml.slice(i, stop) };
      i = stop;
      continue;
    }
    if (xml.startsWith('<!--', i)) {
      const close = xml.indexOf('-->', i + 4);
      if (close === -1) return;
      i = close + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', i)) {
      const close = xml.indexOf(']]>', i + 9);
      if (close === -1) return;
      yield { kind: 'text', text: xml.slice(i + 9, close).replace(/&/g, '&amp;') }; // already plain text
      i = close + 3;
      continue;
    }
    if (xml.startsWith('<?', i)) {
      const close = xml.indexOf('?>', i + 2);
      if (close === -1) return;
      i = close + 2;
      continue;
    }
    if (gt <= i) {
      gt = xml.indexOf('>', i + 1);
      if (gt === -1) return;
    }
    const nextOpen = xml.indexOf('<', i + 1);
    if (nextOpen !== -1 && nextOpen < gt) {
      i += 1; // a stray '<' in front of a real tag: not a tag, and the text after it is read as text
      continue;
    }
    const inner = xml.slice(i + 1, gt);
    i = gt + 1;
    if (inner.startsWith('/')) {
      const name = TAG_NAME.exec(inner.slice(1).trim());
      if (name) yield { kind: 'close', name: name[0] };
      continue;
    }
    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const name = TAG_NAME.exec(body);
    if (!name) continue;
    const attrs = body.slice(name[0].length);
    if (attrs !== '' && !/^\s/.test(attrs)) continue;
    yield { kind: 'open', name: name[0], attrs, selfClosing };
  }
}

const attr = (attrs: string, name: string): string | undefined => {
  const m = new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}="([^"]*)"`).exec(attrs);
  return m ? decode(m[1]) : undefined;
};

// ── Numbering ───────────────────────────────────────────────────────────────

type Level = { fmt: string; text: string; start: number };
type AbstractNum = Map<number, Level>;
type Numbering = {
  abstract: Map<string, AbstractNum>;
  /** numId → the abstract list it uses, and whether it restarts the list (a level override). */
  nums: Map<string, { abstractId: string; restarts: boolean; starts: Map<number, number> }>;
};

function parseNumbering(xml: string | undefined): Numbering {
  const out: Numbering = { abstract: new Map(), nums: new Map() };
  if (!xml) return out;
  let abs: AbstractNum | null = null;
  let level: Level | null = null;
  let num: { abstractId: string; restarts: boolean; starts: Map<number, number> } | null = null;
  let overrideLevel = -1;
  for (const t of tokens(xml)) {
    if (t.kind === 'open') {
      switch (t.name) {
        case 'w:abstractNum':
          abs = new Map();
          out.abstract.set(attr(t.attrs, 'w:abstractNumId') ?? '', abs);
          break;
        case 'w:lvl': {
          const ilvl = Number(attr(t.attrs, 'w:ilvl') ?? 0);
          level = { fmt: 'decimal', text: `%${ilvl + 1}.`, start: 1 };
          if (abs) abs.set(ilvl, level);
          break;
        }
        case 'w:start':
          if (level) level.start = Number(attr(t.attrs, 'w:val') ?? 1);
          break;
        case 'w:numFmt':
          if (level) level.fmt = attr(t.attrs, 'w:val') ?? 'decimal';
          break;
        case 'w:lvlText':
          if (level) level.text = attr(t.attrs, 'w:val') ?? level.text;
          break;
        case 'w:num': {
          const id = attr(t.attrs, 'w:numId') ?? '';
          num = { abstractId: '', restarts: false, starts: new Map() };
          out.nums.set(id, num);
          break;
        }
        case 'w:abstractNumId':
          if (num) num.abstractId = attr(t.attrs, 'w:val') ?? '';
          break;
        case 'w:lvlOverride':
          overrideLevel = Number(attr(t.attrs, 'w:ilvl') ?? 0);
          break;
        case 'w:startOverride':
          if (num) {
            num.restarts = true;
            num.starts.set(overrideLevel, Number(attr(t.attrs, 'w:val') ?? 1));
          }
          break;
        default:
      }
    } else if (t.kind === 'close') {
      if (t.name === 'w:lvl') level = null;
      else if (t.name === 'w:abstractNum') abs = null;
      else if (t.name === 'w:num') num = null;
      else if (t.name === 'w:lvlOverride') overrideLevel = -1;
    }
  }
  return out;
}

const ROMAN: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];

function letters(n: number): string {
  let s = '';
  for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) s = String.fromCharCode(97 + ((v - 1) % 26)) + s;
  return s;
}

/** A counter written the way a list level's number format asks for. */
export function formatNumber(n: number, fmt: string): string {
  switch (fmt) {
    case 'upperLetter':
      return letters(n).toUpperCase();
    case 'lowerLetter':
      return letters(n);
    case 'upperRoman':
    case 'lowerRoman': {
      let rest = n;
      let s = '';
      for (const [v, r] of ROMAN) while (rest >= v) { s += r; rest -= v; }
      return fmt === 'upperRoman' ? s.toUpperCase() : s;
    }
    case 'decimalZero':
      return String(n).padStart(2, '0');
    case 'bullet':
    case 'none':
      return '';
    default:
      return String(n);
  }
}

/** Keeps the counters of each list and gives the text Word shows in front of a numbered paragraph. */
class Counters {
  private byList = new Map<string, number[]>();
  constructor(private readonly numbering: Numbering) {}

  marker(numId: string, ilvl: number): string | null {
    const num = this.numbering.nums.get(numId);
    if (!num) return null;
    const levels = this.numbering.abstract.get(num.abstractId);
    const level = levels?.get(ilvl);
    if (!levels || !level) return null;
    if (level.fmt === 'bullet' || level.fmt === 'none') return null;

    // Lists that share a definition continue each other, unless a numId restarts the list.
    const key = num.restarts ? `n${numId}` : `a${num.abstractId}`;
    const counters = this.byList.get(key) ?? [];
    this.byList.set(key, counters);
    const start = num.starts.get(ilvl) ?? level.start;
    counters[ilvl] = counters[ilvl] === undefined ? start : counters[ilvl] + 1;
    counters.length = ilvl + 1; // a deeper level starts again after this one

    const text = level.text.replace(/%(\d)/g, (_, d: string) => {
      const j = Number(d) - 1;
      const at = levels.get(j);
      if (!at) return '';
      const value = counters[j] ?? num.starts.get(j) ?? at.start;
      return formatNumber(value, at.fmt);
    });
    const cleaned = text.trim();
    if (cleaned === '') return null;
    return /[.)]$/.test(cleaned) ? cleaned : `${cleaned}.`;
  }
}

// ── The body ────────────────────────────────────────────────────────────────

// Parts of the body that are not running text. Entering one of these at the top level skips everything inside it.
const SKIPPED = new Map<string, 'table' | 'shape' | 'quiet'>([
  ['w:tbl', 'table'],
  ['w:drawing', 'shape'],
  ['w:pict', 'shape'],
  ['w:object', 'shape'],
  ['w:txbxContent', 'shape'],
  ['w:del', 'quiet'],
  ['mc:Fallback', 'quiet'],
]);

function bodyLines(xml: string, numbering: Numbering): DocxLines {
  const lines: string[] = [];
  const counters = new Counters(numbering);
  let tables = 0;
  let shapes = 0;

  let skipName = '';
  let skipDepth = 0;
  let paragraph: string[] | null = null;
  let numId = '';
  let ilvl = 0;
  let inText = false;

  const endParagraph = () => {
    if (!paragraph) return;
    const text = paragraph.join('');
    const marker = numId && numId !== '0' ? counters.marker(numId, ilvl) : null;
    const parts = text.split('\n');
    parts.forEach((part, i) => {
      const line = part.replace(/\s+/g, ' ').trim();
      lines.push(i === 0 && marker ? `${marker} ${line}`.trim() : line);
    });
    paragraph = null;
    numId = '';
    ilvl = 0;
  };

  for (const t of tokens(xml)) {
    if (skipDepth > 0) {
      if (t.kind === 'open' && t.name === skipName && !t.selfClosing) skipDepth += 1;
      else if (t.kind === 'close' && t.name === skipName) skipDepth -= 1;
      continue;
    }
    if (t.kind === 'open') {
      const skipKind = SKIPPED.get(t.name);
      if (skipKind && !t.selfClosing) {
        if (skipKind === 'table') tables += 1;
        else if (skipKind === 'shape') shapes += 1;
        skipName = t.name;
        skipDepth = 1;
        continue;
      }
      switch (t.name) {
        case 'w:p':
          if (!t.selfClosing) paragraph = [];
          else lines.push('');
          break;
        case 'w:t':
          inText = !t.selfClosing;
          break;
        case 'w:tab':
          paragraph?.push(' ');
          break;
        case 'w:br':
        case 'w:cr':
          paragraph?.push('\n');
          break;
        case 'w:noBreakHyphen':
          paragraph?.push('-');
          break;
        case 'w:numId':
          if (paragraph) numId = attr(t.attrs, 'w:val') ?? '';
          break;
        case 'w:ilvl':
          if (paragraph) ilvl = Math.min(MAX_LEVEL, Math.max(0, Math.trunc(Number(attr(t.attrs, 'w:val') ?? 0)) || 0));
          break;
        default:
      }
    } else if (t.kind === 'close') {
      if (t.name === 'w:t') inText = false;
      else if (t.name === 'w:p') endParagraph();
    } else if (inText && paragraph) {
      paragraph.push(decode(t.text));
    }
  }

  const notes: string[] = [];
  if (tables > 0) notes.push(`${tables} table${tables === 1 ? ' was' : 's were'} ignored; put questions in ordinary paragraphs.`);
  if (shapes > 0) notes.push(`${shapes} image${shapes === 1 ? ' or text box was' : 's or text boxes were'} ignored.`);
  return { lines, notes };
}

/**
 * Reads a .docx file's bytes into lines of text (plus notes about what was left out). Throws a DocxError, in words a
 * teacher can act on, for a file that is not a .docx, is damaged, or is an old .doc or a password-protected file.
 */
export function readDocxLines(bytes: Uint8Array): DocxLines {
  const parts = readZipParts(bytes, ['word/document.xml', 'word/numbering.xml']);
  const body = parts['word/document.xml'];
  if (!body) throw new DocxError(TOO_LARGE);
  try {
    return bodyLines(strFromU8(body), parseNumbering(parts['word/numbering.xml'] ? strFromU8(parts['word/numbering.xml']) : undefined));
  } catch (err) {
    if (err instanceof DocxError) throw err;
    throw new DocxError(UNREADABLE);
  }
}

// ── The zip ─────────────────────────────────────────────────────────────────

const UNREADABLE =
  'That file could not be read as a Word document. It may be an old .doc file, password-protected or damaged; save it as a .docx file and try again.';
const TOO_LARGE = 'That file is not a Word (.docx) document, or its text is too large to read.';

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** Compressed bytes handed to the inflater at a time: a crafted file inflates at most about 1,000 times that per step. */
const INFLATE_SLICE = 8 * 1024;

/**
 * Inflates one zip entry, stopping as soon as the output passes `max`. The zip's own sizes are not trusted (a crafted
 * file can claim a small size and inflate to gigabytes), so the output is counted as it appears and the work ends at the
 * cap.
 */
function inflateCapped(data: Uint8Array, max: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const inflater = new Inflate((chunk) => {
      total += chunk.length;
      chunks.push(chunk.slice());
    });
    for (let at = 0; at < data.length; at += INFLATE_SLICE) {
      inflater.push(data.subarray(at, at + INFLATE_SLICE), at + INFLATE_SLICE >= data.length);
      if (total > max) break;
    }
  } catch {
    throw new DocxError(UNREADABLE);
  }
  if (total > max) throw new DocxError(TOO_LARGE);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * The named parts of a zip file, found through its central directory (whose compressed sizes are right even when the
 * entries use data descriptors) and inflated with a cap. A file that is not a zip, is encrypted, uses zip64 or is
 * damaged is a DocxError.
 */
function readZipParts(bytes: Uint8Array, wanted: readonly string[]): Record<string, Uint8Array> {
  let eocd = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 65535); at -= 1) {
    if (u32(bytes, at) === 0x06054b50) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) throw new DocxError(UNREADABLE);
  const count = u16(bytes, eocd + 10);
  let at = u32(bytes, eocd + 16);
  if (count === 0xffff || at === 0xffffffff) throw new DocxError(UNREADABLE);

  const parts: Record<string, Uint8Array> = {};
  for (let n = 0; n < count; n += 1) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) throw new DocxError(UNREADABLE);
    const flags = u16(bytes, at + 8);
    const method = u16(bytes, at + 10);
    const size = u32(bytes, at + 20);
    const nameLength = u16(bytes, at + 28);
    const local = u32(bytes, at + 42);
    const name = strFromU8(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + u16(bytes, at + 30) + u16(bytes, at + 32);
    if (!wanted.includes(name)) continue;

    if ((flags & 1) !== 0 || size === 0xffffffff) throw new DocxError(UNREADABLE);
    if (local + 30 > bytes.length || u32(bytes, local) !== 0x04034b50) throw new DocxError(UNREADABLE);
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    if (start + size > bytes.length) throw new DocxError(UNREADABLE);
    const data = bytes.subarray(start, start + size);
    if (method === 0) {
      if (data.length > MAX_INFLATED_BYTES) throw new DocxError(TOO_LARGE);
      parts[name] = data;
    } else if (method === 8) {
      parts[name] = inflateCapped(data, MAX_INFLATED_BYTES);
    } else {
      throw new DocxError(UNREADABLE);
    }
  }
  return parts;
}
