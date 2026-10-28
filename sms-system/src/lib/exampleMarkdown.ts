import { EXAMPLE_PARAGRAPHS } from './exampleText';

// The Markdown template for the import dialog (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4): the same three
// example questions as the Word and PDF templates. The layout is plain lines, which is also valid Markdown, so the file
// reads the same in an editor and rendered; the reader also accepts headings, bold and list bullets (examMarkdown.ts).
// The first line is a comment: not shown when the file is rendered, dropped by the reader (tags are dropped and an empty
// line is ignored), so it says how a picture is added to a Markdown file without making the template report anything (it holds no image syntax, so it yields no picture).

/** The note at the top of the Markdown template. */
export const MARKDOWN_PICTURE_NOTE =
  '<!-- Pictures: put one under a question\'s text as an image with a data address (data:image/png;base64,...); it is reviewed after the import. A picture with a web address is ignored. -->';

/** The example as the text of a .md file (with a final line break). */
export function buildExampleMarkdown(): string {
  return `${MARKDOWN_PICTURE_NOTE}\n${EXAMPLE_PARAGRAPHS.join('\n')}\n`;
}
