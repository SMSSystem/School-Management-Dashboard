import { LAYOUT_EXAMPLE } from "@/lib/examImportGuide";

// What a Word, PDF or Markdown file must look like to be read (EXAMS_FEATURE_SPEC.md §4.4), with an example. The templates
// are downloaded from the menu below it. The reader finds questions by their layout, so the rules are short and exact;
// anything it cannot place is reported after the import and nothing is saved until the teacher presses Save.
export default function WordPdfGuide() {
  return (
    <details className="rounded-md bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
      <summary className="cursor-pointer font-medium">Word, PDF and Markdown files: the layout to use</summary>
      <div className="mt-2 flex flex-col gap-2">
        <ul className="list-disc pl-5">
          <li>
            Start each question with its number and a dot or bracket: <code>1.</code> or <code>1)</code>. Word&apos;s own automatic numbering works.
          </li>
          <li>
            Put each option on its own line, starting <code>A.</code>, <code>A)</code> or <code>(A)</code>, up to six options.
          </li>
          <li>
            Give the right answer on its own line: <code>Answer: B</code>, or <code>Answers: A, C</code> when there are several.
          </li>
          <li>
            Optionally add the points in brackets: <code>[2 marks]</code> or <code>(1 point)</code> (the default is 1).
          </li>
          <li>A long question or option can carry on to the next line. A title or instructions before question 1 are ignored.</li>
          <li>
            Tables and text boxes are ignored, so keep questions in ordinary paragraphs. A PDF must have text you can select
            (export it from Word); a scan or photo cannot be read. An old .doc file must be saved as .docx first. A Markdown file
            uses the same lines; headings, bold and list bullets in front of an option are allowed and ignored.
          </li>
          <li>
            <strong>Pictures (Word and PDF files).</strong> Put a picture in a paragraph of its own, or in the question&apos;s
            paragraph, <strong>under the question text and before the first option</strong>. A question keeps one picture. PNG, JPEG
            and WebP pictures in a Word file are read, up to 10 MB each; a GIF, SVG or EMF/WMF picture is not (save it as PNG or JPEG in
            Word). In a PDF, the pictures painted on the pages are read where they stand; a picture repeated on every page (a logo) or a
            very small one is left out, and a figure drawn with shapes is not a picture, so it is not found. A Word description of a
            picture becomes its alt text. After you choose the file, a step shows every picture with the question it was matched to,
            and you use, move or remove each one: a picture placed anywhere else is marked <em>Check</em>, and one above question 1
            belongs to no question. Pictures in tables and text boxes are ignored. Pictures in Markdown files are not imported yet; add
            them in the builder.
          </li>
        </ul>
        <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs dark:bg-gray-800" aria-label="Example layout">
          {LAYOUT_EXAMPLE.join("\n")}
        </pre>
      </div>
    </details>
  );
}
