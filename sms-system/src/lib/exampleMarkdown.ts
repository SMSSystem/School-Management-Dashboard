import { EXAMPLE_PARAGRAPHS } from './exampleText';

// The Markdown template for the import dialog (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4): the same three
// example questions as the Word and PDF templates. The layout is plain lines, which is also valid Markdown, so the file
// reads the same in an editor and rendered; the reader also accepts headings, bold and list bullets (examMarkdown.ts).
// The first line is a comment: not shown when the file is rendered, dropped by the reader (tags are dropped and an empty
// line is ignored), so it says that pictures are not imported from Markdown yet without making the template report anything.

/** The note at the top of the Markdown template. */
export const MARKDOWN_PICTURE_NOTE = '<!-- Pictures are not imported from a Markdown file yet; add them in the builder after the import. -->';

/** The example as the text of a .md file (with a final line break). */
export function buildExampleMarkdown(): string {
  return `${MARKDOWN_PICTURE_NOTE}\n${EXAMPLE_PARAGRAPHS.join('\n')}\n`;
}
