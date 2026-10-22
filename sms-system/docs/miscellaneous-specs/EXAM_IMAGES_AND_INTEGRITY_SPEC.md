# Exam Images and Exam Integrity: Specification

> **Status:** Planned (no code yet). Follows `EXAMS_FEATURE_SPEC.md` (the online exams that are built and merged).
> **Feature:** Lets a teacher or administrator add an optional **image to a question** (a diagram, a photo, a chart), by uploading it in the builder or by importing it from a Word or PDF paper, and gives each online exam an **integrity preset** (Supervised or Unsupervised) that records what a student does during the sitting, shows the teacher a summary, and applies a few honest deterrents.
> **Constraints that shape everything:** the Firebase **Spark** plan (no Cloud Functions, no Storage, no backend that sees a request), one Firestore document at most 1 MiB, and an app that runs entirely in the student's own browser.

---

## 1. Why, and what the reference papers show

Two existing papers written in Google Forms and printed to PDF (a 30-question and a 25-question multiple-choice test for a mechanical workshop course) are the model for what teachers already have:

- Every question is **single-answer**, 4 options, 1 point.
- **14 of the 30** questions in the first paper (and several in the second) carry **one diagram** each: "Identify the tool shown in the diagram", "The numbered part labelled 1 is called?".
- The picture belongs to the **question text**: it sits between the question and its options. **No option is an image.**
- A page of such a paper is a form export: a question number, "1 point", "Mark only one oval", the options, and a header and footer on every page.

So the first version supports **one optional image per question, in the question text**. A paper with no pictures is unaffected.

## 2. Decisions

| #   | Decision                | Choice                                                                                                                                                                                                                  | Why                                                                                                                                                              |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scope                   | One **optional** image per question, in the question text. Options stay text. Several images per question and option images are later, if ever.                                                                          | It is what the reference papers need; every extra shape multiplies the builder, the import and the cost.                                                         |
| 2   | Where images are stored | **Firestore image packs** under the exam (`exams/{examId}/content/images_{n}`), each holding several images as data URLs, packed by size to stay under about 800 KB. The question holds only a small reference.       | See section 4. Not inline in the questions document, not the Realtime Database, not Firebase Storage.                                                            |
| 3   | Quality                 | **Lossless first**; a visually lossless fallback only when an image does not fit; a per-image report in the builder.                                                                                                     | The owner wants as much quality as possible; the free tier and the 1 MiB document make "always lossless" impossible at 100 images (section 5).                     |
| 4   | Sources                 | Upload, drop or paste in the builder; Word import; PDF import; Markdown (embedded data only).                                                                                                                            | Teachers have papers already; typing them again is the barrier.                                                                                                   |
| 5   | Import matching         | A picture directly between a question's text and its first option is **clear** and attached; every other picture is attached by position and marked **check**. Every image, clear or not, goes through a **review step**.  | A silent wrong match puts a diagram on the wrong question, which is worse than no diagram.                                                                       |
| 6   | Vector figures in a PDF | A **page-region snapshot** tool in the review step.                                                                                                                                                                     | A drawn figure is not a picture, so nothing can be extracted; the snapshot is also the fallback for anything missed.                                              |
| 7   | Budget                  | The form note and the publish guard count the **extra reads and the downloaded megabytes** of the images.                                                                                                                | The exam budgets are 10,000 reads and writes a day; images are the first thing that can make a sitting expensive in bytes.                                         |
| 8   | Integrity               | Two presets on the Online exam section, **Supervised** and **Unsupervised**. Measures **record and show the teacher; nothing blocks the student** and nothing is penalised automatically.                              | The same school sits some papers in a supervised lab and some at home; a notification, a dropped connection or a laptop update looks like cheating.            |
| 9   | Honesty                 | Everything runs in the student's browser, so it can be bypassed. The spec lists what is **not** realistic (section 9.6) so no one promises it.                                                                          | A promise the software cannot keep is worse than a limit that is stated.                                                                                         |

## 3. Data model

### 3.1 The question

`ExamQuestion` (in `src/types/exams.ts`) gains one optional field. Nothing is stored in the question except a reference:

```ts
export type ExamQuestionImage = {
  id: string;      // the key inside its pack
  w: number;       // pixels, so the screen can reserve the space and avoid a jump
  h: number;
  bytes: number;   // size as stored (for the budget and the builder's report)
  exact: boolean;  // the pixels are the original's (see section 5)
  alt: string;     // optional text for screen readers; empty when "decorative" is ticked
  decorative?: boolean;
};
export type ExamQuestion = { id; text; kind; options; points; image?: ExamQuestionImage };
```

The questions document stays text-only, so it keeps well under 1 MiB at 100 questions and the student's first read stays small.

### 3.2 The image packs

`exams/{examId}/content/images_{n}` (n = 1, 2, 3 …), one document per pack:

```ts
{ revision: number; updatedAt: Timestamp; images: Record<string, { mime: 'image/png'|'image/jpeg'|'image/webp'; data: string /* data URL */ }> }
```

- Packs are built by a pure function (`packImages`) in question order, filling a pack up to about 800,000 characters, so one pack holds many small diagrams and one large photo fills a pack by itself. A single image can never exceed the cap in section 5.
- A pack is rewritten only when one of its images changed. Unchanged packs are not touched, so a save that edits text costs no image writes.
- Why packs and not one document per image: a student who opens the paper reads **every pack**, and each document read costs one read plus one rule read (the attempt check). Fourteen 60 KB diagrams are **one pack = two reads**, instead of **28 reads** with a document each.

### 3.3 Where each piece is used

| Piece                         | Reads the packs?                  | Notes                                                                                           |
| ----------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| Builder                       | Yes (staff)                       | Loads the packs with the questions; shows each image and its report.                            |
| Preview as student            | Yes (staff)                       | Same display as a student.                                                                      |
| Student attempt               | Yes, after the attempt exists     | Right after the questions, in parallel, with the same retry as the questions.                   |
| Duplicate exam                | Yes (staff), then writes copies   | `copyExamContent` copies the packs after the questions.                                         |
| Delete exam                   | Deletes                           | `deleteExamCascade` and the bulk-seed teardown and count scripts include `content/images_*`.    |
| Results and Finalize          | No                                | Finalize deletes attempts; the questions and packs stay with the exam.                          |
| Parent                        | Never                             | Same as the questions.                                                                          |

## 4. Why Firestore packs

| Option                                       | Verdict | Reason                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline in `content/questions`                | No      | 100 questions with a diagram each breaks the 1 MiB limit, and every read of the text would download every picture.                                                                                                                      |
| The Realtime Database blob store             | No      | Its rules have no tenant or role check (`docs/ISSUES_AND_GAPS.md` #65): any signed-in user of any institution can read a blob. The paper's pictures would be readable before the exam starts, undoing the rule that a student reads the questions only with their own attempt in progress. It also shares the 100-connection limit. |
| Firebase Storage                             | No (for now) | Needs the Blaze plan, which this project does not use. If the school moves to Blaze, packs can move to Storage with a rule that reads the attempt; the question's reference does not change.                                       |
| **Firestore packs under `content/`**         | **Yes** | The same document path style, the same rules as the questions (the attempt-first read, the write lock), no new service, and a read cost the budget can estimate.                                                                         |

Consequence to state plainly: a picture is **readable only by someone who may read the questions**, so it cannot be fetched before the clock starts or after the attempt is handed in.

## 5. The image pipeline (lossless first)

All in the browser, before anything is written; a new `src/lib/examImage.ts` (pure parts) with a small canvas part, reusing the magic-byte sniffing of `imageUpload.ts` (`sniffImageType`).

1. **Accept** PNG, JPEG, WebP and GIF (a still frame) up to 10 MB source; reject anything whose bytes do not match; reject SVG and EMF/WMF (scripts and unsupported); decode with `createImageBitmap` to read the real width and height (and reject more than about 24 megapixels, a decompression-bomb guard).
2. **Per image, in this order, stop at the first that fits the cap of about 450 KB:**
   1. **Keep the pixels exactly:** for a JPEG, remove the metadata segments (EXIF, GPS, comments) **without re-encoding**; for a PNG, drop the ancillary chunks (text, time, GPS) and keep the image data; PNG data can be re-packed losslessly. `exact = true`.
   2. **Re-encode losslessly as PNG** from the decoded pixels (smaller than the original for some sources, for example a PNG with a heavy palette or a lossless re-pack of a screenshot). `exact = true`.
   3. **Visually lossless:** only when the image is over the cap, re-encode as WebP (or JPEG where WebP is not available) at the **highest quality that fits**, stepping down in small increments, and **downscale only beyond 1600 px on the long side**. `exact = false`.
3. **Report** in the builder for every image: pixels, size, and "kept exactly" or "reduced (quality 92, resized to 1600 px)". A teacher who sees "reduced" can crop or simplify the figure and add it again.
4. **Cap check:** the stored data URL of one image is never over about 600,000 characters, so one image always fits one pack document (under 1 MiB with its siblings and the document overhead).

What this does not promise: **true lossless for every picture at any size**. Canvas cannot write lossless WebP, a photograph is large losslessly, and the free tier has a ceiling (section 7). Line drawings and diagrams, which is what the reference papers hold, normally fit exactly.

## 6. Builder and student screens

### 6.1 Builder (question editor)

- Under the question text: **Add image** (button, drop and paste from the clipboard). An image shows as a preview with its report line, **Replace**, **Remove**, and an **Alt text** field with a **Decorative** tick. Alt text is optional; a hint says what it is for.
- Preview and **Preview as student** show the same picture at the same size.
- Removing or replacing marks its pack to be rewritten; nothing is written until **Save** (as for every builder change).
- Validation: an image never blocks publishing; a question may have text only, an image only is **not** allowed (the text is still required), so the paper reads correctly where the image cannot load.

### 6.2 Student screen

- The image is shown below the question text, at its natural size up to the width of the card, with the **reserved aspect ratio** (`w` and `h`) so the page does not jump when it appears.
- **Click or tap to zoom** (a dialog on the shared `DialogShell`, pinch and scroll on a phone), because diagrams with numbered parts must be readable on a small screen.
- Plain `<img>` from the data URL (the CSP already allows `data:`); `alt` from the question; `draggable="false"`; no object URLs to leak.
- If a pack fails to load, the question shows its text and "The picture could not be loaded. Reload the page to try again." and the same three-try policy as the questions applies.

## 7. Budget (reads, megabytes)

Today a student costs about 25 reads and 8 to 9 writes (`EXAMS_FEATURE_SPEC.md` section 9). Images add:

- **Reads per student:** `packs × 2` (the pack and the rule read of the attempt). 14 diagrams in one pack add 2 reads; 100 images of 300 KB each fill 40 packs and add 80 reads (more than three times today's 25). `estimateExamWrites` (`src/lib/examBudget.ts`) takes the image bytes and returns reads including packs.
- **Download per student:** the sum of the packs' bytes, which can reach 10 to 30 MB at the cap, against Spark's roughly 10 GiB of Firestore downloads a month. A school of 1,250 students sitting an exam with 20 MB of images would use about 25 GiB, so **the megabytes matter more than the reads**.
- **The form note** adds "plus about N MB downloaded per student" next to the writes and reads.
- **The publish guard** (`examDayBudget.ts`, `examDayLoad.ts`) adds a **megabytes line** for the day (a soft budget of about 2 GiB a day, about a fifth of the monthly allowance, in `examBudget.ts`) beside the 10,000 reads and 10,000 writes. A teacher over any of the three is refused with the totals; an administrator may "Publish anyway", exactly as today. It stays an **estimate**, not a meter.
- Builder-time cost of adding images: one write per changed pack at Save (a few writes, once).

## 8. Import

Import is best-effort and **always ends in review**. Pictures become part of the import result (`ImportedQuestion.image`) and carry a **confidence**: `clear` or `check`.

### 8.1 Word (.docx)

- `docxText.ts` already walks the document XML and counts drawings it skips. It learns to **resolve** them: each `w:drawing` (inline or anchored) holds an `a:blip` with an `r:embed` id; the document's relationships file maps it to `word/media/...`; `fflate` (already loaded lazily by the Word reader) opens the file.
- A picture becomes a marker in the paragraph stream, in order, so the parser sees it **after the question's text and before the first option**: `clear`. A picture before the first question, after an answer line, or in a table or text box: `check`, or not found (text boxes and shapes stay unsupported and reported).
- EMF and WMF pictures cannot be decoded by a browser: reported as "unsupported picture format, save it as PNG or JPEG". A crop applied in Word (`a:srcRect`) is not applied; a note says the whole original is used.

### 8.2 PDF

- `examPdf.ts` already reads text with pdf.js (legacy build). It also reads the page's **operator list**: each painted image with its transform gives a position, and pdf.js hands back the decoded pixels, which become a **lossless PNG**.
- The position is compared with the **text lines of the same page** (`pdfLines.ts` groups pieces into baselines): a picture whose vertical position lies between a question's last text line and its first option line is `clear`; any other position is attached to the nearest question above and marked `check`; a picture with no question above it is **unassigned**.
- **Vector figures** (shapes, not pictures) cannot be extracted. The review step offers a **snapshot**: the page is rendered by pdf.js at 2x into a canvas, the teacher drags a box around the figure, and the box is saved as a PNG. This is also the fix for any picture the import missed.
- A JPEG inside a PDF is decoded by pdf.js, so the extracted PNG can be larger than the original; the pipeline's cap and fallback apply as for any image.

### 8.3 Markdown and the spreadsheet templates

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

## 9. Integrity

### 9.1 What the app already does

The paper is readable only after the clock starts (the attempt-first rule); the answer key never reaches a student's browser; each student gets their own order of questions and options (`seed`); the deadline comes from the server's clock; one session per account (the Realtime Database lock); a **tab-leave counter** on the attempt, shown to the teacher.

### 9.2 The two presets

One dropdown on the **Online exam** section of the exam form, saved on the exam as `integrity: 'supervised' | 'unsupervised'` (default **supervised**, so every existing exam behaves as today). The form shows what each preset turns on.

| Measure                                              | Supervised | Unsupervised |
| ---------------------------------------------------- | :--------: | :----------: |
| Event log (section 9.3)                              |    yes     |     yes      |
| Teacher summary and "review" badge (section 9.4)     |    yes     |     yes      |
| Question deterrents (section 9.5)                    |    yes     |     yes      |
| What-is-recorded notice on the start screen          |    yes     |     yes      |
| Ask for fullscreen and record leaving it             |     no     |     yes      |
| Name and id watermark over the questions and images  |     no     |     yes      |
| Lower threshold for the "review" badge               |     no     |     yes      |
| Forward-only navigation (optional tick)              |     no     |     yes      |

**Nothing blocks the student and nothing is penalised by the software.** The measures give the teacher evidence and give a student a reason not to try.

### 9.3 The event log

The attempt keeps a short, capped list, written with the **existing checkpoint** (no extra writes):

```ts
events: { t: number /* seconds from the start */; k: 'leave'|'return'|'fs_exit'|'fs_unavailable'|'copy'|'cut'|'paste'|'print'|'menu'; d?: number /* seconds away, on 'return' */ }[]   // at most 200
```

- `tabSwitches` stays as it is (the count is the quick figure).
- The log is part of the attempt document (`firestore.rules` allows one more key, `events`, as a list of at most 200 entries; the entries themselves are not shape-checked because a rule cannot loop over a list, a limit recorded in `docs/ISSUES_AND_GAPS.md`, bounded by the 1 MiB document).
- It is merged with the local backup the same way the tab count is (it never shrinks), so a refresh or a second device does not lose it.
- **Privacy:** these are records about a (usually under-age) person's behaviour. The start screen says exactly what is recorded (in plain words), `docs/compliance` (privacy notice) names it, the data lives on the attempt and is removed with the attempts at Finalize; only a **summary** stays (9.4).

### 9.4 The teacher's view

- The results screen's tab-switch column becomes an **Integrity** column: the count, the **longest time away**, and a **Review** badge when a threshold is passed (Supervised: more than 5 leaves or more than 3 minutes away; Unsupervised: more than 2 leaves or more than 1 minute away; the numbers are constants in one file). A click opens the timeline (when, what, how long).
- The wording is **"Review"**, never "cheated". A phone call, a notification, a dropped connection and a laptop update look the same as a leave, so the badge is a prompt to look, not a verdict.
- **Before Finalize** (which deletes the attempts) the results screen computes a small **summary** per student and stores it on the grade (a few numbers: leaves, longest absence, answers per minute, the number of very fast answers) so the teacher can still see it afterwards.
- **A similarity hint** (optional, later): for each pair of students, the number of shared **wrong** answers on questions the class mostly got right; shown as "similar answers" for the pairs above a threshold. It runs in the teacher's browser on the attempts already read. It is a hint, never an accusation.

### 9.5 Question deterrents

On the paper, and on every image: no text selection, no copy or cut, no context menu (right click and long press), no drag of an image, and the paper is hidden when printing (`@media print`). Each attempt is **recorded** in the event log. These stop a casual copy only; a screenshot, developer tools or view-source bypass them. They also take away a convenience (translating a word, using a screen reader's copy), so **screen-reader text and keyboard operation are never removed**, and a teacher can still preview the paper without them.

### 9.6 What is not realistic (and the spec says so)

| Wish                                              | Why it cannot be done here                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop screenshots or a phone photographing the screen | The device and the camera are outside the browser; the watermark only makes a leaked photo traceable.                                                     |
| Detect a second device, a helper in the room, or a phone under the desk | Nothing in the browser can see it. This is what supervision is for.                                                                                  |
| A lockdown or kiosk browser                       | Needs an installed app (Safe Exam Browser) **and a server that verifies it**; this project has no backend.                                                  |
| Webcam or AI proctoring                           | Cost, bandwidth, privacy for minors under the Data Protection Act, and no backend to process video.                                                           |
| Restrict by IP address or location                | No server sees the request's address; Firestore rules cannot read it.                                                                                         |
| Block developer tools or the keyboard shortcuts   | The student controls the browser; anything blocked on the page is bypassed one layer down.                                                                    |
| Prove who is at the keyboard                      | An account can be shared; the single-session lock only stops two sign-ins at once.                                                                            |
| Force fullscreen on every device                  | iPhone Safari has no Fullscreen API for pages; it is recorded as "unavailable", never as an exit.                                                             |

### 9.7 Stronger ideas, later

- **Question pools:** the teacher builds a bank of M questions and each student gets N of them, chosen from the existing `seed`. It is the strongest measure against sharing answers. It changes the builder, the scoring (the maximum points differ per student), the statistics and the answer-key view, so it is **Phase 5**, optional.
- **Per-question time limits and forward-only navigation:** reduce answer sharing, at a real cost in fairness; the forward-only tick is offered, the timer is not.

## 10. Rules

- **Image packs:** `match /institutions/{institutionId}/exams/{examId}/content/{pack}` for ids that start with `images_`: read when the person may read the questions (`canReadAdminData()` or `examStaffOf` or `examOpenToStudent` and `examAttemptInProgress`); create, update by `examStaffMay` while `examQuestionsEditable`; delete by `examStaffMay`. Shape: keys `revision`, `updatedAt`, `images` only; `images` is a map of at most 100 entries; `updatedAt == request.time`. The size of one image is enforced by the client and bounded by the 1 MiB document limit (a rule cannot measure map values), as answer values are today (`docs/ISSUES_AND_GAPS.md` #73).
- **The question's `image` reference:** `isValidExamQuestions` already caps the number of items; the `image` shape inside an item is not checked by the rule (a rule cannot loop over a list). A malformed reference only shows a broken picture to the writer, a staff member.
- **The exam:** `integrity` is an optional string that must be `supervised` or `unsupervised` (`isValidOnlineExam`).
- **The attempt:** one more optional key, `events`, a list of at most 200 entries, writable by the owner while `in_progress`, like `answers` and `flags`.
- **Emulator cases** (added to `rules-tests/`): a teacher of the exam writes a pack in the draft and before opening, not after; another teacher, a student and a parent cannot write one; a student reads a pack only with their own attempt in progress, not before the start, after the submit or for a class they are not in; a parent never; the `integrity` values; the `events` list size.
- **Deploy order:** the rules are additive and backward compatible, so deploy them **before** the app (`npm run firebase:deploy:rules`). The `events` key (Phase 4) can be allowed in the same deploy as the packs (Phase 1) so only one rules deploy is needed for the whole feature.

## 11. Files that change

| Area                | Files                                                                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types               | `src/types/exams.ts` (`ExamQuestionImage`, `integrity`, `events`)                                                                                                                                                       |
| Image pipeline      | new `src/lib/examImage.ts`, `examImagePack.ts` (pure: packing, sizes, report), `examImageCanvas.ts` (decode and re-encode, lazy)                                                                                         |
| Content             | `src/lib/examContent.ts` (`loadExamContent`, `saveExamContent`, `copyExamContent`), `examBuilderLogic.ts` (the question list keeps an image), `examDuplicate.ts`                                                         |
| Builder             | `components/exam/builder/QuestionEditor` (Add image, report, alt text), `hooks/useExamBuilder.ts`                                                                                                                        |
| Student and preview | `components/exam/take/StudentQuestionView.tsx`, a new image view with zoom, `hooks/useExamAttempt.ts` and `examAttemptSession.ts` (load the packs after the questions), `hooks/useExamPreview.ts`                         |
| Import              | `docxText.ts`, `examDocx.ts`, `examPdf.ts`, `pdfLines.ts`, `examDocumentText.ts`, `examImportKinds.ts`, `examImportRead.ts`, a new image review step in `ExamImportDialog.tsx`, `examMarkdown.ts`                         |
| Budget              | `examBudget.ts`, `examDayBudget.ts`, `examDayLoad.ts`, `components/forms/exam/OnlineExamFields.tsx`                                                                                                                      |
| Cascade and scripts | `examDelete.ts`, `scripts/teardown-bulk-institution.mjs`, `scripts/count-seed-institution.mjs`                                                                                                                           |
| Integrity           | `useRunningAttempt.ts`, `examAttemptLogic.ts` (the log, merged with the backup), `components/exam/take/*` (watermark, deterrents, fullscreen), results screen (Integrity column, timeline), `examGradingLogic.ts` (the summary stored on the grade) |
| Rules and tests     | `firestore.rules`, `rules-tests/examImages.rules.test.ts`, `examIntegrity.rules.test.ts`, new unit tests per module, `e2e/20-exam-images.spec.ts`                                                                       |
| Docs                | this spec, `EXAMS_FEATURE_SPEC.md` (one cross-reference), `docs/guides/USER_GUIDE.md`, `docs/ISSUES_AND_GAPS.md`, `docs/compliance` (the privacy notice's list of what is recorded)                                       |

## 12. Phases

Each phase is a separate group of commits, each commit verified on its own staged tree (type-check, lint, the whole test suite), the rules by the emulator suite, and a run against the QA institution, as for the exams feature.

| Phase | Content                                                                                                                                                                                                                               | Needs a rules deploy | Value                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------: | -------------------------------------------------------------- |
| P1    | Data model, rules, the image pipeline, the builder (Add, Replace, Remove, alt text, report), the student and preview display with zoom, duplicate, delete cascade and scripts, the budget lines. Optional everywhere.                    |         yes          | A teacher can put a diagram on a question and a student sees it. |
| P2    | Word import of pictures, the **review step**, the template notes.                                                                                                                                                                      |          no          | Existing Word papers come with their diagrams.                 |
| P3    | PDF import of pictures, the position matching, the **page-region snapshot** (vector figures, missed pictures), Markdown data pictures.                                                                                                 |          no          | Papers like the references (Google Forms PDFs) can be imported. |
| P4    | The integrity presets: the `integrity` field and the form, the event log and its merge, the Integrity column and timeline, the summary stored at grading, the deterrents, the watermark, fullscreen, the start-screen notice, the privacy notice. |   yes (or with P1)   | The teacher sees what happened; deterrence for home sittings.  |
| P5    | Optional: question pools; the pair similarity hint.                                                                                                                                                                                    |      maybe           | The strongest protection against shared answers.              |

Order: **P1, P2, P3, then P4**; P4 is independent of the images and may move earlier if the school has an at-home sitting first. If the rules for the `events` key are written in P1, a single rules deploy serves P1 and P4.

## 13. Tests

- **Pure units:** packing (fills a pack, a large image alone, order stable, unchanged packs reused), the pipeline's choice (cleaned original kept, PNG re-pack, fallback quality steps, the downscale threshold, the cap), the metadata stripping on fixture JPEG and PNG files with EXIF and text chunks (the pixels are unchanged byte for byte), sniffing rejects a renamed file, a decompression bomb is refused, the budget (reads, megabytes, the guard's third line), the integrity thresholds, the merge of the event log.
- **Import:** a Word fixture with a diagram between a stem and its options (clear), after the options (check) and before question 1 (unassigned); EMF reported; a PDF fixture with embedded images (clear and check) and a vector figure (snapshot); the review step cannot continue until every image is decided; Markdown data picture accepted, web picture ignored with a note.
- **Source pins:** no `<img>` without `draggable="false"` in the exam screens, the image view uses the shared dialog, the packs are loaded only through `examContent.ts`, nothing reads a pack outside the attempt-first path.
- **Rules (emulator):** section 10.
- **End to end (`e2e/20-exam-images.spec.ts`, QA institution):** a teacher adds a picture, saves, publishes; a student starts, sees and zooms it; a student cannot read the packs before starting; the duplicate has the picture; the delete cascade removes the packs; a Supervised sitting records a tab leave in the log and the teacher sees the timeline.
- **Manual:** a real phone for the zoom and the fullscreen limits; a heavy exam (every question with a diagram) for the megabytes line.

## 14. Free-tier summary

- **Writes:** unchanged per student; at Save, one write per changed pack (a few); the event log rides on the existing checkpoint.
- **Reads:** `+ packs × 2` per student (section 7); the form note and the guard show it.
- **Downloads:** the packs' bytes per student, the new constraint (section 7); the guard's megabytes line.
- **Storage:** 14 diagrams of about 60 KB are under 1 MB per exam; 100 images at the cap are about 30 to 45 MB per exam against Spark's 1 GiB of Firestore storage, so very image-heavy papers should be deleted when finished.

## 15. Open questions

- The exact numbers: the pack size (about 800,000 characters), the per-image cap (about 450 KB), the 1600 px downscale limit, the Review thresholds, the 2 GiB a day soft budget. They are constants in one file each and are settled with a first real paper (a QA exam with a diagram on every question).
- Whether the similarity hint (9.4) is wanted, given the care a "similar answers" label needs.
- Whether a school on the Blaze plan should move the packs to Firebase Storage (a later change behind the same question reference).
