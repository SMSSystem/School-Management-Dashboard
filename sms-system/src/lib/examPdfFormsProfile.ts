import { KIND_MARKER_PREFIX, pictureIndexOf } from './examImportPictures';
import type { ImportWarning } from './examImport';

// Google Forms printouts (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.5). A form printed to PDF has none of the
// layout the question parser reads: the options have no letters, each question's text ends with its points ("1 point"), a
// line "Mark only one oval." or "Check all that apply." comes between the text and the options, every page has a header and
// a footer, the first item is "Email *", and there are no answers. This turns the lines of such a file into the layout the
// parser reads (`N. text [P points]`, `A. option`, a kind marker) and leaves the answers out: the import dialog asks for the
// key afterwards. It works on patterns, not positions, and is conservative: a file that does not have both an oval line and
// a points figure is not touched and is read by the documented layout. Pure.

const OVAL = /^(mark only one oval|check all that apply)\.?$/i;
const POINTS_AT_END = /^(.*?)\s*\*?\s*(\d+(?:\.\d+)?)\s+points?\s*\*?\s*$/i;
const STEM_START = /^(\d{1,3})\.\s+(.+)$/;
const DATE_START = /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}/;
const WEB_ADDRESS = /https?:\/\/\S+/i;
const PAGE_FIGURE = /^(\d{1,3})\s*\/\s*(\d{1,3})$/;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

const isMarker = (line: string) => pictureIndexOf(line) !== null;
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Is this the printout of a form? Both an oval line and a points figure at the end of a line are needed. */
export function detectFormsProfile(lines: readonly string[]): boolean {
  return lines.some((line) => OVAL.test(line.trim())) && lines.some((line) => POINTS_AT_END.test(line.trim()) && /points?\s*\*?\s*$/i.test(line.trim()));
}

/** The pages of the lines (they are separated by empty lines). */
function pagesOf(lines: readonly string[]): string[][] {
  const pages: string[][] = [[]];
  for (const line of lines) {
    if (line === '') pages.push([]);
    else pages[pages.length - 1].push(line);
  }
  return pages.filter((page) => page.length > 0);
}

/** The header and footer lines of a page: of the first and last two lines of text, the ones that are the date, a web address, the page figure or the form's title. */
function dropHeadersAndFooters(pages: string[][]): string[][] {
  const shape = (line: string) => tidy(line).toLowerCase().replace(/\d+/g, '#');
  const candidates = (page: string[]) => {
    const text = page.map((line, i) => ({ line, i })).filter(({ line }) => !isMarker(line));
    return [...text.slice(0, 2), ...text.slice(-2)];
  };
  // How many pages repeat each candidate line (digits blanked), for the form's title.
  const repeats = new Map<string, number>();
  for (const page of pages) {
    for (const key of new Set(candidates(page).map(({ line }) => shape(line)))) repeats.set(key, (repeats.get(key) ?? 0) + 1);
  }
  return pages.map((page, pageIndex) => {
    const first = new Set(page.map((line, i) => ({ line, i })).filter(({ line }) => !isMarker(line)).slice(0, 2).map(({ i }) => i));
    const drop = new Set<number>();
    for (const { line, i } of candidates(page)) {
      const text = tidy(line);
      const figure = PAGE_FIGURE.exec(text);
      if (
        (first.has(i) && DATE_START.test(text)) ||
        WEB_ADDRESS.test(text) ||
        (figure && figure[1] === String(pageIndex + 1) && figure[2] === String(pages.length)) ||
        (/[a-z]/i.test(text) && (repeats.get(shape(line)) ?? 0) >= Math.max(2, Math.ceil(pages.length / 2)))
      ) {
        drop.add(i);
      }
    }
    return page.filter((_, i) => !drop.has(i));
  });
}

type Item = { text: string } | { marker: string };

type Question = { points: string | null; stem: string[]; stemMarkers: string[]; kind: 'single' | 'multiple' | null; options: Item[] };

/**
 * The lines the question parser reads, for a Google Forms printout, and warnings about what the parser cannot see; null when
 * the lines are not a form's printout. Pictures keep their place: one between a question's text and its oval line stays before
 * the options (the parser takes it as clear), one among or after the options stays there (check). Pictures and text before
 * the first question are dropped.
 */
export function normalizeFormsLines(lines: readonly string[]): { lines: string[]; warnings: ImportWarning[] } | null {
  if (!detectFormsProfile(lines)) return null;
  const flat = dropHeadersAndFooters(pagesOf(lines)).flat();

  const questions: Question[] = [];
  let current: Question | null = null;
  // A question starts at "N. text" when its points are at the end of that line, or on one of the next few lines before the
  // oval line (where a printout puts them when the text wraps).
  const pointsAhead = (from: number): boolean => {
    for (let j = from + 1; j <= from + 3 && j < flat.length; j += 1) {
      if (isMarker(flat[j])) continue;
      const next = tidy(flat[j]);
      if (OVAL.test(next) || STEM_START.test(next)) return false;
      if (POINTS_AT_END.test(next)) return true;
    }
    return false;
  };
  flat.forEach((raw, at) => {
    const line = tidy(raw);
    if (isMarker(raw)) {
      if (current) {
        if (current.kind === null) current.stemMarkers.push(raw);
        else current.options.push({ marker: raw });
      }
      return;
    }
    const stem = STEM_START.exec(line);
    if (stem) {
      const withPoints = POINTS_AT_END.exec(stem[2]);
      if (withPoints) {
        current = { points: withPoints[2], stem: [tidy(withPoints[1])], stemMarkers: [], kind: null, options: [] };
        questions.push(current);
        return;
      }
      if (pointsAhead(at)) {
        current = { points: null, stem: [tidy(stem[2])], stemMarkers: [], kind: null, options: [] };
        questions.push(current);
        return;
      }
    }
    if (!current) return;
    const oval = OVAL.exec(line);
    if (oval && current.kind === null) {
      current.kind = /check all/i.test(oval[1]) ? 'multiple' : 'single';
      return;
    }
    if (current.kind !== null) {
      current.options.push({ text: line });
      return;
    }
    const late = current.points === null ? POINTS_AT_END.exec(line) : null;
    if (late) {
      current.points = late[2];
      if (tidy(late[1]) !== '') current.stem.push(tidy(late[1]));
    } else {
      current.stem.push(line);
    }
  });

  const out: string[] = [];
  const warnings: ImportWarning[] = [];
  questions.forEach((q, index) => {
    const points = Number(q.points ?? 1);
    out.push(`${index + 1}. ${tidy(q.stem.join(' '))} [${q.points ?? 1} ${points === 1 ? 'point' : 'points'}]`);
    out.push(...q.stemMarkers);
    if (q.kind) out.push(`${KIND_MARKER_PREFIX}${q.kind}`);
    let used = 0;
    for (const item of q.options) {
      if ('marker' in item) {
        out.push(item.marker);
      } else {
        // From the seventh on there is no letter: the line is joined to the sixth option by the parser.
        out.push(used < LETTERS.length ? `${LETTERS[used]}. ${item.text}` : item.text);
        used += 1;
      }
    }
    if (used > LETTERS.length) {
      warnings.push({ question: index + 1, message: `This question has ${used} options; an exam question has at most ${LETTERS.length}, so the extra ones were joined to the sixth. Check it.` });
    }
  });
  return { lines: out, warnings };
}
