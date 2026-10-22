import { EXAMPLE_PARAGRAPHS } from './exampleText';

// The Markdown template for the import dialog (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4): the same three
// example questions as the Word and PDF templates. The layout is plain lines, which is also valid Markdown, so the file
// reads the same in an editor and rendered; the reader also accepts headings, bold and list bullets (examMarkdown.ts).

/** The example as the text of a .md file (with a final line break). */
export function buildExampleMarkdown(): string {
  return `${EXAMPLE_PARAGRAPHS.join('\n')}\n`;
}
