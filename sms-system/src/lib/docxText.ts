import { strFromU8, unzipSync } from 'fflate';

// The text of a Word (.docx) file, one line per paragraph, for the exam import (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §4.4). A .docx is a zip of XML parts. Only `word/document.xml` (the body) and `word/numbering.xml` (what Word's
// automatic lists show) are opened. Word's own numbering — the "1." and "A." it adds when a list is switched on — is not
// part of the paragraph text, so it is worked out here from the numbering definitions, and written in front of the
// paragraph as if it had been typed. Tables, images, text boxes and deleted (tracked-change) text are skipped and
// counted so the teacher can be told. The XML is scanned by hand, without a DOM, so this runs the same in the browser
// and in the unit tests. Only text is ever taken from the file.

/** The most XML a body or numbering part may inflate to; a few hundred pages of questions is well under this. */
export const MAX_INFLATED_BYTES = 20 * 1024 * 1024;

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

const TOKEN = /<(\/?)([A-Za-z][\w:.-]*)((?:\s[^<>]*?)?)(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g;

function* tokens(xml: string): Generator<Token> {
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(xml); m; m = TOKEN.exec(xml)) {
    if (m[2]) {
      if (m[1]) yield { kind: 'close', name: m[2] };
      else yield { kind: 'open', name: m[2], attrs: m[3] ?? '', selfClosing: m[4] === '/' };
    } else if (m[5] !== undefined) yield { kind: 'text', text: m[5].replace(/&/g, '&amp;') }; // CDATA: already plain text
    else if (m[6] !== undefined) yield { kind: 'text', text: m[6] };
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
          if (paragraph) ilvl = Number(attr(t.attrs, 'w:val') ?? 0);
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
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(bytes, {
      filter: (file) => (file.name === 'word/document.xml' || file.name === 'word/numbering.xml') && file.originalSize <= MAX_INFLATED_BYTES,
    });
  } catch {
    throw new DocxError('That file could not be read as a Word document. It may be an old .doc file, password-protected or damaged; save it as a .docx file and try again.');
  }
  const body = parts['word/document.xml'];
  if (!body) {
    throw new DocxError('That file is not a Word (.docx) document, or its text is too large to read.');
  }
  return bodyLines(strFromU8(body), parseNumbering(parts['word/numbering.xml'] ? strFromU8(parts['word/numbering.xml']) : undefined));
}
