# Exam Images and Exam Integrity: Specification

> **Status:** Built (phases P1 to P5, see section 12); P6 (question pools, the similarity hint, the second-tab detection) is not built. Revised after a review against the code, then updated with what was decided while building (the "Built" notes in sections 6, 8 and 9). Follows `EXAMS_FEATURE_SPEC.md` (the online exams that are built and merged).
> **Feature:** Two parts that ship separately. **(A) Exam integrity:** each online exam records, with times, whenever the student's exam page left the screen, shows the teacher a report after the sitting, and offers two presets (Supervised and Unsupervised) with a few honest deterrents. **(B) Images:** a teacher or administrator can add an optional **image to a question**, by uploading it in the builder or by importing it from a Word or PDF paper (including a Google Forms printout), with a review step before anything is saved.
> **Constraints that shape everything:** the Firebase **Spark** plan (no Cloud Functions, no Storage, no backend that sees a request), one Firestore document at most 1 MiB and one API request (batch or transaction) at most 10 MiB, and an app that runs entirely in the student's own browser.

---

## 1. Why, and what the reference papers show

Two existing papers written in Google Forms and printed to PDF (a 30-question and a 25-question multiple-choice test for a mechanical workshop course) are the model for what teachers already have:

- Every question is **single-answer**, 4 options, 1 point.
- **14 of the 30** questions in the first paper (and several in the second) carry **one diagram** each: "Identify the tool shown in the diagram", "The numbered part labelled 1 is called?".
- The picture belongs to the **question text**: it sits between the question and its options. **No option is an image.**
- The printout is a **form export**, not the layout the importer reads today (section 8.5): options have no letters, each question line ends with "1 point", "Mark only one oval." precedes the options, every page has a header and footer (date, form title, a web address, "n/22"), the paper has **no answer key**, and "Email" and the instructions are counted as items.

So the first version of the images supports **one optional image per question, in the question text**. A paper with no pictures is unaffected.

## 2. Decisions

| #   | Decision                | Choice                                                                                                                                                                                                                                            | Why                                                                                                                                                    |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Scope of images         | One **optional** image per question, in the question text. Options stay text. Several images per question and option images are later, if ever.                                                                                                   | It is what the reference papers need; every extra shape multiplies the builder, the import and the cost.                                               |
| 2   | Where images are stored | **Firestore image packs** under the exam (`exams/{examId}/content/images_{n}`), each holding several images as data URLs, up to about 900,000 characters. The question holds only a small reference. An image keeps its pack (stable assignment). | Section 4. Not inline in the questions document, not the Realtime Database, not Firebase Storage.                                                      |
| 3   | Quality                 | **Lossless first**; a visually lossless fallback only when an image does not fit; a per-image report in the builder.                                                                                                                              | The owner wants as much quality as possible; the free tier, the 1 MiB document and the 10 MiB request make "always lossless" impossible at 100 images. |
| 4   | Sources                 | Upload, drop or paste in the builder; Word import; PDF import (documented layout and Google Forms printouts); Markdown (embedded data only).                                                                                                      | Teachers have papers already; typing them again is the barrier.                                                                                        |
| 5   | Import matching         | A picture directly between a question's text and its first option is **clear** and attached; every other picture is attached by position and marked **check**. Every image, clear or not, goes through a **review step**.                         | A silent wrong match puts a diagram on the wrong question, which is worse than no diagram.                                                             |
| 6   | Vector figures in a PDF | A **page-region snapshot** tool in the review step.                                                                                                                                                                                               | A drawn figure is not a picture, so nothing can be extracted; the snapshot is also the fallback for anything missed.                                   |
| 7   | Budget                  | The form note and the publish guard count the **extra reads and the downloaded megabytes** of the images.                                                                                                                                         | The exam budgets are 10,000 reads and writes a day; images are the first thing that can make a sitting expensive in bytes.                             |
| 8   | Integrity               | Two presets on the Online exam section, **Supervised** and **Unsupervised**. Measures **record and show the teacher; nothing blocks the student** and nothing is penalised automatically.                                                         | The same school sits some papers in a supervised lab and some at home; a notification, a dropped connection or a laptop update looks like cheating.    |
| 9   | Honesty                 | Everything runs in the student's browser, so it can be bypassed, and the log itself is written by the student's browser (section 9.6). The spec lists what is **not** realistic (section 9.8) so no one promises it.                              | A promise the software cannot keep is worse than a limit that is stated.                                                                               |
| 10  | What the teacher keeps  | After Finalize (which deletes the attempts) a **compact timeline** of up to 50 entries and the summary numbers stay on the student's grade.                                                                                                       | The teacher must be able to answer a question about a sitting weeks later, without keeping every attempt document.                                     |
| 11  | Order of work           | **Integrity log first**, then images (builder, Word, PDF and Google Forms), then the presets' extras, then optional pools (section 12).                                                                                                           | The log is small, independent, builds on the tab counter that exists, and answers the first need.                                                      |
| 12  | Google Forms printouts  | The PDF reader gets a **detected Google Forms profile** (section 8.5), with a key-entry step because the printout has no answers.                                                                                                                 | The papers teachers already have are these printouts; without it they cannot be imported at all.                                                       |

## 3. Data model (images)

### 3.1 The question

`ExamQuestion` (in `src/types/exams.ts`) gains one optional field. Nothing is stored in the question except a reference:

```ts
export type ExamQuestionImage = {
  id: string; // the key inside its pack
  pack: number; // which pack holds it (stable: an image keeps its pack)
  w: number; // pixels, so the screen can reserve the space and avoid a jump
  h: number;
  bytes: number; // size as stored (for the budget and the builder's report)
  exact: boolean; // opaque 8-bit sRGB pixels identical to the source (section 5)
  alt: string; // optional text for screen readers; empty when "decorative" is ticked
  decorative?: boolean;
};
// ExamQuestion = { id, text, kind, options, points, image?: ExamQuestionImage }
```

The questions document stays text-only, so it keeps well under 1 MiB at 100 questions and the student's first read stays small. The same picture used on two questions is stored once (identical content hash, one `id`, two references).

### 3.2 The image packs

`exams/{examId}/content/images_{n}` (n = 1, 2, 3 …), one document per pack:

```ts
{
  revision: number;
  updatedAt: Timestamp;
  images: Record<
    string,
    {
      mime: "image/png" | "image/jpeg" | "image/webp";
      data: string; /* data URL */
    }
  >;
}
```

- **Stable assignment.** An image keeps the pack it was first put in. A new image goes to the first pack with room (up to about 900,000 characters), else a new pack. Removing an image rewrites only its own pack. Packing "in question order" was rejected: one removed image would shift every later image and rewrite every later pack. A **Tidy images** action (explicit, with its cost shown) repacks when much space is wasted.
- A pack is rewritten only when one of its images was added or removed, so a save that edits text costs no image writes.
- Why packs and not one document per image: a student who opens the paper reads **every pack**, and each document read costs one read plus one rule read (the attempt check; Firestore bills a rule lookup once per dependent document per request). Fourteen 60 KB diagrams are **one pack = two reads**, instead of **28 reads** with a document each.

### 3.3 Where each piece is used

| Piece                | Reads the packs?                | Notes                                                                                                                                                                                                 |
| -------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Builder              | Yes (staff)                     | Loads the packs with the questions; shows each image and its report.                                                                                                                                  |
| Preview as student   | Yes (staff)                     | Same display as a student.                                                                                                                                                                            |
| Student attempt      | Yes, after the attempt exists   | After the questions, in the background (section 6.2).                                                                                                                                                 |
| Duplicate exam       | Yes (staff), then writes copies | `copyExamContent` copies the packs after the questions, in several commits (section 3.4).                                                                                                             |
| Delete exam          | Deletes                         | `deleteExamCascade` lists the whole `content` collection (today it deletes a fixed list, `questions` and `key`, which would leave the packs behind); the bulk-seed teardown and count scripts follow. |
| Results and Finalize | No                              | Finalize deletes attempts; the questions and packs stay with the exam.                                                                                                                                |
| Parent               | Never                           | Same as the questions.                                                                                                                                                                                |

### 3.4 Writing packs: size, order, orphans, conflicts

The builder saves with one `runTransaction` (the questions, the key, the counts and an audit entry) and Duplicate with one `writeBatch`. A Firestore API request is limited to **10 MiB**, a transaction to 270 seconds, so 45 MB of images can never be in one commit. Therefore:

1. **Packs first.** Changed packs are written before the questions, in commits of at most about 8 MiB each (a pack is at most about 1 MiB), with a progress line ("Saving images 3 of 9") and a retry that resumes where it stopped.
2. **Then the transaction** that checks the revisions and writes the questions (with their references), the key, the counts and the audit entry. The audit detail names how many images were added and removed.
3. **Orphans are harmless and swept.** A failure between the two steps leaves packs that no question references; the next successful save deletes packs (and images inside packs) that no question references, and a failed save is never reported as saved.
4. **Conflicts.** Packs carry a `revision` like the questions; two people saving the same exam are refused with the existing "someone saved since you opened this" message, checked against the packs' revisions too.
5. **Duplicate** reads the source packs and writes the copies in the same size-limited commits before the new exam's questions.

## 4. Why Firestore packs

| Option                               | Verdict      | Reason                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline in `content/questions`        | No           | 100 questions with a diagram each breaks the 1 MiB limit, and every read of the text would download every picture.                                                                                                                                                                                                                  |
| The Realtime Database blob store     | No           | Its rules have no tenant or role check (`docs/ISSUES_AND_GAPS.md` #65): any signed-in user of any institution can read a blob. The paper's pictures would be readable before the exam starts, undoing the rule that a student reads the questions only with their own attempt in progress. It also shares the 100-connection limit. |
| Firebase Storage                     | No (for now) | Needs the Blaze plan, which this project does not use. If the school moves to Blaze, packs can move to Storage with a rule that reads the attempt; the question's reference does not change.                                                                                                                                        |
| **Firestore packs under `content/`** | **Yes**      | The same document path style, the same rules as the questions (the attempt-first read, the write lock), no new service, and a read cost the budget can estimate.                                                                                                                                                                    |

Consequence to state plainly: a picture is **readable only by someone who may read the questions**, so it cannot be fetched before the clock starts or after the attempt is handed in. No new top-level collection and **no new index** are needed: packs are read by id.

## 5. The image pipeline (lossless first)

All in the browser, before anything is written; a new `src/lib/examImage.ts` (pure parts, byte-level) with a lazy canvas part, reusing the magic-byte sniffing of `imageUpload.ts` (`sniffImageType`). `exact` means **opaque 8-bit sRGB pixels identical to the source**; anything else is `exact = false` and says so.

1. **Accept** PNG, JPEG and WebP up to 10 MB source (`inspectImage` in `examImage.ts`); reject anything whose bytes do not match. **GIF, animated PNG and animated WebP are refused** in the first version, with a message to save a still PNG or JPEG (a still GIF needs the canvas to be cleaned, and the diagrams of school papers are PNG or JPEG). **HEIC** and **SVG** are refused with a message saying what to save instead (a later option for SVG: rasterise it through an `<img>` element, which runs no script, `exact = false`); **EMF/WMF** are refused. Dimensions are read from the file's headers, and a picture of more than about 24 megapixels (a decompression-bomb and phone-memory guard) is refused before anything is decoded.
2. **Per image, in this order, stop at the first that fits the cap of about 450 KB:**
   1. **Keep the bytes, remove the private parts.** JPEG: remove comments, GPS and other metadata segments **without re-encoding**, but **keep the Orientation tag and the colour profile** (dropping them rotates phone photos and shifts colours). PNG: drop the ancillary text, time and GPS chunks and keep the image data; the compressed image data can be **recompressed losslessly with `fflate` at level 9** (no canvas involved). `exact = true`.
   2. **Re-encode losslessly as PNG** from the decoded pixels, only for an opaque 8-bit sRGB source (a canvas changes alpha, colour-managed and 16-bit pixels, so those skip to step 3 and are `exact = false`). `exact = true`.
   3. **Visually lossless:** only when the image is over the cap, re-encode as WebP (or JPEG where WebP is not available) at the **highest quality that fits**, stepping down in small increments, and **downscale only beyond 1600 px on the long side**. `exact = false`.
3. **Report** in the builder for every image: pixels, size, and "kept exactly" or "reduced (quality 92, resized to 1600 px)". A teacher who sees "reduced" can crop or simplify the figure and add it again.
4. **Cap check:** the stored data URL of one image is never over about 600,000 characters, so one image always fits one pack document.
5. **Lazy code:** the canvas and `fflate` parts are loaded only when an image is chosen, and the bundle-boundary tests (`examImportBundle.test.ts`) are extended to pin it.

What this does not promise: **true lossless for every picture at any size**. Canvas cannot write lossless WebP, a photograph is large losslessly, and the free tier has a ceiling (section 7). Line drawings and diagrams, which is what the reference papers hold, normally fit exactly.

## 6. Builder and student screens

### 6.1 Builder (question editor)

- Under the question text: **Add image** (button, drop and paste from the clipboard). An image shows as a preview with its report line, **Replace**, **Remove**, and an **Alt text** field with a **Decorative** tick. Alt text is optional; a hint says what it is for. Duplicating a question copies its image reference.
- Preview and **Preview as student** show the same picture at the same size.
- Removing or replacing marks its pack to be rewritten; nothing is written until **Save** (as for every builder change).
- The builder reads the packs only when the exam document says it has pictures (`imagePacks` above 0), so an exam without pictures costs no extra read. A picture the canvas had to reduce is accepted and reported under the picture (no confirmation); one that is too large even reduced is refused with a message. While the pictures are saved the Save button reads "Saving images 3 of 9…", and a line under the title says how many pictures the questions use and what a student downloads for them.
- Validation: an image never blocks publishing; a question still needs its text (an image-only question is not allowed), so the paper reads correctly where the image cannot load.

### 6.2 Student screen

- The image is shown below the question text, at its natural size up to the width of the card, with the **reserved aspect ratio** (`w` and `h`) so the page does not jump when it appears.
- **The clock starts when the attempt is created, before the questions and pictures are read.** So the text is shown as soon as the questions arrive and **the pictures load in the background**: first the picture of the question on screen, then the next ones in order, with a "Loading the picture…" placeholder and the existing three-try policy; a picture never holds the timer or blocks answering. A question whose picture failed shows "The picture could not be loaded. Reload the page to try again."
- The decoded pictures stay in memory for the sitting (not re-read when moving between questions). A refresh re-reads the packs (the bytes are paid again), which the estimate counts once and the spec accepts.
- **Click or tap to zoom** (a dialog on the shared `DialogShell`, keyboard operable, focus returned on close, pinch and scroll on a phone, no motion when the user asks for reduced motion), because diagrams with numbered parts must be readable on a small screen.
- **Built as:** the packs are read by id, one at a time, in the order of the question on screen, then the questions after it, then those before it; each pack is tried three times with a pause (as the questions are); a pack that fails marks only its pictures, with **Try again** (it re-reads that pack without reloading the page, so the answers and the clock are untouched). The zoom fits the picture to the screen and has an **Actual size** toggle that shows it at its real pixels in a scrolling, pinch-zoomable box; the shared dialog has a wider option for it. The staff preview reads the exam's packs in one list when the exam has pictures.
- Plain `<img>` from the data URL (the CSP already allows `data:`); `alt` from the question; `draggable="false"`; no object URLs to leak.

## 7. Budget (reads, megabytes)

Today a student costs about 25 reads and 8 to 9 writes (`EXAMS_FEATURE_SPEC.md` section 9). Images add:

- **Reads per student:** `packs × 2` (the pack and the rule read of the attempt). 14 diagrams of about 60 KB are one pack and add 2 reads; **100 images of 300 KB** (about 410,000 characters each, two to a pack of 900,000) fill **50 packs and add 100 reads**, four times today's 25; 100 images at the 450 KB cap (about 600,000 characters, one to a pack) fill 100 packs and add 200 reads. `estimateExamWrites` (`src/lib/examBudget.ts`) takes the pack count and bytes and returns reads including packs.
- **Download per student:** the sum of the packs' bytes: **up to 45 MB** at the cap (100 images of 450 KB) against Spark's **10 GiB of Firestore downloads a month**. A school of 1,250 students sitting an exam with 20 MB of images would use about 25 GB, so **the megabytes matter more than the reads**.
- **The form note** adds "plus about N MB downloaded per student" next to the writes and reads.
- **The publish guard** (`examDayBudget.ts`, `examDayLoad.ts`) adds a **megabytes line** for the day (a soft budget of 2,048 MiB a day, `EXAM_DAILY_DOWNLOAD_MB`, about a fifth of the monthly allowance, in `examBudget.ts`; the exam document keeps `imagePacks` and `imageBytes`, written by the save like `questionCount`, so the guard never reads a pack) beside the 10,000 reads and 10,000 writes. A teacher over any of the three is refused with the totals; an administrator may "Publish anyway", exactly as today. It stays an **estimate**, not a meter.
- Builder-time cost of adding images: one write per changed pack at Save (a few writes, once).
- **Stored:** 14 diagrams of about 60 KB are under 1 MB per exam; 100 images at the cap are about **45 MB** per exam against Spark's 1 GiB of storage, so very image-heavy papers should be deleted when finished.

## 8. Import

Import is best-effort and **always ends in review**. Pictures become part of the import result (`ImportedQuestion.image`) and carry a **confidence**: `clear` or `check`.

### 8.1 Word (.docx)

- `docxText.ts` already walks the document XML and counts drawings it skips. It learns to **resolve** them: each `w:drawing` (inline or anchored) holds an `a:blip` with an `r:embed` id; the document's relationships file maps it to `word/media/...`; `fflate` (already loaded lazily by the Word reader) opens the file.
- A picture becomes a marker in the paragraph stream, in order, so the parser sees it **after the question's text and before the first option**: `clear`. A picture before the first question, after an answer line, or in a table or text box: `check`, or not found (text boxes and shapes stay unsupported and reported).
- **Built (reader):** `docxText.ts` returns the pictures with the lines. A `w:drawing` that holds a `pic:pic` and an embedded picture becomes a picture; a text box, chart, shape or linked picture is counted as a shape; a picture in a table is ignored with a note of its own. The paragraph is split around the picture so the marker line stands where the picture does (text before, marker, text after). Word's description of the picture is kept as its alt text and a crop is noted. The relationship target must resolve under `word/media/`. Limits: 10 MB a picture, 64 MB together, 100 pictures (the rest are left out with a note); a picture that is too large, damaged or missing never fails the file and keeps its place for the review. The Word file limit is 25 MB (PDF stays 5 MB). **Built (placing):** the question parser (`examDocumentText.ts`, shared with the PDF reader) takes each marker line before anything else and puts the picture on the question being read: `clear` after the question's text and before its first option, `check` among or after the options, after the answer line, or as a second picture on one question (a picture that stands after a question's options belongs to that question even when the next number follows it), and `unassigned` before the first question or when its question was left out (no text, or past 100). The result carries `images` (index, question, confidence) and `pictures` only for a file that held pictures. Until the review step is built, the import tells the teacher how many pictures were found and does not place them in the builder.
- **Built (PDF pictures):** `examPdfImages.ts` reads each page's drawing operations with pdf.js (a transform stack gives the place of every painted picture; a stencil mask is not read) and the decoded pixels become a lossless PNG at once (`encodePng`). Where the picture stands is turned into a marker line by `pdfLines.ts` (before the first text line that starts below the picture's top edge), so the question parser places it exactly as it places a Word picture: clear between a question's text and its options, check elsewhere, unassigned before question 1, with the same review step. Decoration is dropped (a picture under 24 pixels or 20 points, or the same content on every page of a file of two or more pages or on three or more pages); limits are 100 pictures, 16 megapixels a picture and 120 megapixels in all; a file may be 25 MB. A scanned PDF is still refused (the check reads the text only). A figure drawn with shapes is not a picture: the snapshot tool is the way to get it.
- **Built (snapshot):** the PDF import result keeps the file's bytes; **Add a snapshot of a figure** (beside the import button for a PDF, and in the picture step) opens a panel that draws the chosen page with pdf.js at twice its size (less if a side would pass 3,000 pixels), lets the teacher drag a box over it or set the box with number fields (percentages of the page, the way without a pointer), choose the question, and add it: the box is cropped to a PNG and becomes one more picture of the review, on that question, used, and put through the same picture check and size cap. A box smaller than 16 pixels is refused.
- **Built (wording):** the layout guide in the import dialog says where a picture goes (under the question text, before the first option), the formats and the 10 MB limit, that the review step decides every picture, and that only Word files import pictures yet; the dialog intro says a Word file can carry pictures; the Markdown template starts with an HTML comment (ignored by the reader, invisible when rendered) saying Markdown pictures are not imported yet. The Word and PDF templates are unchanged, so each reads back with nothing to check.
- EMF and WMF pictures cannot be decoded by a browser: reported as "unsupported picture format, save it as PNG or JPEG". A crop applied in Word (`a:srcRect`) is not applied; a note says the whole original is used.

### 8.2 PDF

- `examPdf.ts` already reads text with pdf.js (legacy build). It also reads the page's **operator list**: each painted image with its transform gives a position, and pdf.js hands back the decoded pixels, which become a **lossless PNG**.
- The position is compared with the **text lines of the same page** (`pdfLines.ts` groups pieces into baselines): a picture whose vertical position lies between a question's last text line and its first option line is `clear`; any other position is attached to the nearest question above and marked `check`; a picture with no question above it is **unassigned**.
- **Vector figures** (shapes, not pictures) cannot be extracted. The review step offers a **snapshot**: the page is rendered by pdf.js at 2x into a canvas, the teacher drags a box around the figure, and the box is saved as a PNG. This is also the fix for any picture the import missed.
- A JPEG inside a PDF is decoded by pdf.js, so the extracted PNG can be larger than the original; the pipeline's cap and fallback apply as for any image.

### 8.3 Markdown and the spreadsheet templates

- **Built:** `examMarkdown.ts` scans each line (with `indexOf`, never a pattern over the address, which can be megabytes) for `![alt](address)`, cuts each image out and writes the text before it, a picture marker and the text after it, as for a Word paragraph, so the shared parser places it and the picture step reviews it; the alt text is carried; a base64 data address is decoded under the Word limits (10 MB a picture, 64 MB in all, 100 pictures), a data address that is not base64 or is damaged keeps its place as a picture that cannot be read, a table line is skipped before images are looked for, and a Markdown file may be 25 MB. The template starts with a comment that says how to add one.
- Markdown: `![alt](data:image/png;base64,...)` is accepted (rare); an image with a web address is **ignored with a note**, because the CSP blocks it and a school paper should not depend on a third party's server. CSV and Excel have no pictures.
- The Word, PDF and Markdown **templates** gain one line about images; the downloaded example does not need to contain one.

### 8.4 The review step

A new step in the import dialog, shown only when the file produced images and **before** the existing "Review in the builder":

- A grid of every image: the picture, the question it was matched to ("Question 7: Identify the tool shown…"), a **Clear** or **Check** badge, the size and "kept exactly / reduced".
- Per image: **Use**, **Move to another question** (a picker), **Remove**. A question may keep only one; moving a second picture onto a question asks which to keep.
- **Unassigned** pictures are listed with a picker; they are dropped if left unassigned.
- For a PDF: **Add a snapshot** (section 8.2).
- **Every image must be reviewed**: the **Continue** button is disabled until each image is Used, Moved or Removed (a **Use all clear ones** shortcut marks the `clear` ones; `check` ones always need a decision).
- Then the usual builder review, with nothing saved until **Save**.
- **Built for Word files:** the step opens from "Review the pictures" when the file held pictures. Each picture goes through the picture check (one at a time, in the background) and its card shows the question label, a Clear / Check / No question badge, the size and "kept exactly" or "reduced", and Use, Remove and a picker to move it; a picture the file could not give or the check refused shows why and cannot be used. **Use all clear ones** marks the clear pictures that are ready. Continue waits for every clear and check picture to be decided and is blocked while two pictures are used on one question (each card says so); a picture that is on no question is dropped unless it is moved to one, and does not block. The chosen pictures are put on their imported questions in one pass (a picture whose question did not fit under the 100-question limit goes with it), with Word's description as the starting alt text, and are saved only with **Save**.

### 8.5 Google Forms printouts (a PDF layout profile)

Today's importer reads a numbered stem, **lettered** options and an "Answer:" line (`examDocumentText.ts`). A Google Forms printout (the reference papers) has none of that, so it would import nothing. The PDF reader gets a **profile**, chosen when the file contains "Mark only one oval." or "Check all that apply." lines together with "N point(s)" lines:

- **Dropped:** the header and footer lines of every page (the date and time, the form title, the web address, "n/22"), the form title and "GENERAL INSTRUCTIONS" block before the first question, and the first item "Email *" with the instructions line.
- **Question:** a line "N. text" whose right-hand end holds "1 point" (or "2 points") is the stem; the points come from that text; stems that wrap onto the next line are joined; Roman-numeral lines inside a stem ("I.", "II.") stay text.
- **Options:** the lines after "Mark only one oval." (single answer) or "Check all that apply." (several) up to the next question are the options, in order, lettered A, B, C by the importer.
- **No key:** the printout has no answers, so after the profile the review step shows a **key-entry panel** (one row per question, the options as radio buttons or checkboxes) before "Review in the builder"; a question left without an answer carries the existing "no correct answer" warning.
- A picture between the stem and "Mark only one oval." is `clear` (this is where the reference papers put their diagrams).
- **Built:** `examPdfFormsProfile.ts` (pure, patterns not positions) detects the form by an oval line together with a points figure at the end of a line, drops the header and footer lines of every page (a date and time at the top, a web address, the page figure only when it is this page's number out of the file's pages, a title repeated on at least half of two or more pages), drops everything before the first question, and writes the documented layout (`N. text [P points]`, `A.` options, a kind marker line for single or several, no answer). A question starts at "N. text" with its points at the end of the line, or with them on one of the next three lines (a wrapped text). More than six options are joined to the sixth with a warning. The question parser takes the kind marker as the question's type. The key step (`ImportKeyEntry`, `examImportKey`) follows the picture step (or comes straight after the file step) and the choices are put in the questions with the "no correct answer" warning removed for each answered question. The papers themselves are the manual check.
- The detection is conservative: a file that is not recognised is read by the documented layout as today. Fixtures for the tests are small PDFs built in the test (the same text in the same positions), not copies of a real paper.

## 9. Integrity

### 9.1 What the app already does

The paper is readable only after the clock starts (the attempt-first rule); the answer key never reaches a student's browser; each student gets their own order of questions and options (`seed`); the deadline comes from the server's clock; one session per account (the Realtime Database lock); a **tab-leave counter** on the attempt (`tabSwitches`, from `trackAway`, which counts one leave whenever the page is hidden **or** unfocused, and never records when or how long), shown to the teacher in the results table and copied onto the grade.

### 9.2 The two presets

One dropdown on the **Online exam** section of the exam form, saved on the exam as `integrity: 'supervised' | 'unsupervised'` (default **supervised**, `EXAM_INTEGRITY_DEFAULT`, so every existing exam behaves as today), and one optional tick `forwardOnly`. The form shows what each preset turns on.

| Measure                                             | Supervised | Unsupervised |
| --------------------------------------------------- | :--------: | :----------: |
| Activity log (section 9.3)                          |    yes     |     yes      |
| Teacher report and "review" badge (section 9.4)     |    yes     |     yes      |
| Question deterrents (section 9.5)                   |    yes     |     yes      |
| What-is-recorded notice on the start screen         |    yes     |     yes      |
| Ask for fullscreen and record leaving it            |     no     |     yes      |
| Name and id watermark over the questions and images |     no     |     yes      |
| Stricter threshold for the "review" badge           |     no     |     yes      |
| Forward-only navigation (the `forwardOnly` tick)    |     no     |     yes      |

**Built (forward only):** with the tick on an Unsupervised exam, `canGoTo` allows only the next question (or staying), and the next one only once the current question is answered (`canAdvance`, so a question cannot be skipped and Next says "Choose an answer to continue"), Previous and every numbered button but the current one are off and spoken as "already left, you cannot go back" or "not reached yet", the start screen and the attempt screen say you cannot come back, and Submit is available from any question. The browser keeps no position, so a reload reopens on the question after the last one answered, so a question the student had left is not opened again (`resumeIndex`); a free exam reopens on the first as before. The tick counts only with Unsupervised (`isForwardOnly`), the same rule as the form and the rules. The staff preview moves freely and notes that the exam is forward only.

**Built (fullscreen and the watermark):** on an Unsupervised exam the **Start** click asks the browser for fullscreen (a browser allows it only from a click) and starts the exam whatever the answer; the start screen says so. While the page is not in fullscreen and the browser offers it, the attempt screen shows "Return to fullscreen". The activity log records `fs_exit` when fullscreen is left after being in it, and `fs_unavailable` once where the browser has no fullscreen for the page (an iPhone's Safari), and nothing blocks. A faint tiled mark with the student's name and the first six characters of their account id (`Ada Brown · 7K2Q9F`) lies over the question area and the zoomed picture (no pointer events, hidden from assistive technology, removable with developer tools); the staff preview has neither. The stricter Review thresholds were already used from the exam's preset when the grade is summarised.

**Built (the fields):** the exam form has a **Supervision** select (Supervised (in a room) / Unsupervised (at home)) with a hint, and, for Unsupervised only, a **Forward only** tick; an exam saved without touching them has neither field and is supervised. They are written only when they are not the default or differ from what the exam holds, so saving an exam that never sets them works on the rules deployed before; the rules accept `integrity` and `forwardOnly` (forward only only with Unsupervised) once deployed. A copy of an exam keeps both. The measures themselves (deterrents, fullscreen, watermark, forward-only navigation) follow.

**Nothing blocks the student and nothing is penalised by the software.** The measures give the teacher evidence and give a student a reason not to try.

### 9.3 The activity log: what it can and cannot see

The question the owner asked: **can the app report, after the sitting, that a student opened a new tab or switched to another tab?** The honest answer, from the browser's own rules (Page Visibility and focus events):

| What happened                                                                                  |  Seen?   | How it is recorded                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | :------: | ------------------------------------------------------------------------------------------------------------------------------------ |
| Switched to another tab, or opened a new tab that came to the front                            |   yes    | the page is **hidden**; the two cases look the same, so the report says "left the exam page"                                         |
| Minimised the window, switched to another app, locked the screen, an app switch on a phone     |   yes    | the page is **hidden**                                                                                                               |
| Clicked another window (side by side), opened developer tools, a notification shade on a phone |  partly  | the window **lost focus** but the page stayed visible: recorded as "unfocused", a weaker signal                                      |
| Opened a background tab (Ctrl+click on a link) and never looked at it                          |    no    | nothing changes on the exam page                                                                                                     |
| What the other tab or app was (its address, its content)                                       |    no    | no browser API reveals it                                                                                                            |
| A second device, a phone on the desk, a helper                                                 |    no    | outside the browser                                                                                                                  |
| Another tab **of this app** opened in the same browser                                         | optional | a `BroadcastChannel` handshake can notice it (and sign-in does not carry over, since each tab keeps its own session), off by default |
| A window side by side that is never clicked                                                    |    no    | the page stays visible and focused                                                                                                   |

So the report says **"left the exam page N times, for X in total, longest Y, at these times, hidden or only unfocused"**, never "opened a new tab" and never "visited a website". A phone call, a notification, a dropped connection and a laptop update look the same as a leave, so the badge is a prompt to look, not a verdict.

**The log** is written on the attempt, with the **existing checkpoint** (no extra writes):

```ts
// src/types/exams.ts. Attempt fields (all optional; an old attempt has none)
const EXAM_LEAVE_KINDS = ['hidden', 'blur'] as const;
const EXAM_ACT_KINDS = ['fs_exit', 'fs_unavailable', 'copy', 'cut', 'print', 'menu', 'app_tab'] as const;
type ExamActivityEvent = {
  t: number;   // whole seconds since the attempt started, on the server-corrected clock the countdown uses
  k: ExamLeaveKind | ExamActKind;
  d?: number;  // leaves only: seconds away; while a leave is open each checkpoint saves the time so far (a lower bound)
};
events?: ExamActivityEvent[];           // at most EXAM_LIMITS.maxActivityEvents = 200, never shorter than before
answeredAt?: Record<string, number>;    // question id -> seconds since the start of its latest answer (one key per question)
tabSwitches: number;                    // unchanged: the number of leaves
```

Readers meet entries written by another version of the app (the rules do not look inside the list), so they check a kind with `isActivityKind` / `isLeaveKind` and **skip an entry whose kind they do not know** instead of failing. `EXAM_ACTIVITY_KIND_LABELS` holds the words the report uses ("Left the page (another tab, window or app)", "Window lost focus", …), none of which says a tab was opened.

- **One entry per leave**, not a leave and a return. A leave starts on `hidden` or on `blur`; if the page becomes hidden during an unfocused spell the entry becomes `hidden`; it ends when the page is visible and focused again and `d` is set from a monotonic clock (`performance.now()`), so a changed device clock does not change it. While a leave is open each checkpoint saves its **time so far**, so a student who closes the browser while away still shows "away at least N seconds" (the report says "at least" for a leave that never closed). At the 200-entry cap new leaves are still counted (`tabSwitches` stays exact) but no entry is added; the summary's `leaves` is the larger of the entries and `tabSwitches`. This replaces `trackAway`'s single boolean with a small state machine (present, unfocused, hidden) that keeps counting exactly as today (`tabSwitches` still counts leaves).
- **Acts** (`copy`, `cut`, `print`, `menu`, `fs_exit`) are single entries; the same kind within two seconds is merged. There is no `paste` (the exam has no text inputs). The first phase records `copy`, `cut`, `print` (the browser's `beforeprint`) and `menu` (the context menu) and **blocks nothing**; `fs_exit` and `app_tab` come with the presets and the optional phase. `answeredAt` is written when an answer is changed, with the checkpoint.
- **Persistence:** every change also goes to the local backup (`examAnswerDraft`), which is extended with `events` and `answeredAt`; on resume the lists are merged by union on (t, k), so a refresh or a second device never loses or duplicates entries, and a count never goes down. Entries after the last checkpoint are lost only if the device and the browser's storage are lost together.
- **Optional extra checkpoint:** an open question (section 15) is whether the first return after a leave of 30 seconds or more should save at once (at most one extra write per attempt) so a student who then closes the page leaves evidence.

**Built (the activity log):** `lib/examActivity.ts` is the state machine (`applyObservation`, `snapshotEvents`, `addAct`, `mergeEvents`, `compactTimeline`, `reviewNeeded`, `summarizeActivity`) and `hooks/useActivityLog.ts` feeds it from the page. One entry is written per leave (`hidden` or `blur`) with the seconds away from a monotonic clock; while a leave is open each checkpoint saves the time so far, so a leave that never closed reads "at least". The same kind of act within two seconds is merged. At the 200-entry cap new leaves are still counted (`tabSwitches` is exact) but add no entry. `answeredAt` is written when an answer changes. Everything also goes to the local backup, and on resume the server's copy and the backup are merged by union on (time, kind), so a reload never loses or repeats an entry. The extra checkpoint after a long leave (open question 2) is off. The start screen shows `ACTIVITY_NOTICE` before every exam.

### 9.4 The teacher's report

- The results table's "Tab switches" column becomes an **Integrity** column: the number of leaves, the **total and longest time away**, and a **Review** badge when a threshold is passed. A click opens the **timeline** (when from the start and by the clock, what, how long). The CSV export gains the same figures.
- **The Integrity cell** reads, for example, "3 leaves, 4 min 10 s away (longest 2 min)", with an amber **Review** mark and a **Timeline** button; a score made before the log shows the old count and "no timeline". The CSV keeps "Tab switches" (the number of leaves) and adds "Time away (seconds)", "Longest time away (seconds)" and "Review" (Yes or No). The summary on the grade is worked out when the attempt is graded, from the exam's length plus the student's extra time and the exam's preset (absent means supervised), and only for an attempt that has a log.
- **Thresholds scale with the length of the exam**: a Review badge when leaves exceed a number per hour of the exam, or the time away exceeds a share of the exam's duration, with a minimum of two leaves (proposal: Supervised 6 per hour and 5%; Unsupervised 3 per hour and 2%; constants in one file, settled with real sittings).
- The wording is **"Review"**, never "cheated".
- **After Finalize (which deletes the attempts):** when the grade is written (and before Finalize) the results screen copies the summary onto the grade: `integrity` (type `ExamIntegritySummary`: `leaves`, `hiddenLeaves`, `awaySeconds`, `longestAwaySeconds`, `acts`, optional `fastAnswers`, `review`, `timeline`), where `timeline` is at most **50 entries** (`EXAM_LIMITS.maxTimelineEntries`) (the longest away spells first, then in time order). The Integrity column and the timeline dialog read the attempt while it exists and the grade afterwards.
- **`fastAnswers`** (answers given implausibly fast) needs the per-answer times of `answeredAt`; without it only leaves and time away can be reported.
- **A similarity hint** (optional, later): for each pair of students, the number of shared **wrong** answers on questions the class mostly got right; shown as "similar answers" for the pairs above a threshold. It runs in the teacher's browser on the attempts read for grading, before Finalize. It is a hint, never an accusation.

**Built (the report):** the results table's Integrity column shows the leaves, the time away (total and longest), an amber **Review** mark when the leaves or the time away pass the exam's threshold for its length and preset, and a **Timeline** button (`ActivityTimelineDialog`) that lists each entry with the time into the exam, what happened and how long; a score made before the log keeps the old count and says there is no timeline. The CSV keeps *Tab switches* and adds *Time away (seconds)*, *Longest time away (seconds)* and *Review* (Yes or No). The summary and a compact timeline of up to 50 entries (the longest spells first, then in time order) are copied onto the grade in the grading batch that already runs, so the report survives Finalize with no extra write; a re-grade recomputes it and a manual score keeps it. The Finalize dialog says the summary is kept, and the timeline dialog says what a browser cannot tell.

### 9.5 Question deterrents

On the paper, and on every image: no text selection, no copy or cut, no context menu (right click and long press), no drag of an image, and the paper is hidden when printing (`@media print`). Each attempt is **recorded** in the log. These stop a casual copy only; a screenshot, developer tools or view-source bypass them. They also take away a convenience (translating a word, using a screen reader's copy), so **screen-reader text and keyboard operation are never removed**, and a teacher can still preview the paper without them.

**Built (the deterrents):** `useQuestionDeterrents` cancels the default action of `copy`, `cut`, `contextmenu`, `dragstart` and `selectstart` inside the question area of the attempt screen (which includes the zoomed picture), the area is `select-none` and does not print (`print:hidden`, with the line "Printing the questions is switched off." in its place), pictures stay `draggable={false}`. The events keep travelling, so the log's listeners on the window still record each attempt as `copy`, `cut`, `print` or `menu`. Nothing is hidden from assistive technology and no key or focus is changed. The staff preview does not use them, and the start screen says what is switched off.

### 9.6 The log is evidence, not proof

Everything here runs in the student's browser and is **written by the student's browser**. A student who uses their own sign-in token can write a shorter or empty log. The rules can only make that harder: `events` may never become shorter than it was (`d.events.size() >= o.events.size()`), is capped at 200, and `tabSwitches` may never go down (as today). The server's own `lastSavedAt` of each checkpoint brackets the log in time. **An empty log is not proof that nothing happened**, and the report says so.

### 9.7 Privacy

**Built:** `docs/compliance/PRIVACY_NOTICE.md` (sections 3, 5, 6 and 9) and `COMPLIANCE_REVIEW.md` describe what an exam records, who can see it (staff of the exam; the student on their own attempt; the student and a linked parent through a direct read of a released score, since the summary is on the grade) and how long it is kept (the attempt's log goes with the attempts at Finalize; the grade keeps the summary and at most 50 timed entries), with the legal choices marked for counsel.

**The summary on the grade can be read by the student and a linked parent with a direct read of their released grade** (the screens show them nothing, and they could already read the tab count there). It is a summary and at most 50 timed entries; this is documented rather than prevented, because a staff-only document would cost one more write per student per exam.

These are records about a (usually under-age) person's behaviour. The start screen says exactly what is recorded, in the words "This exam records when you leave this page (by switching to another tab or window) and when you copy or print. Your teacher can see it." (`ACTIVITY_NOTICE` in `ExamStartScreen.tsx`); the privacy notice (`docs/compliance/PRIVACY_NOTICE.md`) and the compliance review name it and its retention (the attempt's log is removed with the attempts at Finalize; the grade keeps the summary and at most 50 entries); only staff who may see the exam's results can read it (students can read their own attempt, which holds their own log). Nothing is shown to parents.

### 9.8 What is not realistic (and the spec says so)

| Wish                                                                    | Why it cannot be done here                                                                                 |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Tell "opened a new tab" from "switched to a tab", or see the address    | Both just hide the exam page; no browser API reveals another tab's address or content.                     |
| Stop screenshots or a phone photographing the screen                    | The device and the camera are outside the browser; the watermark only makes a leaked photo traceable.      |
| Detect a second device, a helper in the room, or a phone under the desk | Nothing in the browser can see it. This is what supervision is for.                                        |
| Detect several screens                                                  | The only API is experimental, Chromium-only and asks the user for permission: not used.                    |
| A lockdown or kiosk browser                                             | Needs an installed app (Safe Exam Browser) **and a server that verifies it**; this project has no backend. |
| Webcam or AI proctoring                                                 | Cost, bandwidth, privacy for minors under the Data Protection Act, and no backend to process video.        |
| Restrict by IP address or location                                      | No server sees the request's address; Firestore rules cannot read it.                                      |
| Block developer tools or the keyboard shortcuts                         | The student controls the browser; anything blocked on the page is bypassed one layer down.                 |
| Prove who is at the keyboard                                            | An account can be shared; the single-session lock only stops two sign-ins at once.                         |
| Force fullscreen on every device                                        | iPhone Safari does not reliably offer it for pages; it is recorded as "unavailable", never as an exit.     |
| A log the student cannot touch                                          | Section 9.6.                                                                                               |

### 9.9 Stronger ideas, later

- **Question pools:** the teacher builds a bank of M questions and each student gets N of them, chosen from the existing `seed`. It is the strongest measure against sharing answers. It changes the builder, the scoring (the maximum points differ per student), the statistics and the answer-key view, so it is the last phase, optional.
- **Per-question time limits:** reduce answer sharing at a real cost in fairness; not offered. Forward-only navigation is the `forwardOnly` tick.

## 10. Rules

**New or changed in `firestore.rules`** (all additive; existing documents stay valid):

- **Image packs:** `match /institutions/{institutionId}/exams/{examId}/content/{pack}`, allowed only when `pack.matches('images_[0-9]+')` (the wildcard would otherwise also match `questions`; the existing literal block stays). Read when the person may read the questions (`canReadAdminData()` or `examStaffOf`, or `examOpenToStudent` and `examAttemptInProgress`); create and update by `examStaffMay` while `examQuestionsEditable`; delete by `examStaffMay`. Shape: keys `revision`, `updatedAt`, `images` only; `images` a map of at most 100 entries; `revision` an int; `updatedAt == request.time`. The size of one image is enforced by the client and bounded by the 1 MiB document limit (a rule cannot measure map values), as answer values are today (`docs/ISSUES_AND_GAPS.md` #73).
- **How it is built (commit 7):** the block is one wildcard, `content/{pack}`, in which writes and deletes need `isImagePackId(pack)` (`images_[0-9]+`, so the wildcard can never write `questions`, which keeps its own block), and **reads** are open to the exam's staff and administrators for any document, so they can list `content` and find the packs a failed save left, while a student reads only a pack id, with an attempt in progress. A pack needs `revision >= 1`, one to 100 pictures and the server time. The exam document accepts `imagePacks` (0 to 100) and `imageBytes` (0 to 120,000,000). `firestore.indexes.json` has a field override for `content`.`images` with no indexes, so a picture's data is not indexed (optional to deploy: `npm run firebase:deploy:indexes`).
- **The question's `image` reference:** `isValidExamQuestions` caps the number of items; the `image` shape inside an item is not checked (a rule cannot loop over a list). A malformed reference only shows a broken picture to the staff member who wrote it.
- **The exam:** `isValidOnlineExam` allows optional `integrity` (`supervised` or `unsupervised`) and `forwardOnly` (bool); both are copied by Duplicate.
- **The attempt:** the create and update key lists gain optional `events` and `answeredAt`. Create: absent or empty. Update by the owner while `in_progress`: `events` a list of at most 200 that **never shrinks** (`d.events.size() >= o.get('events', []).size()`), `answeredAt` a map of at most 100.
- **The grade:** `isValidExamGrade` allows an optional `integrity` map with `hasOnly` of its keys and a `timeline` list of at most 50 entries, written by staff only.
- **Emulator cases** (added to `rules-tests/`): a teacher of the exam writes a pack in the draft and before opening, not after; another teacher, a student and a parent cannot write one; a student reads a pack only with their own attempt in progress, not before the start, after the submit or for a class they are not in; a parent never; a pack write that targets `questions` through the wildcard is refused; the `integrity` and `forwardOnly` values; `events` cannot shrink, is capped, and an old attempt without it still saves; the grade's `integrity` shape and size.
- **Collections and indexes:** **no new top-level collection** and **no new index** (packs are read by id; no new query).
- **Deploy order:** the rules are additive and backward compatible, so deploy them **before** the app (`npm run firebase:deploy:rules`). Writing the pack rules and the attempt and grade rules together means **one rules deploy** serves the whole feature.

## 11. Files that change

| Area                | Files                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Types               | `src/types/exams.ts` (`ExamQuestionImage`, `integrity`, `forwardOnly`, `events`, `answeredAt`, the grade's `integrity`)                                                                                                                                                                                                                    |
| Activity log        | `lib/examAttemptLogic.ts` (`trackAway` becomes a small state machine; merge of the log), `lib/examActivity.ts` (new, pure: entries, coalescing, summary, thresholds), `hooks/useRunningAttempt.ts`, `lib/examAnswerDraft.ts`, `lib/examAttemptSession.ts` (the checkpoint writes), `components/exam/take/ExamStartScreen.tsx` (the notice) |
| Report              | `lib/examResultsRows.ts`, `examResultsData.ts`, `examGradingLogic.ts` (`attemptFields` and the summary on the grade), `components/exam/results/ResultsTable.tsx` and a timeline dialog, the CSV export                                                                                                                                     |
| Presets and form    | `components/forms/exam/OnlineExamFields.tsx`, `forms/exam/examFormSchema.ts`, `lib/examFormLogic.ts`, `examSettings.ts`, `examDuplicate.ts`, `ExamForm.tsx`; deterrents, watermark and fullscreen in `components/exam/take/*`                                                                                                              |
| Image pipeline      | new `src/lib/examImage.ts`, `examImagePack.ts` (pure: stable assignment, sizes, report), `examImageCanvas.ts` (decode and re-encode, lazy)                                                                                                                                                                                                 |
| Content             | `lib/examContent.ts` (`loadExamContent`, `saveExamContent`, `copyExamContent`: packs first, then the transaction), `examBuilderLogic.ts` (the question list keeps an image), `examDuplicate.ts`                                                                                                                                            |
| Builder             | `components/exam/builder/QuestionEditor` (Add image, report, alt text), `hooks/useExamBuilder.ts`                                                                                                                                                                                                                                          |
| Student and preview | `components/exam/take/StudentQuestionView.tsx`, a new image view with zoom, `hooks/useExamAttempt.ts` and `examAttemptSession.ts` (load the packs after the questions, in the background), `hooks/useExamPreview.ts`                                                                                                                       |
| Import              | `docxText.ts`, `examDocx.ts`, `examPdf.ts`, `pdfLines.ts`, `examDocumentText.ts` (and a Google Forms profile module), `examImportKinds.ts`, `examImportRead.ts`, an image review step and a key-entry step in `ExamImportDialog.tsx`, `examMarkdown.ts`                                                                                    |
| Budget              | `examBudget.ts`, `examDayBudget.ts`, `examDayLoad.ts`, `components/forms/exam/OnlineExamFields.tsx`                                                                                                                                                                                                                                        |
| Cascade and scripts | `examDelete.ts` and `examDeleteLogic.ts` (list the `content` collection instead of `EXAM_FIXED_DOCUMENTS`), `scripts/teardown-bulk-institution.mjs`, `scripts/count-seed-institution.mjs`, the seed's exam with images                                                                                                                     |
| Rules and tests     | `firestore.rules`, `rules-tests/examImages.rules.test.ts`, `examIntegrity.rules.test.ts`, new unit tests per module, `e2e/20-exam-integrity.spec.ts`, `e2e/21-exam-images.spec.ts`                                                                                                                                                         |
| Docs                | section 17                                                                                                                                                                                                                                                                                                                                 |

## 12. Phases

Each phase is a separate group of commits, each commit verified on its own staged tree (type-check, lint, the whole test suite), the rules by the emulator suite, and a run against the QA institution, as for the exams feature.

| Phase | Content                                                                                                                                                                                                                                 | Needs a rules deploy | Value                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------: | --------------------------------------------------------------------------------- |
| P1    | **Activity log and teacher report:** the state machine, `events` and `answeredAt`, the merge with the local backup, the start-screen notice, the Integrity column and timeline, the summary and compact timeline on the grade, the CSV. |         yes          | The teacher can see, after the sitting, when and how long the exam page was left. |
| P2    | **Images, builder and student display:** data model, packs and the commit-size strategy, the pipeline, the builder, zoom, progressive loading, duplicate, delete cascade and scripts, the budget lines. Optional everywhere.            |    (same deploy)     | A teacher can put a diagram on a question and a student sees it.                  |
| P3    | **Word import of pictures**, the **review step**, the template notes.                                                                                                                                                                   |          no          | Existing Word papers come with their diagrams.                                    |
| P4    | **PDF import of pictures**, position matching, the **page-region snapshot**, the **Google Forms profile** with the key-entry step, Markdown data pictures.                                                                              |          no          | Papers like the references can be imported.                                       |
| P5    | **The presets' extras:** the `integrity` and `forwardOnly` fields and form, deterrents, watermark, fullscreen, stricter thresholds.                                                                                                     |    (same deploy)     | Deterrence for home sittings.                                                     |
| P6    | Optional: question pools; the pair similarity hint; the optional second-tab detection.                                                                                                                                                  |        maybe         | The strongest protection against shared answers.                                  |

**Status (built):** P1, P2, P3, P4 and P5 are built; the rules of P1, P2 and P5 are in `firestore.rules` and need `npm run firebase:deploy:rules` (and optionally `firebase:deploy:indexes` for the picture index exemption); P6 is not built.

Order: **P1, then P2, P3, P4, then P5**. The rules for every phase are written with P1 and P2 so that **one rules deploy** serves them. P5 may move before P2 if the school has an at-home sitting first.

## 13. Tests

- **Pure units:** the activity state machine (hidden, unfocused, hidden-after-blur, return, a leave that never returns, coalescing, the cap), the merge by union on (t, k), `answeredAt`, the thresholds scaled by length, the summary and the 50-entry timeline choice; the pack assignment (stable, first fit, remove rewrites one pack, tidy), the pipeline's choice (cleaned original kept, orientation kept, PNG re-pack, alpha skips to the fallback, the downscale threshold, the cap), the metadata stripping on fixture JPEG and PNG files (the pixels unchanged byte for byte), sniffing rejects a renamed file, a decompression bomb is refused, the budget (reads, megabytes, the guard's third line).
- **Import:** a Word fixture with a diagram between a stem and its options (clear), after the options (check) and before question 1 (unassigned); EMF reported; a PDF fixture with embedded images (clear and check) and a vector figure (snapshot); a **Google Forms profile** fixture (header and footer dropped, unlettered options, points from the line, the key-entry step); the review step cannot continue until every image is decided; Markdown data picture accepted, web picture ignored with a note.
- **Source pins:** no `<img>` without `draggable="false"` in the exam screens, the image view uses the shared dialog, the packs are loaded only through `examContent.ts`, nothing reads a pack outside the attempt-first path, the canvas and `fflate` image code is a lazy chunk.
- **Rules (emulator):** section 10.
- **End to end (QA institution):** `e2e/20-exam-integrity.spec.ts`: a student opens a second page and brings it to the front (the exam page becomes hidden), returns, the teacher sees the leave with its time and duration, and the grade keeps the timeline after Finalize; `e2e/21-exam-images.spec.ts`: a teacher adds a picture, saves, publishes; a student starts, sees and zooms it; a student cannot read the packs before starting; the duplicate has the picture; the delete cascade removes the packs.
- **Manual:** a real phone for the zoom, the notification shade and the app-switch cases; a heavy exam (every question with a diagram) for the megabytes line; the same Google Forms printout through the import.

## 14. Free-tier summary

- **Writes:** unchanged per student; at Save, one write per changed pack (a few); the activity log rides on the existing checkpoint (at most one optional extra write per attempt, section 15); the grade gains a small summary written in the grading batch that already exists.
- **Reads:** `+ packs × 2` per student (section 7); the form note and the guard show it. No new query.
- **Downloads:** the packs' bytes per student, the new constraint (section 7); the guard's megabytes line.
- **Storage:** section 7. The log adds at most a few KB to an attempt and a few hundred bytes to a grade.
- **Indexes and collections:** none new (section 10).

## 15. Open questions

**Settled:** the pack size is 900,000 characters and the per-image cap 450 KB / 600,000 characters (two 300 KB pictures share a pack); pictures are reduced past 1600 px; the daily download budget is 2,048 MiB; SVG and GIF stay refused (a picture is a PNG, JPEG or WebP); fullscreen is asked for in the Start click with a "Return to fullscreen" button; the watermark is the name and the first six characters of the account id; forward only means the next question only; the extra checkpoint after a leave of 30 seconds or more is off (a leave is saved at the next regular checkpoint, and an open leave carries its time so far, so no extra write is spent); one query for all packs under one rule lookup is not relied on (a student reads a pack by its id with an attempt in progress, and the staff already read the packs with one range query).

**Provisional:** the Review thresholds of section 9.4 and the fast-answer cut-off are proposals, to be tuned with real sittings; each is a constant in one place.

**Deferred:** the similarity hint (section 9.4), the optional second-tab detection and question pools. None is wanted now; each needs its own short specification before any code.

## 16. Interaction with existing logic

| Existing piece                                                                        | How the feature touches it                                                                                                                     |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `trackAway`, `useRunningAttempt` (visibility, blur and focus listeners)               | The boolean becomes a state machine; the count it produces stays the same, so the existing counter, the rules and the grade copy keep working. |
| `examAttemptLogic` (checkpoint fields, merge with the backup), `examAnswerDraft`      | New fields in the checkpoint and in the backup (validated on read), merged by union.                                                           |
| `examAttemptSession` (start, checkpoint, submit, the 12-second write limit)           | Writes the new fields with the checkpoint; the packs are read after the questions with the same retry.                                         |
| The server-clock offset (`.info/serverTimeOffset`, `examClock`)                       | `t` is seconds since the server-based start; with no offset the device clock is used, as for the countdown.                                    |
| `useKeepAliveWhileOpen`, the inactivity logout                                        | Unchanged; a leave is not inactivity.                                                                                                          |
| The single-session lock (`sessionLock`, per-tab `sessionStorage` id)                  | Unchanged; a second tab has no sign-in (auth is per tab), which is why second-tab detection is optional and weak.                              |
| `examContent` (load, transaction save, copy), `examDuplicate`                         | Packs written first in size-limited commits; revisions of questions, key and packs checked together.                                           |
| `examDelete`, `examDeleteLogic` (`EXAM_FIXED_DOCUMENTS`), teardown and count scripts  | List the `content` collection instead of two fixed documents.                                                                                  |
| `examBudget`, `examDayBudget`, `examDayLoad`, the form note                           | Image reads and megabytes added; the guard gets a third budget.                                                                                |
| `examGradingLogic`, `examResultsData`, `examResultsRows`, `ResultsTable`, the CSV     | The Integrity column, the summary on the grade, the timeline.                                                                                  |
| `docxText`, `examDocx`, `examPdf`, `pdfLines`, `examDocumentText`, `ExamImportDialog` | Pictures and the Google Forms profile; a review step and a key-entry step.                                                                     |
| `imageUpload` (`sniffImageType`), `documentUpload`                                    | Sniffing reused; the canvas re-encode is not (lossless first).                                                                                 |
| The CSP and the bundle-boundary tests (`examImportBundle.test.ts`)                    | `img-src data:` already allows the pictures; the new modules are lazy chunks and are pinned; no network address in any reader.                 |
| `firestore.rules`, `rules-tests/`                                                     | Section 10.                                                                                                                                    |
| The audit log (`exam_edit`)                                                           | The save's detail names images added and removed; no new event type.                                                                           |
| The e2e specs, the seed and QA fixtures                                               | New specs 20 and 21; an exam with a picture in the QA seed.                                                                                    |

## 17. Documentation to create or update

- **This spec** and a one-line cross-reference plus §9 and §15 notes in `EXAMS_FEATURE_SPEC.md`.
- **`docs/guides/USER_GUIDE.md`:** the teacher's sections (adding, replacing and removing a picture, the review step, the report and what it can and cannot show, the presets) and the student's (the notice, zoom).
- **`docs/ISSUES_AND_GAPS.md`:** #73 "One attempt open in two tabs" updated; new entries for the client-attested log (section 9.6), the image size limit enforced by the client, the read and megabyte cost of images, and the printout profile's limits.
- **`docs/firebase/firebase-rules.md`:** the new pack, exam, attempt and grade rules.
- **`docs/compliance/PRIVACY_NOTICE.md`** and **`COMPLIANCE_REVIEW.md`:** what the exam records, who sees it, how long.
- **`scripts/README.md`** and the bulk-seed spec: the teardown and count of packs.
- **`README.md`:** the feature list.
- **In-code comments:** a header on every new module (what it does, its limits, what it cannot detect, the spec section), on the state machine of the activity log, and on every rules function added; source-pin tests keep the important ones in place.
