import type { ExamAnswerMode } from '@/types/exams';
import { questionsFromLines } from './examDocumentText';
import type { ImportResult } from './examImport';
import { MAX_PICTURE_BYTES, MAX_PICTURES, MAX_PICTURES_TOTAL_BYTES, PICTURE_MARKER_PREFIX, decodeBase64, type ImportPicture } from './examImportPictures';

// Reading questions from a Markdown (.md) file chosen in the import dialog (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §4.4). The layout is the Word and PDF one (a question starts with 1. or 1), options A. A) (A), an Answer: line, points
// in brackets), read by the same parser, so the checks and warnings are the same. What Markdown adds is tolerated: heading
// marks, bold and italic, code marks, block quotes, a list bullet in front of a question, an option or an answer, escaped
// punctuation, HTML tags (dropped as tags: only text is taken) and tables and rules (skipped and counted). Loaded only
// when a Markdown file is chosen. The file is read in the browser and forgotten. A picture embedded as an image with a base64
// data address (`![alt](data:image/png;base64,…)`) becomes a marker line where it stands, as in a Word file, and is placed
// and reviewed the same way; an image with a web address is ignored with a note (the page's policy does not load it and a
// paper should not depend on another server).

// Escaped punctuation is parked in a private-use range while the emphasis marks are removed, then put back.
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!|>])/g;
const PARKED = /[-]/g;
const park = (s: string) => s.replace(ESCAPED, (_, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)));
const unpark = (s: string) => s.replace(PARKED, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000));

// A list bullet is removed only in front of something the parser reads: an option letter, a question number or an answer.
const BULLET_BEFORE_MARKER = /^\s*[-*+]\s+(?=(?:\(?[A-Za-z]\s*[.)]|\d{1,3}\s*[.)]|(?:Q(?:uestion)?\s*)\d|answers?\s*[:=]|ans\s*[:=]|correct))/i;

export type MarkdownLines = { lines: string[]; notes: string[]; pictures: ImportPicture[] };

type Piece = { text: string } | { alt: string; address: string };

/**
 * The text and the images of a line, in order, or null when the line has no image. Found by scanning for `![`, `](` and `)`
 * (a picture's address can be megabytes long, so no pattern is run over it); an escaped `\![` and a bracket that is not an
 * image are left as text. The address ends at the first space (a title may follow) or at the closing bracket.
 */
function splitImages(line: string): Piece[] | null {
  if (!line.includes('![')) return null;
  const pieces: Piece[] = [];
  let at = 0;
  let search = 0;
  for (;;) {
    const start = line.indexOf('![', search);
    if (start === -1) break;
    if (start > 0 && line[start - 1] === '\\') {
      search = start + 2;
      continue;
    }
    const middle = line.indexOf('](', start + 2);
    if (middle === -1) break;
    const alt = line.slice(start + 2, middle);
    if (alt.includes(']') || alt.includes('[')) {
      search = start + 2;
      continue;
    }
    const close = line.indexOf(')', middle + 2);
    if (close === -1) break;
    const space = line.indexOf(' ', middle + 2);
    const end = space !== -1 && space < close ? space : close;
    let address = line.slice(middle + 2, end).trim();
    if (address.startsWith('<') && address.endsWith('>')) address = address.slice(1, -1);
    if (start > at) pieces.push({ text: line.slice(at, start) });
    pieces.push({ alt: alt.replace(/\s+/g, ' ').trim(), address });
    at = close + 1;
    search = at;
  }
  if (pieces.length === 0) return null;
  if (at < line.length) pieces.push({ text: line.slice(at) });
  return pieces;
}

const DATA_ADDRESS = /^data:image\/([a-z0-9.+-]+)((?:;[^,;]*)*),/i;

/** One image of the text: a picture the file holds, or why not. */
function pictureOf(alt: string, address: string, bytesSoFar: number): { picture: ImportPicture; bytes: number } | 'web' {
  const head = DATA_ADDRESS.exec(address.slice(0, 200));
  if (!head) return /^data:/i.test(address) ? { picture: { bytes: null, format: '', alt, cropped: false, problem: 'unsupported' }, bytes: 0 } : 'web';
  const format = head[1].toLowerCase().replace('+xml', '').replace('jpg', 'jpeg');
  if (!/;base64/i.test(head[2])) return { picture: { bytes: null, format, alt, cropped: false, problem: 'unsupported' }, bytes: 0 };
  const decoded = decodeBase64(address.slice(head[0].length), Math.min(MAX_PICTURE_BYTES, MAX_PICTURES_TOTAL_BYTES - bytesSoFar));
  if ('problem' in decoded) {
    return { picture: { bytes: null, format, alt, cropped: false, problem: decoded.problem === 'too_large' ? 'too_large' : 'missing' }, bytes: 0 };
  }
  return { picture: { bytes: decoded.bytes, format, alt, cropped: false }, bytes: decoded.bytes.length };
}

/** The lines of a Markdown text, without the marks, plus notes about what was skipped and the pictures embedded in it. */
export function markdownLines(text: string): MarkdownLines {
  const lines: string[] = [];
  const pictures: ImportPicture[] = [];
  let tableLines = 0;
  let web = 0;
  let extra = 0;
  let pictureBytes = 0;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) continue; // the fence itself; the lines inside it are read as text
    if (/^(?:[-*_]\s*){3,}$/.test(line) || /^[=-]{3,}$/.test(line)) continue; // a rule, or the underline of a heading
    if (line.startsWith('|')) {
      tableLines += 1;
      continue;
    }
    const pieces = splitImages(line);
    if (pieces) {
      // The text around each image is a line of its own (as around a picture in a Word paragraph); empty parts are dropped.
      for (const piece of pieces) {
        if ('text' in piece) {
          const cleaned = cleanLine(piece.text);
          if (cleaned !== '') lines.push(cleaned);
          continue;
        }
        const made = pictures.length >= MAX_PICTURES ? null : pictureOf(piece.alt, piece.address, pictureBytes);
        if (made === 'web') web += 1;
        else if (made === null) extra += 1;
        else {
          pictureBytes += made.bytes;
          pictures.push(made.picture);
          lines.push(`${PICTURE_MARKER_PREFIX}${pictures.length - 1}`);
        }
      }
      continue;
    }
    lines.push(cleanLine(line));
  }
  const notes: string[] = [];
  if (tableLines > 0) notes.push(`${tableLines} table line${tableLines === 1 ? ' was' : 's were'} ignored; put questions in ordinary lines.`);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (web > 0) {
    notes.push(`${plural(web, 'picture with a web address was', 'pictures with a web address were')} ignored: a paper should not depend on another server. Embed the picture in the file or add it in the builder.`);
  }
  const unreadable = pictures.filter((p) => p.problem === 'unsupported' || p.problem === 'missing').length;
  if (unreadable > 0) notes.push(`${plural(unreadable, 'picture', 'pictures')} could not be read from the file (only a picture embedded as a base64 data address is read).`);
  const large = pictures.filter((p) => p.problem === 'too_large').length;
  if (large > 0) {
    notes.push(
      `${plural(large, 'picture was', 'pictures were')} left out because ${large === 1 ? 'it is' : 'they are'} too large (the limit is ${MAX_PICTURE_BYTES / (1024 * 1024)} MB for a picture and ${MAX_PICTURES_TOTAL_BYTES / (1024 * 1024)} MB together).`,
    );
  }
  if (extra > 0) notes.push(`${plural(extra, 'picture', 'pictures')} after the first ${MAX_PICTURES} ${extra === 1 ? 'was' : 'were'} left out.`);
  return { lines, notes, pictures };
}

/** One line of Markdown as plain text: no marks, tags, quote or heading signs, and no bullet in front of something the parser reads. */
function cleanLine(raw: string): string {
  const line = park(raw.trim())
    .replace(/<[^>]*>/g, '') // tags: only the text between them is taken
    .replace(/^>+\s?/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(BULLET_BEFORE_MARKER, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![\w*])[*_](\S(?:.*?\S)?)[*_](?![\w*])/g, '$1')
    .replace(/`+/g, '')
    .replace(/\s*\\$/, '')
    .trim();
  return unpark(line);
}

/** Turns the text of a Markdown file into questions and warnings; what was skipped is among the warnings, first. */
export function questionsFromMarkdown(text: string, answerMode: ExamAnswerMode | undefined): ImportResult {
  const { lines, notes, pictures } = markdownLines(text);
  const result = questionsFromLines(lines, answerMode);
  return {
    ...result,
    warnings: [...notes.map((message) => ({ message })), ...result.warnings],
    // Only when the file had pictures; a result without them is exactly what it was before pictures were read.
    ...(pictures.length > 0 && { pictures }),
  };
}

/** Reads a chosen .md file. Throws an Error with a message for the teacher when it cannot be read. */
export async function readMarkdownFile(file: File, answerMode: ExamAnswerMode | undefined): Promise<ImportResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error('That file could not be opened. Choose it again.');
  }
  return questionsFromMarkdown(text, answerMode);
}
