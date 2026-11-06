# Rubrics: Upload, Download, Templates and Carousel (Spec)

> **Status:** Stage 1 is built: the carousel, uploading, storing and downloading. The rules and the index exemption were deployed on 2026-11-04, and `e2e/rubric-files.spec.ts` passes against them. The files still need opening in their own apps, and the carousel needs trying on a real device. Stage 2 is built: reading, review and templates (items 2.1 to 2.10), and the list filter, the tour and the student and parent help (items 2.11 to 2.13). Stage 3 is deferred. Written 2026-11-04 from a brainstorm with the owner, who made the decisions in section 2.1. The decisions in section 2.2 are still open.
> **Feature:** admins and teachers can upload a rubric as a spreadsheet, Word document, PDF or Markdown file, and download a template to fill in. Every role except spectator can download rubrics. A rubric's criteria are viewed in a carousel with swipe support.
> **Hard constraint:** Firebase Spark only (no Blaze, Cloud Functions or Cloud Storage).
> **Primary roles:** `institution_admin`, `senior_teacher`, `regular_teacher` (upload and manage); `student`, `parent` (download from an assignment); `spectator` (view only).
> **Out of scope:** scoring against criteria while grading, rubric versions, bulk upload, in-app file preview, and `super_admin` access until an institution picker exists.
> **Extends:** `ASSIGNMENTS_FEATURE_SPEC.md` (sections 4.4 and 5.2).

---

## 1. Overview

A rubric has two possible forms: **a grid** the app can display, and **an original file** it stores and hands back. A rubric needs at least one of them.

| Rubric type      | Grid | File | How it is made                                         |
| ---------------- | ---- | ---- | ------------------------------------------------------ |
| Typed            | Yes  | No   | The existing form. Every rubric today is this type.    |
| Read from a file | Yes  | Yes  | Upload, then review the grid the app found, then save. |
| File-only        | No   | Yes  | Upload of a scan or a layout the app can't read.       |

Delivery has four stages (section 14):

| Stage | Delivers                                                          |
| ----- | ----------------------------------------------------------------- |
| **0** | Preparation: sample files, open decisions, this spec              |
| **1** | The carousel (can ship alone), then storing and downloading files |
| **2** | Reading files into the grid, templates, the tour                  |
| **3** | PDF reading, only if real samples justify it                      |

### Feasibility

- **Most parts exist.** The exam import reads the same kinds of file, the lesson-note work solved inline file storage, and the app already builds PDF and Excel files in the browser.
- **Reading a grid out of a PDF is the one unreliable part** (section 7.4).
- **Real files differ from this design.** Stage 2 reads the layout in section 8.3. Real rubrics seen so far use other layouts, and some hold student data (section 7.5), so accommodating them is a separate, later plan.

---

## 2. Decisions

### 2.1 Made by the owner

| #   | Topic                     | Decision                                                                                                                                                                                                                               |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Upload model              | The original file is always kept. The app also tries to read it into the grid for review. If it can't, the rubric stays file-only.                                                                                                     |
| D2  | Size and storage          | 500 KB, stored in Firestore. No Realtime Database.                                                                                                                                                                                     |
| D3  | Student and parent access | Download from the assignment page only. No library page or sidebar item.                                                                                                                                                               |
| D4  | File control              | The uploader and admins may replace or remove a file, enforced in rules. Any teacher can still edit the grid.                                                                                                                          |
| D5  | Template formats          | CSV, Excel, Word and Markdown. PDF is added only if PDF reading ships in Stage 3.                                                                                                                                                      |
| D6  | Template location         | The Rubrics page only, not a new Import Data target.                                                                                                                                                                                   |
| D7  | Carousel location         | The view modal and the assignment page's `RubricSection`, using one shared component.                                                                                                                                                  |
| D8  | Carousel screen sizes     | All sizes: buttons and a jump list everywhere, arrow keys on a keyboard, swipe on touch.                                                                                                                                               |
| D9  | Short rubrics             | Always the carousel, however few criteria. A rubric with one criterion shows no controls.                                                                                                                                              |
| D10 | Uploader's delete         | A teacher may delete a rubric they created, if it has their own uploaded file. Typed rubrics stay admin-only. It may be on colleagues' assignments, which then show it as missing.                                                     |
| D11 | `super_admin`             | Hidden from the Rubrics page and sidebar until an institution picker exists.                                                                                                                                                           |
| D12 | Spreadsheet formulas      | A CSV with formula-looking cells that aren't numbers is refused. An Excel file with formula cells gets a warning.                                                                                                                      |
| D13 | Confirming a file         | Every upload, replacement or attachment needs a tick saying the file holds no student names, marks or answer keys. An Excel file with more than one sheet, or a hidden one, also lists its sheets. The file is still always kept (D1). |
| D14 | Stage 3                   | Deferred. PDFs stay file-only, and PDF reading is decided with the future item in section 7.5.                                                                                                                                         |
| D15 | Student and parent help   | Plain helper text on the assignment page, not a mini-tour (was Q7).                                                                                                                                                                    |

### 2.2 Open: not yet decided

This spec is written using the suggested answers. Items in section 14 that depend on one say so.

| #   | Question                                                                                           | Suggested answer                                            |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A1  | Does "admin/teacher" mean `institution_admin`, `senior_teacher` and `regular_teacher`?             | Yes. It matches who can upload large files today.           |
| A2  | Does `super_admin` wait for an institution picker?                                                 | Yes. The page can't load rubrics for that role (section 3). |
| A3  | Does "spreadsheet" mean `.xlsx` and `.csv`, with `.xls` and `.xlsm` refused?                       | Yes. `.xlsm` can carry macros.                              |
| A4  | Does "Word" mean `.docx`, with `.doc` and `.docm` refused?                                         | Yes. The existing reader handles only `.docx`.              |
| A5  | Does "download" include grids as well as uploaded files?                                           | Yes. Existing rubrics have a grid and no file.              |
| A6  | One file per rubric?                                                                               | Yes. Replacing is simple, and costs stay predictable.       |
| Q1  | For a file over 500 KB that can still be read: refuse it, or save only the grid and drop the file? | Refuse. Reconsider after seeing samples. Saving relaxes D1. |
| Q3  | Should a spectator get generated downloads? The block doesn't truly protect the grid.              | No, as the owner asked. Worth revisiting for sales demos.   |
| Q4  | Can a second teacher take over a file if the uploader has left?                                    | No. An admin can replace it.                                |
| Q5  | Should senior teachers manage files in their department? Needs a new `departmentId` field.         | Not now.                                                    |
| Q8  | Should the first release move the Rubrics list to a cached query?                                  | No. Measure first.                                          |

---

## 3. Current behaviour

| Part             | Today                                                                                                    | Where                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Data             | `institutions/{id}/rubrics/{rubricId}`: title, optional description, `criteria[]`, each with `levels[]`  | `src/types/assessment.ts`                                        |
| Page             | `/dashboard/list/rubrics`, staff view only. A live listener reads every rubric.                          | `src/scenes/(dashboard)/list/rubrics/index.tsx`                  |
| Create and edit  | Admins and both teacher roles (the page's local `canManage`, not the admin-only helper of the same name) | `src/components/forms/RubricForm.tsx`                            |
| Delete           | Admins only, in the UI and the rules                                                                     | `firestore.rules`                                                |
| View             | A modal that stacks every criterion in one scrolling card                                                | `src/components/forms/RubricViewModal.tsx`                       |
| Attach           | Optional `rubricId` on an assignment. The form reads every rubric for its picker.                        | `src/hooks/useAssignmentFormOptions.ts`                          |
| Show to students | One long table on the assignment page, for every role that can open it                                   | `src/scenes/(dashboard)/list/assignments/[id]/RubricSection.tsx` |
| Rules            | Any institution member can read. Any teacher or above can write. No shape checks.                        | `firestore.rules`                                                |

Three facts shape the design:

- **Rubrics are display-only.** Neither `GradeDialog.tsx` nor `grading.ts` reads them, so a teacher can't score against criteria. That makes a file-only rubric a reasonable outcome.
- **Decision 22 of `ASSIGNMENTS_FEATURE_SPEC.md` still applies.** The rules stay broad, and the app shows a rubric only through an assignment the viewer can already see. D3 follows it.
- **`super_admin` can't use the page.** Read from the code, not run: the page returns early for `*` without clearing `loading`, so the list never finishes loading. It still shows the create button, and `institutionCollection` throws on `*`.

---

## 4. Data model

```text
institutions/{institutionId}/rubrics/{rubricId}                 small; read by lists
institutions/{institutionId}/rubrics/{rubricId}/file/current    the file body; read only on click
```

```ts
// Added to RubricDocument
type RubricFileMeta = {
  fileName: string;
  mimeType: string;
  size: number; // raw bytes
  uploadedBy: string; // uid; the rules use this for D4
  uploadedByName: string; // shown on the page; may go stale after a rename
  uploadedAt: Timestamp;
};
// file?: RubricFileMeta
// updatedAt?: Timestamp  // set on each grid save, so the UI can tell the grid changed after the upload
// criteria stays required, and is [] on a file-only rubric

// rubrics/{rubricId}/file/current
type RubricFileDocument = {
  institutionId: string;
  dataUrl: string; // data:<mime>;base64,... at most 700,000 characters
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Timestamp;
};
```

- **The body never goes on the rubric document.** The list page and the assignment form read every rubric, so inline files would be downloaded each time either one opens.
- **The subcollection is named `file`, not `attachment`.** `scripts/sweep-orphan-blobs.mjs` reads `collectionGroup('attachment')` across the project, so reusing that name would add every rubric file to its reads.
- **`criteria` stays an array.** It is `[]` on a file-only rubric, not missing, because the list page reads `item.criteria.length`.
- **`dataUrl` is left out of indexing** (section 10.1).
- **No migration.** Old rubrics simply have no `file` field.

---

## 5. Constants

| Name               | Value                                 | Note                                                   |
| ------------------ | ------------------------------------- | ------------------------------------------------------ |
| Largest file       | 512,000 bytes                         | `MAX_SOURCE_FILE_BYTES` in `src/lib/documentUpload.ts` |
| Largest `dataUrl`  | 700,000 characters                    | Same as the existing inline limit                      |
| Largest `fileName` | 255 characters                        | Rules                                                  |
| Largest title      | 150 characters                        | Same as `RubricForm`                                   |
| Most criteria      | 50                                    | Import limit and rules                                 |
| Most levels        | 10 per criterion                      | Import limit                                           |
| Soft school limit  | 200 files                             | UI only, from the list in memory. Rules can't count.   |
| Swipe              | 64 px, mostly sideways, within 800 ms | Existing `SWIPE` in `src/lib/examCarousel.ts`          |

---

## 6. Carousel

**Why:** a rubric with many criteria and several levels each is a long scroll. This replaces the stacked list in `RubricViewModal` and the long table in `RubricSection` (D7), at every screen size (D8), for every rubric that has a grid (D9).

### 6.1 Behaviour

- Shows one criterion at a time, with its max points and levels, under "Criterion 3 of 12".
- Has Previous and Next buttons and a native jump list of criterion names. Dots wouldn't scale to 50 criteria.
- Responds to a sideways swipe on touch screens, and to the left and right arrow keys while focus is inside it.
- Never rotates by itself, and stops at each end rather than wrapping.
- Resets the slide's scroll position on each move. A criterion with long descriptions still scrolls within the slide.
- Stays in range if a live update removes criteria while it's open.
- Hides its controls for one criterion, and gives way to the file-only message for none.

### 6.2 What can be reused

No new dependency is needed.

| Piece                             | File                                                        | Note                                                   |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| Swipe gesture                     | `src/hooks/useSwipe.ts`, `src/lib/swipeTracker.ts`          | Needs one change (section 6.3).                        |
| Swipe limits and index arithmetic | `swipeDirection`, `clampIndex` in `src/lib/examCarousel.ts` |                                                        |
| Slide movement                    | `exam-slide-*` classes in `src/index.css`, `slideClassName` | Already instant for people who ask for reduced motion. |
| Vertical scrolling during a swipe | Tailwind's `touch-pan-y`                                    | As `CarouselRegion.tsx` uses it.                       |
| Dialog behaviour                  | `src/components/DialogShell.tsx`                            | A model for Escape and focus handling.                 |

### 6.3 Catches in the existing code

1. **Swipes are ignored inside dialogs.** `useSwipe.ts` drops any touch that starts inside `[role="dialog"]`, so that a picture zoom over an exam doesn't change the question. `RubricViewModal` has no such role today, but needs one for accessibility, and adding it would silently stop swipes working. Add an opt-in option to the hook and leave the exam's default alone. `carouselMotion.test.ts` pins the hook's text, so keep those checks.
2. **`CarouselRegion` can't be reused as it is.** It hard-codes the label "Exam questions" and focuses a question heading, and `positionText` says "Question". Write a small `RubricCarousel.tsx` that calls the shared pieces.
3. **Nothing in the app uses arrow keys yet.** Listen only while focus is inside the carousel, or it would fight with page scrolling and form fields.

### 6.4 Accessibility

Following the [WAI-ARIA carousel pattern](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/):

- A labelled group with `aria-roledescription="carousel"`, each slide labelled, and a polite announcement of the position.
- Previous and Next are native buttons with clear names, and pressing them doesn't move focus, so they can be pressed repeatedly. This differs from the exam carousel, which moves focus to the new question's heading.
- Use `aria-disabled` at each end instead of `disabled`, so focus isn't lost when the button stops working.
- The modal gains `role="dialog"`, a label, Escape to close, and focus that stays inside and returns afterwards.

### 6.5 As built

- `RubricCarousel.tsx` also reuses `QuestionSlide` for the slide movement.
- The fixed-height box sits above the controls, so they stay in the same place from one criterion to the next. A rubric with one criterion has no fixed height.
- `RubricViewModal` now uses `DialogShell`, with a new `card` size, for its role, Escape and focus handling. Its large icon header is gone, to leave more room for the criteria.
- `DialogShell` no longer puts the first focus on a button marked `aria-disabled`, so the dialog opens with the focus on Next.
- On the assignment page, the carousel replaces the table, and the unused `rubricColumns` is removed.
- **Checked** in a browser with touch emulation, on the real components with sample data, outside the app: swipe, buttons, jump list, arrow keys, focus, phone, tablet and desktop sizes, dark mode and reduced motion.
- **Checked in the signed-in app** by `e2e/rubric-carousel.spec.ts`, for the view dialog only: swipe, buttons, jump list, arrow keys, Escape and focus.
- **Checked on the assignment page** in the signed-in app by `e2e/rubric-files.spec.ts`, as a student: the buttons and a download.
- **Not yet checked:** a real phone or tablet.

### 6.6 Files as built (Stage 1)

- **Upload adds a file-only rubric.** A grid is added afterwards through Edit. Reading the file into the grid comes in Stage 2.
- **Any teacher can attach a file to a rubric with none,** as they can edit its grid. The attaching teacher then owns the file.
- **Download choices open in a small dialog,** not a drop-down, because a table row's cell would clip one.
- **Excel formulas are found by scanning the sheet XML,** so checking a file doesn't load the spreadsheet library.
- **Generated Excel cells stay text,** tested: a name starting with `=` is stored as a string with no formula.
- **Audit:** uploading, replacing, removing and deleting a file write a `rubric_file_edit` entry in the same batch.
- **Other new files:** `rubricTable.ts` holds the pure table logic, `docxWriter.ts` the Word file shared with the exam example, `rubricWordFile.ts` the Word table, and `RubricFileDetails.tsx` the line about a stored file. `rubricFile.ts` loads only when a file is chosen, so the zip library stays out of the page.
- **Checked:** 35 rules tests on the emulator, unit tests with real generated files, and the real components in a browser with a stand-in for Firebase, including each downloaded file.
- **Checked against the deployed rules** by `e2e/rubric-files.spec.ts` on 2026-11-04: a teacher uploads, is refused a CSV formula, downloads the original byte for byte and deletes the rubric with its file; a student moves through a rubric on an assignment and downloads a copy.
- **Not yet checked:** the files opened in Word, Excel and a PDF reader, and a real phone or tablet.

### 6.8 Reading and templates as built (Stage 2)

- **Reads only the layout in section 8.3.** A header needs at least two level columns, so a list such as "Criteria | Marks" stays file-only rather than becoming a wrong grid. Real files seen so far stay file-only (section 7.5).
- **The upload dialog has two steps.** When a grid is found, it offers Review grid or Save as file only. The tick (D13) comes first either way. Back keeps the edits.
- **Replacing or attaching** offers the same review when the new file holds a grid. Otherwise the current grid isn't touched.
- **The form and the review share** `RubricCriteriaEditor.tsx` and `rubricCriteria.ts`.
- **The spreadsheet reader is `rubricSheetRead.ts`,** not `rubricXlsx.ts`, because it reads CSV too. A CSV needs no library.
- **An Excel file is inflated under a 20 MB cap before SheetJS sees it.** A zip's declared sizes can be false, so they aren't trusted.
- **The templates are a rubric's own downloads** of one `RUBRIC_TEMPLATE` grid, with CSV added. So the Word and Markdown templates also hold a title, which the readers skip.
- **The template menu is a small dialog,** as the download menu is, and holds the help text.
- **Not read back:** a PDF. The readers also take the app's own downloads, including the `Level 1` columns used when criteria have different levels.
- **Checked:** unit tests with real generated files, including each template read back into the same grid, and the real components in a browser with a stand-in for Firebase, at phone width and in dark mode.
- **Checked against the deployed rules** by `e2e/rubric-files.spec.ts` on 2026-11-05: a teacher downloads the Markdown template, uploads it, edits and saves the reviewed grid, then replaces the file and grid together.
- **Checked on real files:** the samples in section 7.5 are stored and stay file-only, with no grid read from them.
- **Not yet checked:** the templates opened in Word and Excel by a person, and a real phone or tablet.

### 6.7 Cost and tradeoff

- **Cost:** no Firebase reads or writes, and no rules. Both places already hold the rubric in memory.
- **Tradeoff:** it's harder to compare criteria or see a whole rubric at once. The jump list and the downloads ease that, and a Show all toggle can follow if teachers ask.

---

## 7. Upload, validation and reading

### 7.1 Upload flow

```text
Choose file
  → check extension and size, before reading the file     rubricFileKinds.ts (light, in the page chunk)
  → read the bytes; check the signature and refuse macros  rubricFile.ts
  → load the reader for that kind, on demand               rubricImportRead.ts
      → reader produces a table of text cells
      → rubricFromTable() makes criteria + warnings        pure, shared by every reader
  → review in the existing RubricForm, prefilled
      - found a grid: check it, fix it, see the warnings
      - found nothing: "Save as file-only" or type the grid in
  → one writeBatch: rubric document + file/current (+ audit entry)
```

- Follow the exam import's pattern (`src/lib/examImportRead.ts`, `examImportKinds.ts`): one light router, with each reader in its own lazily loaded chunk.
- Don't import from the exam parser, because its layout rules are about questions and options. Share the lower-level helpers: `docxZip.ts`, `spreadsheetImport.ts` and `pdfLines.ts`.
- A single batch is enough. There's no second store, so the upload-then-write ordering, retries and orphan cleanup in `blobStore.ts` aren't needed.

### 7.2 File validation

In order, refusing with a plain message:

1. **Extension:** allow `.xlsx .csv .docx .pdf .md .markdown`. Give `.xls`, `.xlsm`, `.doc` and `.docm` their own message.
2. **Size:** 512,000 bytes, checked before reading.
3. **Signature:** `%PDF` or ZIP where expected.
4. **Inside the ZIP (`indexZip` in `docxZip.ts`):** a `.docx` must hold `word/document.xml` and an `.xlsx` must hold `xl/workbook.xml`, so a renamed `.pptx` is refused. Refuse any `vbaProject.bin`, which catches a `.docm` renamed to `.docx`. Reword `docxZip.ts` errors for `.xlsx`, because they say "Word document".
5. **Text formats:** valid UTF-8 with no NUL bytes.
6. **Formulas (pending Q9):** refuse a CSV with a cell that starts with `=`, `+`, `-` or `@` and isn't a number, using the same test as `csvEscape`. Warn when an Excel file has formula cells.
7. **MIME type:** set from these checks, never from `file.type`, which is often blank for `.md`.

**Don't change `sniffDocumentType` or `isValidAttachmentDataUrl`.** They serve student submissions, lesson notes and assignments, so widening them would let students submit spreadsheets and Markdown too. Add rubric-specific versions.

### 7.3 One shared parser

Every reader produces `string[][]`, and one pure function turns it into a rubric:

1. **Find the header row:** a first cell like "Criterion" or "Category", followed by level labels.
2. **Read points from each label:** `Excellent (4)`, `4 - Excellent`, `Excellent 4 pts`.
3. **Read each row:** the first cell is the criterion name, and the others are level descriptions.
4. **Read `Max points`** from a column if present; otherwise use the criterion's highest level.
5. **Drop a "Total" row** and warn.
6. **Apply the limits** in section 5.

The result goes through the same checks as the form (`validateCriteria`), so the two paths can't disagree. Real rubrics don't always fit the data model:

| In a real file                       | `RubricLevel` today | Handling                                                |
| ------------------------------------ | ------------------- | ------------------------------------------------------- |
| Point ranges, like "3-4"             | One number          | Take the top value and warn.                            |
| No points, like "Meets expectations" | Required number     | Set 0, warn, and make the teacher fill it in at review. |
| Different levels per criterion       | Supported           | No change.                                              |
| Weights, like "Content × 3"          | Not supported       | Keep the text in the name and warn.                     |
| Levels above `maxPoints`             | Not checked today   | Warn at review.                                         |

### 7.5 Real rubric files (future item)

Samples seen after this design was written don't use the grid in section 8.3. Stage 2 still reads only that layout, and these files stay file-only until a separate plan is made, after Stage 2 ships. What that plan has to consider:

- **Other layouts:** a list of criteria with one shared scale; a list with allotted marks and no levels; and criteria with descriptions beside parallel mark ranges, whose levels have no labels.
- **More than the rubric in one file:** several rubrics in a file, or a rubric beside mark sheets.
- **Filled-in copies:** marks awarded, and names of students and assessors.
- **Expectation:** teachers may expect the app to keep only the rubric and drop the rest. A reader can pick out a table, but it can't prove a file is free of student data, so storing the original whole and filtering are different promises.
- **PDFs:** text PDFs with clear columns may be readable, which affects Stage 3 (D14).

### 7.4 Format by format

| Format                            | Confidence       | New work                                                                                                                                         | Limits                                                                                                          |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Spreadsheet** (`.xlsx`, `.csv`) | High             | Read rows as arrays. `parseSpreadsheetFile` assumes the first row is the header, but real rubrics often have a title above it.                   | Merged cells come back empty, so fill them from the left. Only the first sheet is read; warn if there are more. |
| **Markdown** (`.md`, `.markdown`) | High, for tables | Read pipe tables, plus a simple heading-and-list layout.                                                                                         | Keep it as text and **never render it as HTML**.                                                                |
| **Word** (`.docx`)                | Medium to high   | **New table reader.** `docxText.ts` deliberately skips `w:tbl`, and rubrics are nearly always tables. Its private `tokens()` has to be exported. | Merged cells, tables within tables, tracked changes, several tables in one file (take the largest and warn).    |
| **PDF**                           | **Low**          | Group text into columns by position, using pdf.js via `examPdf.ts`.                                                                              | See below.                                                                                                      |

**A PDF has no real tables,** only text drawn at positions, so columns have to be inferred from coordinates, using thresholds that vary from file to file. Tagged PDFs are an exception, but many files aren't tagged. `linesOfPage` also sorts text by line, which would mix the wrapped text of adjacent cells.

PDFs are stored from Stage 1 but not read. Stage 3 tests real samples: if they mostly follow one clean layout, add reading for that layout and a matching template. If they vary widely, PDFs stay file-only, which D1 allows. There's no OCR, so scans always stay file-only.

---

## 8. Templates

### 8.1 What the Import Data page does

`UploadStep.tsx` shows help text and a "Download Template" menu (`ExportMenu`), which calls `downloadImportTemplate` in `spreadsheetImport.ts`. It writes a header row and one worked example row, from the same `ImportColumn` definitions the parser checks against. Teachers get a clear example, and the template can't drift from what the parser accepts.

### 8.2 What can be reused

| Existing piece                                   | Reuse?     | Why                                                                                                                                                                 |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `downloadImportTemplate`                         | No         | It needs `ImportColumn` definitions and writes one example row. A rubric's level columns aren't fixed fields, and it needs more than one example row to make sense. |
| `downloadCSV`, `downloadXLSX`, `rowsToXLSXSheet` | **Yes**    | As `downloadExamTemplate` does in `examImportFile.ts`.                                                                                                              |
| `ExportMenu`                                     | No         | Its formats are limited to csv and xlsx.                                                                                                                            |
| `TemplateMenu.tsx`                               | As a model | Its entries are hard-coded to exams, but each format loads only when chosen, which is right here too.                                                               |
| `docxFromParagraphs` (`exampleDocx.ts`)          | No         | It writes paragraphs only. It needs the same new table XML as the Word download in section 9, so share it.                                                          |

### 8.3 Layout

CSV and Excel are shown here. Word uses one table, and Markdown one pipe table.

| Criterion         | Max points | Excellent (4)                | Good (3)                      | Developing (2)                | Beginning (1)                |
| ----------------- | ---------- | ---------------------------- | ----------------------------- | ----------------------------- | ---------------------------- |
| Content and ideas | 4          | Clear, accurate and complete | Mostly clear, with small gaps | Partly clear; needs prompting | Not yet clear; needs support |
| Organisation      | 4          | Logical from start to end    | Mostly logical                | Some order, some jumps        | Hard to follow               |

- **The header is the first row, with no title row.** The title comes from the file name and is confirmed at review.
- **Two or three example rows,** which the teacher replaces. An example left in place shows up at the review step.
- **Level columns can be added, removed or renamed,** so long as each keeps its points in brackets.
- **Help text beside the button,** as Import Data has: the expected layout, the 500 KB limit, and a note not to include student names.

### 8.4 Rules for building it

- **No drift:** one `RUBRIC_TEMPLATE` constant feeds every format, and a test reads each generated template back through its reader.
- **Who:** roles that can upload, on the Rubrics page only (D6). Import Data matches rows to existing records, which doesn't fit a rubric.
- **Timing:** Stage 2, with the readers. A template shipped earlier could only produce file-only rubrics.
- **Bundle:** `spreadsheetExport.ts` imports the spreadsheet library directly, so load it only when a format is chosen.
- **Cost:** built in the browser, with no Firebase reads or writes.

---

## 9. Downloads

| Option                                       | Cost                    | Who                                                   | Source                                                                |
| -------------------------------------------- | ----------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| **Original file**                            | About 2 Firestore reads | Everyone except spectator and, for now, `super_admin` | `getDoc(file/current)`, then `saveDataUrl` in `downloadFile.ts`       |
| **Download as PDF, Excel, Word or Markdown** | No Firebase reads       | Same                                                  | Built from the grid already in memory; every builder is lazily loaded |

| Format   | Build with                                         | Note                                                        |
| -------- | -------------------------------------------------- | ----------------------------------------------------------- |
| PDF      | `@react-pdf/renderer`, as `ReportCardPDF.tsx` does | Don't use `pdfWriter.ts`: it is ASCII-only, with no tables. |
| Excel    | `rowsToXLSXSheet`, `downloadXLSX`                  | Test that a cell starting with `=` stays text.              |
| Word     | New table XML                                      | `exampleDocx.ts` only makes paragraphs.                     |
| Markdown | New small builder                                  | Escape `\|` inside cells.                                   |

- **No React Query for file bodies,** because its cache persists to `sessionStorage`.
- **No device copy.** `noteFileStore.ts` exists to avoid Realtime Database cost, and a 2-read download doesn't need one.
- **File names** come from the rubric's title, because two rubrics can hold `rubric.pdf`. Use `reportPdfFileName` in `pdfFileName.ts` as a model for a small new helper.

### 9.1 What each screen shows

**Rubrics page (staff):**

- Header: `Upload rubric`, `Download Template` and the existing `+`, for the roles that can upload.
- A new **Type** column: "Grid", "Grid + file" or "File only".
- Actions: view, download menu, edit, remove file, delete.
- The view dialog shows the carousel, and the file's name, uploader, size and date. A file-only rubric shows a short message in place of the grid.

**Assignment page (`RubricSection`, every role that can open the assignment). "Grid" means the carousel:**

| Rubric      | Student, parent, staff             | Spectator                                          |
| ----------- | ---------------------------------- | -------------------------------------------------- |
| Grid only   | Grid + Download as                 | Grid, no download                                  |
| Grid + file | Grid + Download as + Original file | Grid, no download                                  |
| File only   | File name + Original file          | File name + "Not available on a read-only account" |

---

## 10. Firebase changes

| Item                     | Change                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `firestore.rules`        | New `file` block, and changes to the `rubrics` block                                                                              |
| `firestore.indexes.json` | **No composite index.** Files are read by exact path, and rubric lists stay unfiltered. **One exemption is recommended** (below). |
| `database.rules.json`    | **None.** This is the main benefit of D2.                                                                                         |
| New top-level collection | **None**                                                                                                                          |
| Migration                | **None**                                                                                                                          |

### 10.1 Index exemption

Firestore automatically indexes every field, including a 680,000-character string that nothing ever queries. The project already switches this off for `content.images` in `fieldOverrides`. Add the same for the file body:

```json
{ "collectionGroup": "file", "fieldPath": "dataUrl", "indexes": [] }
```

Firestore caps an indexed value at 1,500 bytes, so the storage saved per file may be small, but the exemption costs nothing and follows the existing precedent.

### 10.2 Rules

As built in `firestore.rules`, which is the source of truth, and tested by section 10.3:

```text
function isValidRubricFile(d) {
  return d.keys().hasOnly(['institutionId','dataUrl','fileName','mimeType','size','uploadedBy','uploadedAt'])
    && d.dataUrl is string && d.dataUrl.size() <= 700000
    && d.dataUrl.matches('^data:(application/pdf'
         + '|application/vnd\\.openxmlformats-officedocument\\.wordprocessingml\\.document'
         + '|application/vnd\\.openxmlformats-officedocument\\.spreadsheetml\\.sheet'
         + '|text/csv|text/markdown);base64,.+$')
    && d.fileName is string && d.fileName.size() <= 255
    && d.size is number && d.size > 0 && d.size <= 512000
    && d.uploadedBy == request.auth.uid
    && d.uploadedAt == request.time;
}

// The summary on the parent. It must name the caller, whoever is changing it.
function rubricFileMetaOk(f) {
  return f is map
    && f.keys().hasOnly(['fileName','mimeType','size','uploadedBy','uploadedByName','uploadedAt'])
    && f.uploadedBy == request.auth.uid
    && f.uploadedAt == request.time;
}

function rubricShapeOk(d) {
  return d.title is string && d.title.size() <= 150
    && d.criteria is list && d.criteria.size() <= 50;
}

match /institutions/{institutionId}/rubrics/{rubricId}/file/{fileId} {
  // Students and parents are scoped by the UI only (decision 22). No list: the id is always "current".
  allow get: if isSignedIn() && inMyInstitution(institutionId) && !isSpectator();

  allow create: if fileId == 'current'
    && isTeacherOrAbove() && inMyInstitution(institutionId)
    && institutionFieldMatchesPath(institutionId)
    && isValidRubricFile(request.resource.data)
    && getAfter(/databases/$(database)/documents/institutions/$(institutionId)/rubrics/$(rubricId)).data.file.uploadedBy == request.auth.uid;

  allow update: if fileId == 'current'
    && inMyInstitution(institutionId)
    && (isAdminOrAbove() || (isTeacher() && resource.data.uploadedBy == request.auth.uid))
    && institutionFieldMatchesPath(institutionId)
    && isValidRubricFile(request.resource.data)
    && getAfter(/databases/$(database)/documents/institutions/$(institutionId)/rubrics/$(rubricId)).data.file.uploadedBy == request.auth.uid;

  allow delete: if inMyInstitution(institutionId)
    && (isAdminOrAbove() || (isTeacher() && resource.data.uploadedBy == request.auth.uid));
}

match /institutions/{institutionId}/rubrics/{rubricId} {
  allow read: if isSignedIn() && inMyInstitution(institutionId);          // unchanged

  allow create: if isTeacherOrAbove() && inMyInstitution(institutionId)
    && institutionFieldMatchesPath(institutionId)
    && rubricShapeOk(request.resource.data)
    && (!('file' in request.resource.data) || rubricFileMetaOk(request.resource.data.file));

  // Any teacher edits the grid; only the uploader or an admin changes `file`.
  // Who created a rubric can't change.
  allow update: if isTeacherOrAbove() && inMyInstitution(institutionId)
    && institutionFieldMatchesPath(institutionId)
    && rubricShapeOk(request.resource.data)
    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['createdBy','createdByRole','createdAt'])
    && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['file'])
        || ((isAdminOrAbove()
              || !('file' in resource.data)
              || resource.data.file.uploadedBy == request.auth.uid)
            && (!('file' in request.resource.data) || rubricFileMetaOk(request.resource.data.file))));

  // The teacher branch depends on Q2.
  allow delete: if inMyInstitution(institutionId)
    && (isAdminOrAbove()
        || (isTeacher() && resource.data.createdBy == request.auth.uid
            && 'file' in resource.data && resource.data.file.uploadedBy == request.auth.uid));
}
```

An admin who replaces a file becomes its owner, because `uploadedBy` must be the caller. The original teacher can no longer change it.

### 10.3 Required rules tests

In a new `rules-tests/rubrics.rules.test.ts`:

- A teacher can't clear or change a colleague's `file` summary.
- A teacher can't change `createdBy`, so can't claim a colleague's rubric and then delete it.
- A teacher can't name a colleague in `file.uploadedBy`, and can't write a body whose parent names someone else.
- Removing a file: the body delete and the parent's `file` removal both pass in one batch, for the uploader and for an admin.
- A teacher can't replace a colleague's file, and an admin can.
- A student, parent and spectator can't write.
- A spectator can't `get` the file. A student and a parent can.
- A second school's teacher can't read the file.
- Existing demo rubrics still pass `rubricShapeOk`.

### 10.4 Deploy order

1. Deploy `firestore.rules`. The current app keeps working, but this isn't purely additive: `rubricShapeOk` and the `createdBy` check tighten what's allowed. Run the rules tests against the current app's write shape first.
2. Deploy the index exemption with `firebase deploy --only firestore:indexes`.
3. Merge the app.
4. No script run or new environment variable is needed.

The carousel needs none of these, and can ship on its own.

**Rollback:** reverting the app hides uploads, but files already stored stay in Firestore, and rubrics with `criteria: []` would show as empty in the old build. Keep the rules deployed, because the old app passes them. There's no kill switch like the one for large files in the Realtime Database, and adding one isn't worth it at this file size.

---

## 11. Roles

| Action                                 | `institution_admin`       | `senior_teacher`             | `regular_teacher`            | `student`       | `parent`        | `spectator`               | `super_admin`       |
| -------------------------------------- | ------------------------- | ---------------------------- | ---------------------------- | --------------- | --------------- | ------------------------- | ------------------- |
| Open Rubrics page                      | Yes                       | Yes                          | Yes                          | No              | No              | Yes                       | Not useful yet (Q6) |
| See a rubric on an assignment          | Yes                       | Yes                          | Yes                          | Yes             | Yes             | Yes                       | No                  |
| Move through the carousel              | Modal and assignment page | Modal and assignment page    | Modal and assignment page    | Assignment page | Assignment page | Modal and assignment page | No                  |
| Upload                                 | Yes                       | Yes                          | Yes                          | No              | No              | No                        | Later               |
| Type or edit a grid                    | Yes                       | Yes                          | Yes                          | No              | No              | No                        | Later               |
| Replace or remove a file               | Any                       | Own uploads                  | Own uploads                  | No              | No              | No                        | Later               |
| Delete a rubric                        | Any                       | Own upload only (pending Q2) | Own upload only (pending Q2) | No              | No              | No                        | Later               |
| Download original                      | Yes                       | Yes                          | Yes                          | Assignment page | Assignment page | **No**                    | Later               |
| Download as PDF, Excel, Word, Markdown | Yes                       | Yes                          | Yes                          | Assignment page | Assignment page | **No**                    | Later               |
| Download a template                    | Yes                       | Yes                          | Yes                          | No              | No              | No                        | Later               |
| Attach to an assignment                | Yes                       | Yes                          | Yes                          | No              | No              | No                        | No                  |

**The spectator block only covers the file.** The rules can deny `file/current`, but a spectator can read the grid, so hiding "Download as" is only a UI choice. It's also a new exception, because spectators can download lesson-note files and assignment attachments today. `spectatorPages.test.ts` requires that the Rubrics page never mentions `spectator`, so put the check in a `canDownloadRubric(role)` helper in `roleCapabilities.ts`.

Senior and regular teachers have the same rights here. Rubrics have no `departmentId`, so department scoping would need a new field (Q5).

---

## 12. Free-tier analysis

### 12.1 Limits

From the [Firebase pricing page](https://firebase.google.com/pricing), checked 2026-11-04.

| Resource                 | Spark limit                     |
| ------------------------ | ------------------------------- |
| Firestore stored data    | 1 GiB                           |
| Firestore reads          | 50,000 a day                    |
| Firestore writes         | 20,000 a day                    |
| Firestore deletes        | 20,000 a day                    |
| Firestore network egress | 10 GiB a month                  |
| Realtime Database        | **Not affected by this design** |

### 12.2 Cost per action

| Action                                   | Reads                                                            | Writes             | Bytes                      |
| ---------------------------------------- | ---------------------------------------------------------------- | ------------------ | -------------------------- |
| Upload                                   | Small (rule lookups)                                             | 2, or 3 with audit | Up to about 0.68 MB stored |
| Replace a file                           | About 1 to 2                                                     | 2, or 3 with audit | Replaces the old body      |
| Delete                                   | 1 + rule lookups                                                 | 2                  | Frees the storage          |
| Download original                        | About 2 (the file, plus the caller's user document for the rule) | 0                  | Up to about 0.68 MB egress |
| Download as PDF, Excel, Word or Markdown | **0**                                                            | 0                  | 0                          |
| Read a file into the grid                | **0** (browser only)                                             | 0                  | 0                          |
| Download a template                      | **0**                                                            | 0                  | 0                          |
| Move through the carousel                | **0**                                                            | 0                  | 0                          |
| Open Rubrics page                        | Same as today, one per rubric                                    | 0                  | Tiny increase per rubric   |

Base64 makes a file about 4/3 larger, so a 512,000-byte file stores as about 683,000 characters. [Firestore bills rule lookups as reads](https://firebase.google.com/docs/firestore/pricing), once per dependent document per request.

### 12.3 Worked examples

These use assumed numbers, not measurements.

**Storage.** With the 1 GiB limit and nothing else in Firestore. These are upper bounds, because they leave out document and index overhead, and inline lesson-note files and assignments share the same 1 GiB:

| Assumed average file | Stored        | Files that would fit |
| -------------------- | ------------- | -------------------- |
| 500 KB (maximum)     | About 0.68 MB | About 1,570          |
| 150 KB               | About 0.2 MB  | About 5,200          |
| 50 KB                | About 0.07 MB | About 15,700         |

**One assignment.** 500 students and parents each download a maximum-size file:

- Reads: about 1,000, or 2% of the daily limit.
- Egress: about 341 MB, or about 3.2% of the monthly limit.

Twenty of those a month would use about two-thirds of the egress limit, but that requires everyone to download the largest possible file every time. A 150 KB file costs under a third of that.

**The Rubrics list.** The page reads every rubric each time it opens. 30 staff opening it 3 times a day with 60 rubrics comes to 5,400 reads, or about 11% of the daily limit. The assignment form reads them all again for its picker. Measure this after Stage 1, then move to a cached query if needed, refreshing it after a save (Q8).

### 12.4 What to watch

| Risk                                    | Note                                                                                                                                                                               | Mitigation                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **No egress counter**                   | The Realtime Database has a monthly counter and kill switches, but Firestore egress has neither.                                                                                   | Keep the 500 KB cap. Show generated downloads first where a grid exists. Check the console monthly. |
| **Shared daily limits**                 | The exam-day budget alone plans for 10,000 reads, 10,000 writes and 2,048 MiB of downloads in a day (`examDayBudget.ts`), and those downloads come out of the same 10 GiB a month. | Downloads are click-only, never on page load.                                                       |
| **No cap on uploads**                   | Rules can't count documents.                                                                                                                                                       | The soft school limit in section 5. Costs no reads, but a determined person could get around it.    |
| **Storage is only recovered on delete** | There's no retention rule for rubrics.                                                                                                                                             | A later owner-run report of file count and size per school.                                         |

---

## 13. Security, privacy and other gotchas

### 13.1 Security and privacy

- **No malware scanning is possible on Spark.** Checks only prove a file has the right type. Files from teachers go to students' and parents' devices, so a download is saved, never opened in the app.
- **PDFs can contain JavaScript or links,** and the app can't strip them. It never renders them, and reading them with pdf.js only extracts text.
- **Formulas in original files.** An uploaded CSV or Excel file reaches other people's devices unchanged, and its formulas can run when it's opened in a spreadsheet app. Generated files don't have this problem. Section 7.2 sets the checks.
- **Student names in a file.** A rubric shouldn't hold personal data, but real files can: a filled-in assessment, or a workbook with mark sheets beside the rubric. The app can't detect this, so every file needs a tick from the teacher, and a workbook lists its sheets (D13). It relies on the teacher checking.
- **Hidden metadata.** Word and PDF files carry author names and edit history, which the app can't clean. The user guide should say so.
- **Students can technically read any rubric file** in their institution, using the Firestore API directly. The same is true of rubric grids today (decision 22). It's accepted because rubrics are low sensitivity, but an answer key kept in a rubric file would be exposed. The user guide should say so.
- **Oversized archives.** Input is capped, and `docxText.ts` caps inflation at 20 MB. SheetJS inflates on its own, so an Excel file is first inflated under a cap with `extractEntry`, because declared sizes can be false.

### 13.2 The grid and the file can disagree

Editing the grid doesn't change the stored file, and replacing the file doesn't change the grid. Any teacher can edit the grid (D4), so students could see one thing on the page and download another.

- Save `updatedAt` on each grid edit. When it's later than `file.uploadedAt`, show staff "The grid was changed after this file was uploaded".
- When a file is replaced, offer to update the grid from the new one, through the same review step.
- Never overwrite a grid silently.

### 13.3 Shared rubrics have no versions

A rubric is shared across assignments, so replacing its file or editing its grid changes every assignment using it, including those already graded. The confirm dialog should warn about this. It can't say how many assignments use the rubric without an extra query, which isn't worth it.

### 13.4 What deleting has to do

| Place                                         | Change                                                                   | Why                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `src/lib/deleteRecord.ts`                     | Add a `rubric` branch: delete `file/current` and the rubric in one batch | Firestore doesn't cascade, so a body would be left using storage.             |
| `scripts/deleteInstitutionLogic.mjs`          | `rubrics: {}` becomes `rubrics: { file: {} }`                            | Otherwise deleting an institution would leave files behind.                   |
| `src/lib/__tests__/deleteInstitution.test.ts` | Add `rubrics/file`                                                       | It pins the list of paths.                                                    |
| `src/lib/formTables.ts`                       | Mention the file in the delete message                                   | `formModalSplit.test.ts` pins the text, so update the pin and keep the check. |

Deleting needs one read of the rubric first, to know whether a file exists, because the uploader rule reads `resource.data`, which fails on a document that doesn't exist. Attachments on assignments stay as they are: a deleted rubric shows as missing, with the existing message.

### 13.5 Smaller points

- **Large files.** Scans and images will often go over 500 KB and be refused. The message should suggest reducing the file or exporting a text PDF (Q1).
- **File-only rubrics and the form.** `RubricForm` refuses an empty grid, and `newCriterion()` starts one blank row. `RubricSection` would show an empty table for `criteria: []`.
- **Removing the file from a file-only rubric** would leave a rubric with neither form, and the rules can't stop it. Disable Remove in that case, and offer Delete where the person is allowed to.
- **Hiding from `super_admin` (Q6)** takes more than the sidebar item. The route uses `hasStaffView`, and `sidebarNav.test.ts` and `SIDEBAR_REORGANIZATION_SPEC.md` both list Rubrics for that role.
- **An uploader-delete button (Q2)** means widening the list page's admin-only delete gate.
- **Two people editing at once.** Saves are last-write-wins, as they are for grids today. A file replacement and a grid edit touch different fields, but two grid edits overwrite each other.
- **A deleted uploader's account.** `deleteUserData.ts` doesn't touch rubrics, so `uploadedBy` points at nobody. The file stays, and only an admin can change it (Q4).
- **Backups and exports.** Data-portability work must include the new subcollection.
- **Offline.** Offline saving covers attendance only, so an upload with no connection may sit on "Saving…", as other forms can. Not tested.
- **Line limit.** New code stays under the 600-line limit, so a separate component holds the upload review.

---

## 14. Implementation plan

### Stage 0: Before coding

- **0.1** Collect 5 to 10 real rubric files, and note their format, size and layout.
- **0.2** Answer the open questions in section 2.2.
- **0.3** Write this spec, with no school data. **Done.**

### Stage 1: Carousel, store and download

Items 1.1 to 1.6 touch no Firebase, and can ship first as their own small pull request.

- **1.1** **Built.** Add the carousel's pure position logic, with unit tests.
- **1.2** **Built.** Add the opt-in dialog option to `useSwipe`, leaving the exam's default unchanged.
- **1.3** **Built.** Build `RubricCarousel.tsx`: buttons, jump list, swipe, arrow keys and announcements.
- **1.4** **Built.** Use it in `RubricViewModal`, and give the modal a dialog role, Escape and focus handling.
- **1.5** **Built.** Use it in `RubricSection`, in place of the table.
- **1.6** Test the carousel on a phone-sized window (e2e) and on a real phone and tablet (manual). **Partly done:** `e2e/rubric-carousel.spec.ts` passes for the view dialog against the QA institution on 2026-11-04. The real-device check is still to do.
- **1.7** **Built.** Add the types and role helpers.
- **1.8** **Built.** Build file validation (section 7.2), including the formula checks.
- **1.9** **Built.** Build the file store for `file/current`.
- **1.10** **Built.** Write the rules and the `file.dataUrl` index exemption.
- **1.11** **Built.** Write `rules-tests/rubrics.rules.test.ts`, including the `createdBy` case.
- **1.12** **Built.** Build upload without reading: each file is saved as file-only, or the teacher types a grid alongside it.
- **1.13** **Built.** Add the upload dialog's privacy line, the duplicate title warning and the soft school limit.
- **1.14** **Built.** Add Replace file.
- **1.15** **Built.** Add Remove file, blocked on a file-only rubric.
- **1.16** **Built.** Add the rubric delete cascade, and the uploader's delete if Q2 is yes.
- **1.17** **Built.** Build the PDF, Excel, Word and Markdown builders for `Download as`.
- **1.18** **Built.** Add the download menu to the Rubrics page, with the Original file option.
- **1.19** **Built.** Add the download controls to the assignment page, hidden from a spectator.
- **1.20** **Built.** Add the Type column, the uploader's name and date, and the grid-changed note.
- **1.21** **Built.** Add audit entries for file changes. Check what `validAuditEntry` accepts in the rules.
- **1.22** **Built.** Update the institution delete script and its test.
- **1.23** **Built.** Hide the page from `super_admin`, if Q6 is yes.
- **1.24** **Built.** Update this stage's documentation (section 16).
- **1.25 Done when:**
  - A rubric with many criteria can be read without long scrolling, by button, jump list, arrow key and swipe, in light and dark mode.
  - A teacher can upload all allowed types, and refused types get a clear message.
  - A student and a parent can download from an assignment.
  - A spectator's direct read of the file is refused.
  - A teacher can't replace a colleague's file.
  - Deleting a rubric leaves no file behind.

### Stage 2: Read files into the grid, templates and the tour

- **2.1** **Built.** Build `rubricFromTable`, with unit tests.
- **2.2** **Built.** Build the spreadsheet reader.
- **2.3** **Built.** Build the Markdown reader.
- **2.4** **Built.** Build the Word table reader.
- **2.5** **Built.** Build the review step and its warnings.
- **2.6** **Built.** Offer to update the grid from a replaced file.
- **2.7** **Built.** Add `RUBRIC_TEMPLATE`, and the CSV and Excel templates.
- **2.8** **Built.** Add the Word and Markdown templates.
- **2.9** **Built.** Add `RubricTemplateMenu.tsx` and its help text to the Rubrics page.
- **2.10** **Built.** Test that each template reads back through its reader.
- **2.11** **Built.** Add a filter to the list.
- **2.12** **Built.** Add the `rubrics` tour.
- **2.13** **Built.** Add the student and parent help, as Q7 decides.
- **2.14** Update this stage's documentation (section 16).
- **2.15 Done when:**
  - Each template reads back into a correct grid.
  - The sample files read correctly or fall back to file-only, with no crashes.
  - Each reader is a separate chunk, and the Rubrics page's own chunk stays small.

### Stage 3: PDF reading (deferred, D14)

Closed for now: real PDFs don't use the layout in section 8.3, so reading that layout wouldn't help them. The items are kept for the future item in section 7.5.

- **3.1** Try reading the sample PDFs.
- **3.2** If reliable, ship reading for one layout, plus a PDF template (D5).
- **3.3** If not, record why, and leave PDFs as file-only.
- **3.4 Done when:** one of 3.2 or 3.3 is finished.

### Test plan

e2e specs use the production Firebase project's quota, so run only those named here.

| Stage       | Unit                                               | Rules                   | e2e                                                                                            | Manual                                                                 |
| ----------- | -------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1, carousel | Position logic, swipe option, source pins          | None                    | New phone-sized spec modelled on `27-exam-preview-carousel.spec.ts`; `08-assignments-workflow` | Real phone and tablet swipes; screen reader; reduced motion; dark mode |
| 1, files    | Validation, builders, delete cascade, role helpers | `rubrics.rules.test.ts` | New `rubric-files.spec.ts`; `08-assignments-workflow`                                          | Open each downloaded format in its own app                             |
| 2           | Parser, each reader, template read-back            | None new                | `rubric-files.spec.ts`, extended                                                               | Real sample files; tour in light, dark and phone width                 |
| 3           | PDF layout tests                                   | None                    | `rubric-files.spec.ts`, extended                                                               | Real sample PDFs                                                       |

`08-assignments-workflow` only asserts the rubric's title on the assignment page, so the carousel shouldn't break it. `ensureRubricExists` depends on the `Add new rubric` button and the form's labels, so keep those.

### Existing code this touches

| Area               | File                                                                          | Change                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Types              | `src/types/assessment.ts`                                                     | `RubricFileMeta`, `file`, `updatedAt`                                                                                            |
| Roles              | `src/lib/roleCapabilities.ts`                                                 | `canDownloadRubric`, `canUploadRubric`, `canControlRubricFile`                                                                   |
| List page          | `src/scenes/(dashboard)/list/rubrics/index.tsx`                               | Upload, Download Template, Type column, download menu, remove file; a wider delete gate if Q2 is yes                             |
| Form               | `src/components/forms/RubricForm.tsx`                                         | Accept a prefilled grid and file; allow an empty grid when a file exists; set `updatedAt`                                        |
| View               | `src/components/forms/RubricViewModal.tsx`                                    | Carousel; dialog role, Escape and focus handling; file details; file-only message                                                |
| Assignment page    | `src/scenes/(dashboard)/list/assignments/[id]/RubricSection.tsx`, `index.tsx` | Carousel in place of the table; pass `role`; download controls. `rubricColumns` in `assignmentDetailLogic.ts` may become unused. |
| Swipe              | `src/hooks/useSwipe.ts`                                                       | An opt-in option for touches inside a dialog                                                                                     |
| Routes and sidebar | `src/routes/academicRoutes.tsx`, `src/lib/sidebarNav.ts`                      | Hide from `super_admin`, if Q6 is yes                                                                                            |
| Delete             | `src/lib/deleteRecord.ts`, `src/lib/formTables.ts`                            | Cascade and message                                                                                                              |
| Scripts            | `scripts/deleteInstitutionLogic.mjs`                                          | Include `file`                                                                                                                   |
| Tours              | `src/lib/useTourSteps.ts`, list page, `RubricSection`                         | Section 15                                                                                                                       |
| Audit              | `src/lib/auditLog.ts`, `auditEvents.ts`                                       | New events                                                                                                                       |

**Unchanged:** `useAssignmentFormOptions.ts` (the picker's list stays the same) and `sweep-orphan-blobs.mjs` (thanks to the subcollection's name).

**New files (suggested names):**

- `src/lib/rubricFileKinds.ts`: extensions, limits, messages.
- `src/lib/rubricFile.ts`: signature checks and the data URL.
- `src/lib/rubricImportRead.ts`: the lazy router.
- `src/lib/rubricFromTable.ts`: the shared parser.
- `src/lib/rubricXlsx.ts`, `rubricDocx.ts`, `rubricMarkdown.ts`, later `rubricPdf.ts`: the readers.
- `src/lib/rubricDownload.ts`: the builders, with `src/components/rubric/RubricPDF.tsx`.
- `src/lib/rubricFileStore.ts`: read, write and delete `file/current`.
- `src/lib/rubricTemplate.ts`: the `RUBRIC_TEMPLATE` constant and the template builders.
- `src/lib/rubricCarousel.ts`: position text and any other pure logic.
- `src/components/rubric/RubricCarousel.tsx`, `RubricUploadDialog.tsx`, `RubricDownloadMenu.tsx`, `RubricTemplateMenu.tsx`.

**Tests that may need updating:** `spectatorPages.test.ts`, `formModalSplit.test.ts`, `deleteInstitution.test.ts`, `missingRecordIds.test.ts`, `carouselMotion.test.ts`, and, if Q6 is yes, `sidebarNav.test.ts` and `e2e/16-sidebar.spec.ts`.

### Later, on their own

| Feature                                    | Note                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Scoring against criteria while grading** | The most valuable next step, and it's what makes the grid worth having. A separate design. |
| Rubric versions                            | Solves section 13.3. Needs a design for which version a graded assignment used.            |
| Bulk upload                                | Each file needs a review, so the flow is different.                                        |
| In-app preview                             | Adds rendering risk (section 13.1).                                                        |
| Download all as a zip                      | `lessonNoteZip.ts` could help. Multiplies read costs.                                      |
| Larger files through the Realtime Database | Only if samples show that 500 KB is a real barrier.                                        |

---

## 15. Tour

### 15.1 What the tour library does

Checked in the `nextstepjs` 2.2.0 source:

| Situation                                             | What happens                                                                  | So                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A step's target isn't on the page                     | No error. The spotlight isn't moved, so it stays where it was.                | A wrong highlight, not a crash. Only target things that are always there. |
| A step uses `nextRoute`, and the target never appears | It waits on a `MutationObserver` that never finishes, so the tour gets stuck. | No `nextRoute` for this tour.                                             |
| A step has no selector                                | The card is centred.                                                          | Good for intro steps, and for controls that may not be there.             |

### 15.2 Staff tour

**One tour named `rubrics`, started by a "Take a tour" button on the page, not automatically,** as Gradebook and Report Builder do. `useTourSteps` already calls `useAuth`, so it can build the steps by role, and everyone shares `toursCompleted.rubrics`. To keep `useTourSteps.ts` tidy, put the steps in `src/lib/rubricTourSteps.ts`.

| #   | Step                                                                                                     | Target      | Admin                                | Teachers                                                 | Spectator                                                           |
| --- | -------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | What rubrics are: a shared library attached to assignments                                               | Centred     | Yes                                  | Yes                                                      | Yes                                                                 |
| 2   | Upload a spreadsheet, Word, PDF or Markdown file, up to 500 KB                                           | `upload`    | Yes                                  | Yes                                                      |                                                                     |
| 3   | Download Template: fill this in for the best results                                                     | `templates` | Yes                                  | Yes                                                      |                                                                     |
| 4   | Review what was read. If it can't be read, the file is kept as file-only.                                | Centred     | Yes                                  | Yes                                                      |                                                                     |
| 5   | Or type a grid by hand                                                                                   | `add`       | Yes                                  | Yes                                                      |                                                                     |
| 6   | The library, what the Type column means, and that the eye icon opens a carousel to swipe or step through | `table`     | Yes                                  | Yes                                                      | Yes                                                                 |
| 7   | Row actions (wording varies by role)                                                                     | Centred     | "Replace, remove or delete anything" | "Anyone can edit a grid; only you can replace your file" | "You can view rubrics. Downloads aren't available on this account." |
| 8   | Attach it when creating an assignment; students download it there                                        | Centred     | Yes                                  | Yes                                                      |                                                                     |

- **New targets:** `#tour-rubrics-upload`, `#tour-rubrics-templates`, `#tour-rubrics-add`, `#tour-rubrics-table`.
- **Row actions are centred,** because a school with no rubrics has no rows.
- **The tour doesn't open the upload dialog or the view modal,** so `tourBridge` doesn't change, and it doesn't target anything inside a carousel, because its slides change.
- **No `tourValidation` gates.** This tour never makes anyone perform an action.
- **`super_admin`:** no button until the page works for that role.

**As built:**

- **The steps are in `rubricTourSteps.ts`,** registered in `useTourSteps.ts` with the person's role. Step 6 also mentions search and the Type filter.
- **A spectator gets steps 1, 6 and 7,** so its only target is the table.
- **`#tour-rubrics-add` and `#tour-rubrics-table` wrap** the `+` button and the table.
- **Ending or skipping the tour** writes `toursCompleted.rubrics`, as other tours do.

**The list filter (item 2.11)** is a search on title and description and a Type select, over the list the page already holds. Either change goes back to page 1.

### 15.3 Students and parents

They have no Rubrics page, and their sidebar tour button is hidden or a stub. D15 chose plain helper text, which is built: one line in `RubricSection` for students and parents, on how to move through the criteria and keep a copy, or, for a file-only rubric, to download it. The tour below was the alternative, and isn't built. That tour would start from a small "What's this?" link in `RubricSection`, shown only when a rubric is attached, so its targets exist.

| #   | Step                                                               | Target                  |
| --- | ------------------------------------------------------------------ | ----------------------- |
| 1   | How your work will be marked, and how to move through the criteria | `#tour-rubric-section`  |
| 2   | Keep a copy (only if downloads are shown)                          | `#tour-rubric-download` |

### 15.4 Existing gaps and tests

- `spectator` has no tour entry, though Start Tour shows for that role. Clicking it probably does nothing after moving to the dashboard. Not checked in a browser, and worth fixing separately.
- Tours are weak on phones (`ISSUES_AND_GAPS.md`), and `TourCard` has a `min-w-md` width.
- **Tests:** copy `calendarTourTargets.test.ts`, so that a test fails if a target `id` disappears. Check by hand in light mode, dark mode and at phone width.

---

## 16. Documentation to update

Each stage updates only what it ships, so these documents don't describe features that don't exist yet.

| File                                                      | Stage | What to add                                                                                                                                                                                                              |
| --------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| This spec                                                 | All   | Status, and what each item turned out to be                                                                                                                                                                              |
| `docs/guides/USER_GUIDE.md`                               | 1, 2  | **Rubrics isn't mentioned at all today.** A section for admins and teachers, and short notes for students and parents. Include: the carousel and its swipe, Download Template, 500 KB, no student names, no answer keys. |
| `CHANGELOG.md`                                            | 1, 2  | Bullets per release. Don't run the formatter on this file.                                                                                                                                                               |
| `sms-system/README.md`                                    | 1     | A Rubrics line in its feature list, linking to this spec                                                                                                                                                                 |
| `docs/miscellaneous-specs/ASSIGNMENTS_FEATURE_SPEC.md`    | 1     | A pointer at sections 4.4 and 5.2, and the download from the assignment page                                                                                                                                             |
| `docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md`         | 1     | The rubric download exception, and why                                                                                                                                                                                   |
| `docs/guides/DEMO_TESTING_GUIDE.md`                       | 1, 2  | What to test                                                                                                                                                                                                             |
| `docs/firebase/firebase-rules.md`                         | 1     | The new block, the parent rule and the index exemption                                                                                                                                                                   |
| `docs/project-overview/ROLE_PRIVILEGE_ANALYSIS.md`        | 1     | The role matrix                                                                                                                                                                                                          |
| `docs/compliance/LEGAL_AND_PRIVACY_COMPLIANCE.md`         | 1     | A new place for teacher files; retention; no malware scan                                                                                                                                                                |
| `docs/backend/BACKEND_ARCHITECTURE_SPEC.md`               | 1     | Rubric files as another inline store to migrate later                                                                                                                                                                    |
| `docs/ISSUES_AND_GAPS.md`                                 | 1     | Accepted gaps: no scanning, UI-only student scoping, no versions, spectator grid copying, no egress counter, the `super_admin` bug if it isn't fixed                                                                     |
| `docs/miscellaneous-specs/SIDEBAR_REORGANIZATION_SPEC.md` | 1     | Remove Rubrics from `super_admin`, if Q6 is yes                                                                                                                                                                          |
| `docs/miscellaneous-specs/WALKTHROUGH_TOUR_SPEC.md`       | 2     | The new tours                                                                                                                                                                                                            |

### In-code comments

- `firestore.rules`: why spectators are denied, why students are UI-scoped, why the parent checks `file`, why `createdBy` can't change, and a pointer to this spec.
- `useSwipe.ts`: why touches inside a dialog are ignored by default, and when to opt in.
- `RubricCarousel.tsx`: why focus stays on the button, unlike the exam carousel, and why the ends use `aria-disabled`.
- `rubricTemplate.ts`: that the templates and the parser share one definition, and why.
- `rubricFile.ts`: why this doesn't widen `documentUpload.ts`.
- `rubricFromTable.ts`: the accepted layouts, with an example, as `examDocumentText.ts` does.
- `RubricSection.tsx` and `RubricViewModal.tsx`: the file-only and spectator cases, and an updated description of the layout.
- `deleteRecord.ts`: why the rubric read comes first.
- `assessment.ts`: `criteria` is `[]` on a file-only rubric, and the body is never on this document.

---

## 17. Not verified, and sources

### Not verified

- **Stage 1 is tested only as section 6.6 says.** The spectator tour behaviour and the offline behaviour come from reading code.
- **The real files seen so far don't use the layout in section 8.3,** so they test only that reading falls back to file-only. Reading confidence for files that do use it comes from generated files.
- **The rules** pass the emulator tests and are deployed, and `e2e/rubric-files.spec.ts` exercises the upload, download and delete paths against them. Replacing a file with a grid is covered there too. Removing a file, and the refusals for other roles, are covered only by the emulator tests.
- **The carousel** hasn't been tried on a real device (section 6.5).
- **The templates** read back in unit tests, but haven't been opened in Word or Excel by a person.
- **The tour** is checked by unit tests and `e2e/rubric-files.spec.ts`, but not on a real phone.
- **Current Firestore usage** wasn't checked, because that needs the Firebase console.
- **Index storage:** the 1,500-byte limit was seen only through a search summary, and how it affects stored size wasn't confirmed.

### Sources

| Source                                                                                                                                              | Used for                                                     | Type                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| [Firebase pricing](https://firebase.google.com/pricing)                                                                                             | Spark limits                                                 | Official                                        |
| [Cloud Storage changes FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)                                      | No bucket access on Spark, from 2026-02-03                   | Official                                        |
| [Understand Firestore billing](https://firebase.google.com/docs/firestore/pricing), [Firestore pricing](https://cloud.google.com/firestore/pricing) | Rule lookups count as reads                                  | Official, seen through a search summary         |
| [Firestore quotas and limits](https://docs.cloud.google.com/firestore/quotas)                                                                       | The 1,500-byte limit on indexed values                       | Official, seen through a search summary         |
| [WAI-ARIA carousel pattern](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/)                                                                     | Carousel roles, labels, and focus staying on the buttons     | Official, seen through a search summary         |
| [OWASP File Upload Cheat Sheet](https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/File_Upload_Cheat_Sheet.md)             | Allowlists, signature checks, not trusting the declared type | Official project, seen through a search summary |
| [Extracting tables from PDFs with PDF.js](https://dzone.com/articles/extracting-tables-pdfs)                                                        | PDFs have no table structure; thresholds are fragile         | Secondary                                       |
| [The three-tier PDF extraction model](https://dev.to/bonzai2carn/the-three-tier-pdf-extraction-model-demystifying-pdfjs-52bc)                       | Tagged PDFs as an alternative                                | Secondary                                       |
