import { strFromU8 } from 'fflate';
import { DocxError, TOO_LARGE, UNREADABLE, extractEntry, indexZip, type ZipEntry } from './docxZip';
import { MAX_PICTURE_BYTES, MAX_PICTURES, MAX_PICTURES_TOTAL_BYTES, PICTURE_MARKER_PREFIX, pictureIndexOf, type ImportPicture } from './examImportPictures';

export { DocxError };
export { MAX_PICTURE_BYTES, MAX_PICTURES, PICTURE_MARKER_PREFIX, pictureIndexOf };

// The text of a Word (.docx) file, one line per paragraph, for the exam import (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §4.4). A .docx is a zip of XML parts. Only `word/document.xml` (the body) and `word/numbering.xml` (what Word's
// automatic lists show) are opened. Word's own numbering — the "1." and "A." it adds when a list is switched on — is not
// part of the paragraph text, so it is worked out here from the numbering definitions, and written in front of the
// paragraph as if it had been typed. Tables, text boxes, shapes and deleted (tracked-change) text are skipped and
// counted so the teacher can be told. A picture (a `w:drawing` that holds a `pic:pic`) is found through the
// document's relationships and its file under `word/media/`, and written into the line stream as a marker line at the
// place it has in the paragraph (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.1); what the picture is
// (a format the browser can show, whether it is too large) is judged later, and nothing is decoded here. The XML is
// scanned by hand, without a DOM, so this runs the same in the browser and in the unit tests. Only text and the bytes
// of the pictures are ever taken from the file.

/** The most XML a body or numbering part may inflate to; a few hundred pages of questions is well under this. */
export const MAX_INFLATED_BYTES = 20 * 1024 * 1024;

/** The deepest list level Word has (0 to 8). */
const MAX_LEVEL = 8;

/** One use of a picture in the body (see ImportPicture). */
export type DocxPicture = ImportPicture;

export type DocxLines = { lines: string[]; notes: string[]; pictures: DocxPicture[] };

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

// Parts of the body that are not running text. Entering one of these at the top level skips everything inside it. (A
// `w:drawing` is not here: it is read for a picture, and counted as a shape when it holds none.)
const SKIPPED = new Map<string, 'table' | 'shape' | 'quiet'>([
  ['w:tbl', 'table'],
  ['w:pict', 'shape'],
  ['w:object', 'shape'],
  ['w:txbxContent', 'shape'],
  ['w:del', 'quiet'],
  ['mc:Fallback', 'quiet'],
]);

/** What is read from inside one `w:drawing` while it is open. */
type DrawingState = { depth: number; embed: string; alt: string; cropped: boolean; picture: boolean; textBox: boolean };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function bodyLines(xml: string, numbering: Numbering, pictures: PictureReader): { lines: string[]; notes: string[] } {
  const lines: string[] = [];
  const counters = new Counters(numbering);
  let tables = 0;
  let shapes = 0;
  let tablePictures = 0;

  let skipName = '';
  let skipDepth = 0;
  let paragraph: string[] | null = null;
  // The paragraph's text before each picture in it, and the picture's index: [text, index, text, index …].
  let segments: (string | number)[] = [];
  let drawing: DrawingState | null = null;
  let numId = '';
  let ilvl = 0;
  let inText = false;

  const endParagraph = () => {
    if (!paragraph) return;
    const marker = numId && numId !== '0' ? counters.marker(numId, ilvl) : null;
    if (segments.length === 0) {
      const parts = paragraph.join('').split('\n');
      parts.forEach((part, i) => {
        const line = part.replace(/\s+/g, ' ').trim();
        lines.push(i === 0 && marker ? `${marker} ${line}`.trim() : line);
      });
    } else {
      // A paragraph with pictures: the text around each one in order, no empty lines beside a picture, and the list
      // number in front of the first line of text (never in front of a marker).
      let pending = marker;
      for (const piece of [...segments, paragraph.join('')]) {
        if (typeof piece === 'number') {
          lines.push(`${PICTURE_MARKER_PREFIX}${piece}`);
          continue;
        }
        for (const part of piece.split('\n')) {
          const line = part.replace(/\s+/g, ' ').trim();
          if (line === '') continue;
          lines.push(pending ? `${pending} ${line}` : line);
          pending = null;
        }
      }
    }
    paragraph = null;
    segments = [];
    numId = '';
    ilvl = 0;
  };

  const placePicture = (d: DrawingState) => {
    const index = pictures.add(d.embed, d.alt, d.cropped);
    if (index === null) return;
    if (paragraph) {
      segments.push(paragraph.join(''), index);
      paragraph = [];
    } else {
      lines.push(`${PICTURE_MARKER_PREFIX}${index}`);
    }
  };

  for (const t of tokens(xml)) {
    if (skipDepth > 0) {
      if (t.kind === 'open' && t.name === skipName && !t.selfClosing) skipDepth += 1;
      else if (t.kind === 'close' && t.name === skipName) skipDepth -= 1;
      else if (t.kind === 'open' && t.name === 'a:blip' && skipName === 'w:tbl') tablePictures += 1;
      continue;
    }
    if (drawing) {
      if (t.kind === 'open') {
        switch (t.name) {
          case 'w:drawing':
            if (!t.selfClosing) drawing.depth += 1;
            break;
          case 'a:blip':
            if (!drawing.embed) drawing.embed = attr(t.attrs, 'r:embed') ?? '';
            break;
          case 'pic:pic':
            drawing.picture = true;
            break;
          case 'wp:docPr':
            drawing.alt = (attr(t.attrs, 'descr') ?? '').replace(/\s+/g, ' ').trim();
            break;
          case 'a:srcRect':
            if (['l', 't', 'r', 'b'].some((side) => Number(attr(t.attrs, side) ?? 0) !== 0)) drawing.cropped = true;
            break;
          case 'w:txbxContent':
          case 'wps:txbx':
            drawing.textBox = true;
            break;
          default:
        }
      } else if (t.kind === 'close' && t.name === 'w:drawing') {
        drawing.depth -= 1;
        if (drawing.depth === 0) {
          const done = drawing;
          drawing = null;
          if (done.picture && done.embed && !done.textBox) placePicture(done);
          else shapes += 1;
        }
      }
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
        case 'w:drawing':
          if (t.selfClosing) shapes += 1;
          else drawing = { depth: 1, embed: '', alt: '', cropped: false, picture: false, textBox: false };
          break;
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
  if (tablePictures > 0) notes.push(`${plural(tablePictures, 'picture', 'pictures')} in tables ${tablePictures === 1 ? 'was' : 'were'} ignored; put a picture in an ordinary paragraph under its question.`);
  if (shapes > 0) notes.push(`${shapes} text box${shapes === 1 ? ' or shape was' : 'es or shapes were'} ignored.`);
  notes.push(...pictures.notes());
  return { lines, notes };
}

// ── The pictures ────────────────────────────────────────────────────────────

/** Formats a browser cannot show; the others are judged later, from their bytes. */
const UNSUPPORTED_FORMATS = new Set(['emf', 'wmf', 'emz', 'wmz']);

/** `word/_rels/document.xml.rels`: relationship id → the target of each internal picture relationship. */
function parseRelationships(xml: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!xml) return out;
  for (const t of tokens(xml)) {
    if (t.kind !== 'open' || t.name !== 'Relationship') continue;
    const id = attr(t.attrs, 'Id');
    const target = attr(t.attrs, 'Target');
    if (!id || !target || attr(t.attrs, 'TargetMode') === 'External') continue;
    if ((attr(t.attrs, 'Type') ?? '').endsWith('/image')) out.set(id, target);
  }
  return out;
}

/** The zip path a relationship target names, or null when it is not a file under `word/media/`. */
export function mediaPathOf(target: string): string | null {
  let decoded = target;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    // keep the target as written
  }
  const parts: string[] = [];
  for (const part of (decoded.startsWith('/') ? decoded.slice(1) : `word/${decoded}`).split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '' && part !== '.') parts.push(part);
  }
  const path = parts.join('/');
  return path.startsWith('word/media/') && !path.endsWith('/') ? path : null;
}

/**
 * Gives the body its pictures: finds each one's file, reads it once however many times it is used, and keeps the limits (a
 * picture, all the pictures together, how many). A picture that cannot be had still gets an entry, so its place in the
 * paper is kept and the review can say what is wrong; a damaged or too large one never fails the whole file.
 */
class PictureReader {
  readonly list: DocxPicture[] = [];
  private readonly files = new Map<string, { bytes: Uint8Array | null; problem?: DocxPicture['problem'] }>();
  private total = 0;
  private extra = 0;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly zip: Map<string, ZipEntry>,
    private readonly relationships: Map<string, string>,
  ) {}

  /** The index of the new picture, or null when the paper already has the most that are read. */
  add(embed: string, alt: string, cropped: boolean): number | null {
    if (this.list.length >= MAX_PICTURES) {
      this.extra += 1;
      return null;
    }
    const path = mediaPathOf(this.relationships.get(embed) ?? '');
    const format = path ? (path.split('.').pop() ?? '').toLowerCase() : '';
    const file = path ? this.file(path, format) : { bytes: null, problem: 'missing' as const };
    this.list.push({ bytes: file.bytes, format, alt, cropped, ...(file.problem && { problem: file.problem }) });
    return this.list.length - 1;
  }

  private file(path: string, format: string): { bytes: Uint8Array | null; problem?: DocxPicture['problem'] } {
    const known = this.files.get(path);
    if (known) return known;
    const entry = this.zip.get(path);
    let out: { bytes: Uint8Array | null; problem?: DocxPicture['problem'] };
    if (!entry) {
      out = { bytes: null, problem: 'missing' };
    } else if (UNSUPPORTED_FORMATS.has(format)) {
      out = { bytes: null, problem: 'unsupported' };
    } else if (this.total + Math.min(entry.size, MAX_PICTURE_BYTES) > MAX_PICTURES_TOTAL_BYTES) {
      out = { bytes: null, problem: 'too_large' };
    } else {
      try {
        const bytes = extractEntry(this.bytes, entry, MAX_PICTURE_BYTES);
        if (this.total + bytes.length > MAX_PICTURES_TOTAL_BYTES) {
          out = { bytes: null, problem: 'too_large' };
        } else {
          this.total += bytes.length;
          out = { bytes };
        }
      } catch (err) {
        out = { bytes: null, problem: err instanceof DocxError && err.message === TOO_LARGE ? 'too_large' : 'missing' };
      }
    }
    this.files.set(path, out);
    return out;
  }

  /** What to tell the teacher about the pictures that cannot be used as they are. */
  notes(): string[] {
    const count = (problem: DocxPicture['problem']) => this.list.filter((p) => p.problem === problem).length;
    const notes: string[] = [];
    const unsupported = count('unsupported');
    if (unsupported > 0) notes.push(`${plural(unsupported, 'picture is', 'pictures are')} in a format that cannot be imported (EMF or WMF). Save ${unsupported === 1 ? 'it' : 'them'} as PNG or JPEG in Word.`);
    const missing = count('missing');
    if (missing > 0) notes.push(`${plural(missing, 'picture', 'pictures')} could not be found in the file or could not be read.`);
    const large = count('too_large');
    if (large > 0) notes.push(`${plural(large, 'picture was', 'pictures were')} left out because ${large === 1 ? 'it is' : 'they are'} too large (the limit is ${MAX_PICTURE_BYTES / (1024 * 1024)} MB for a picture and ${MAX_PICTURES_TOTAL_BYTES / (1024 * 1024)} MB together).`);
    if (this.extra > 0) notes.push(`${plural(this.extra, 'picture', 'pictures')} after the first ${MAX_PICTURES} ${this.extra === 1 ? 'was' : 'were'} left out.`);
    const cropped = this.list.filter((p) => p.cropped).length;
    if (cropped > 0) notes.push(`${plural(cropped, 'picture was', 'pictures were')} cropped in Word; the whole original is used.`);
    return notes;
  }
}

/**
 * Reads a .docx file's bytes into lines of text (plus notes about what was left out). Throws a DocxError, in words a
 * teacher can act on, for a file that is not a .docx, is damaged, or is an old .doc or a password-protected file.
 */
export function readDocxLines(bytes: Uint8Array): DocxLines {
  const zip = indexZip(bytes);
  const part = (name: string) => {
    const entry = zip.get(name);
    return entry ? extractEntry(bytes, entry, MAX_INFLATED_BYTES) : undefined;
  };
  const body = part('word/document.xml');
  if (!body) throw new DocxError(TOO_LARGE);
  const numbering = part('word/numbering.xml');
  const relationships = part('word/_rels/document.xml.rels');
  try {
    const pictures = new PictureReader(bytes, zip, parseRelationships(relationships ? strFromU8(relationships) : undefined));
    const { lines, notes } = bodyLines(strFromU8(body), parseNumbering(numbering ? strFromU8(numbering) : undefined), pictures);
    return { lines, notes, pictures: pictures.list };
  } catch (err) {
    if (err instanceof DocxError) throw err;
    throw new DocxError(UNREADABLE);
  }
}
