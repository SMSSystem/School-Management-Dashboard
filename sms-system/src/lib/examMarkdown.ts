import type { ExamAnswerMode } from '@/types/exams';
import { questionsFromLines } from './examDocumentText';
import type { ImportResult } from './examImport';

// Reading questions from a Markdown (.md) file chosen in the import dialog (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §4.4). The layout is the Word and PDF one (a question starts with 1. or 1), options A. A) (A), an Answer: line, points
// in brackets), read by the same parser, so the checks and warnings are the same. What Markdown adds is tolerated: heading
// marks, bold and italic, code marks, block quotes, a list bullet in front of a question, an option or an answer, escaped
// punctuation, HTML tags (dropped as tags: only text is taken) and tables and rules (skipped and counted). Loaded only
// when a Markdown file is chosen. The file is read in the browser and forgotten.

// Escaped punctuation is parked in a private-use range while the emphasis marks are removed, then put back.
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!|>])/g;
const PARKED = /[-]/g;
const park = (s: string) => s.replace(ESCAPED, (_, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)));
const unpark = (s: string) => s.replace(PARKED, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000));

// A list bullet is removed only in front of something the parser reads: an option letter, a question number or an answer.
const BULLET_BEFORE_MARKER = /^\s*[-*+]\s+(?=(?:\(?[A-Za-z]\s*[.)]|\d{1,3}\s*[.)]|(?:Q(?:uestion)?\s*)\d|answers?\s*[:=]|ans\s*[:=]|correct))/i;

export type MarkdownLines = { lines: string[]; notes: string[] };

/** The lines of a Markdown text, without the marks, plus notes about what was skipped. */
export function markdownLines(text: string): MarkdownLines {
  const lines: string[] = [];
  let tableLines = 0;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    let line = raw.trim();
    if (/^(```|~~~)/.test(line)) continue; // the fence itself; the lines inside it are read as text
    if (/^(?:[-*_]\s*){3,}$/.test(line) || /^[=-]{3,}$/.test(line)) continue; // a rule, or the underline of a heading
    if (line.startsWith('|')) {
      tableLines += 1;
      continue;
    }
    line = park(line)
      .replace(/<[^>]*>/g, '') // tags: only the text between them is taken
      .replace(/^>+\s?/, '')
      .replace(/^#{1,6}\s+/, '')
      .replace(BULLET_BEFORE_MARKER, '')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(?<![\w*])[*_](\S(?:.*?\S)?)[*_](?![\w*])/g, '$1')
      .replace(/`+/g, '')
      .replace(/\s*\\$/, '')
      .trim();
    lines.push(unpark(line));
  }
  const notes = tableLines > 0 ? [`${tableLines} table line${tableLines === 1 ? ' was' : 's were'} ignored; put questions in ordinary lines.`] : [];
  return { lines, notes };
}

/** Turns the text of a Markdown file into questions and warnings; what was skipped is among the warnings, first. */
export function questionsFromMarkdown(text: string, answerMode: ExamAnswerMode | undefined): ImportResult {
  const { lines, notes } = markdownLines(text);
  const result = questionsFromLines(lines, answerMode);
  return { ...result, warnings: [...notes.map((message) => ({ message })), ...result.warnings] };
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
