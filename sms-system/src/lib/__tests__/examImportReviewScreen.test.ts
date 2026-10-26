import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ImportImageReview from '../../components/exam/builder/ImportImageReview';
import ExamImportDialog from '../../components/exam/builder/ExamImportDialog';
import dialogRaw from '../../components/exam/builder/ExamImportDialog.tsx?raw';
import pageRaw from '../../scenes/(dashboard)/list/exams/build/index.tsx?raw';
import hookRaw from '../../hooks/useExamBuilder.ts?raw';
import type { PreparedImage } from '../examBuilderLogic';
import type { ImportImage, ImportPicture } from '../examImportPictures';
import { applyPrepared, keepAllClear, keepItem, moveItem, startReview, type ReviewItem } from '../examImportReview';

// The picture step of the Word import as it renders, and the pins that keep the picture code out of the other import paths.

const norm = (s: string) => s.split('\r\n').join('\n');
const dialog = norm(dialogRaw);
const page = norm(pageRaw);
const hook = norm(hookRaw);
const noop = () => undefined;

const bytes = new Uint8Array([1]);
const pic = (over: Partial<ImportPicture> = {}): ImportPicture => ({ bytes, format: 'png', alt: 'A vice on a bench', cropped: false, ...over });
const prepared = (data: string): PreparedImage => ({ mime: 'image/png', data: `data:image/png;base64,${data}`, bytes: 100, w: 40, h: 30, exact: true, report: '1 KB, kept exactly' });
const images: ImportImage[] = [
  { index: 0, questionIndex: 0, confidence: 'clear' },
  { index: 1, questionIndex: 1, confidence: 'check' },
  { index: 2, questionIndex: null, confidence: 'unassigned' },
];
const questions = [{ text: 'Which tool is this?' }, { text: 'Which is stronger?' }];

const checked = (pictures: ImportPicture[] = [pic(), pic(), pic()]): ReviewItem[] =>
  images.reduce((list, image) => applyPrepared(list, image.index, { ok: true, picture: prepared(`P${image.index}`) }), startReview(images, pictures));

const screen = (items: readonly ReviewItem[]) =>
  renderToStaticMarkup(
    createElement(ImportImageReview, { items, questions, onUse: noop, onMove: noop, onRemove: noop, onUseAllClear: noop, onBack: noop, onContinue: noop }),
  );

describe('the picture step', () => {
  it('shows each picture with its badge, its question, its report, and Use, Remove and a picker to move it', () => {
    const html = screen(checked());
    expect(html).toContain('The file has 3 pictures');
    for (const badge of ['Clear', 'Check', 'No question']) expect(html).toContain(badge);
    expect(html).toContain('Question 1: Which tool is this?');
    expect(html).toContain('Question 2: Which is stronger?');
    expect(html).toContain('1 KB, kept exactly');
    expect(html).toContain('src="data:image/png;base64,P0"');
    expect(html).toContain('alt="A vice on a bench"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('Move picture 3 to a question');
    expect(html).toContain('Move to a question…');
    expect(html.match(/>Use</g)).toHaveLength(3);
    expect(html.match(/>Remove</g)).toHaveLength(3);
  });

  it('says a picture on no question will not be imported, and a pending one needs a decision', () => {
    const html = screen(checked());
    expect(html).toContain('Not on a question. It will not be imported unless you move it to one.');
    expect(html).toContain('Needs a decision.');
    expect(html).toContain('2 still need a decision.');
  });

  it('holds Continue until the clear and check pictures are decided, and then lets it through', () => {
    const blocked = screen(checked());
    expect(blocked).toMatch(/<button[^>]*disabled[^>]*>Review in the builder/);
    const items = keepItem(keepAllClear(checked()), 1);
    const html = screen(items);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Review in the builder/);
    expect(html).toContain('2 will be used, 1 will not be imported.');
  });

  it('names a question with two pictures used on it and holds Continue', () => {
    const items = moveItem(keepAllClear(checked()), 1, 0);
    const html = screen(items);
    expect(html.match(/Another picture is also used for this question\. Remove or move one\./g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Review in the builder/);
  });

  it('shows a refusal in words, without Use or Move for it', () => {
    const html = screen(startReview(images, [pic({ problem: 'unsupported', bytes: null }), pic(), pic()]));
    expect(html).toContain('This picture is in a format that cannot be imported (EMF or WMF). Save it as PNG or JPEG in Word.');
    expect(html).toContain('Not shown');
  });

  it('shows the progress while the pictures are being checked, and holds Continue and the shortcut', () => {
    const html = screen(startReview(images, [pic(), pic(), pic()]));
    expect(html).toContain('Preparing pictures 0 of 3…');
    expect(html).toContain('Preparing…');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Use all clear ones/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Review in the builder/);
  });
});

describe('the dialog', () => {
  it('starts on the file step, with the same buttons as before', () => {
    const html = renderToStaticMarkup(createElement(ExamImportDialog, { answerMode: 'both', existingCount: 0, onApply: noop, onClose: noop }));
    expect(html).toContain('Import questions from a file');
    expect(html).toContain('Review in the builder');
    expect(html).not.toContain('Pictures in the file');
  });

  it('loads the picture code only when the step opens, keeps the work stoppable and hands the chosen pictures on', () => {
    expect(dialog).toContain('await import("@/lib/examImageCanvas")');
    expect(dialog).not.toMatch(/^import [^\n]* from ["']@\/lib\/examImageCanvas/m);
    expect(dialog).toContain('() => mine !== checks.current');
    expect(dialog).toContain('onApply(needsKey ? applyKeys(result, choices) : result, existingCount > 0 ? mode : "replace", picturesChosen)');
    expect(dialog).toContain('finish(chosen(items))');
    expect(dialog).toContain('finish([])');
    expect(dialog).toContain('hasPictures ? "Review the pictures" : needsKey ? "Choose the answers" : "Review in the builder"');
    expect(dialog).toContain('max-w-4xl');
  });

  it('puts the chosen pictures on the surviving imported questions in one pass', () => {
    expect(page).toContain('picturesForMerged(result.questions, merged.questions, pictures)');
    expect(page).toContain('b.applyImported(merged.questions, placed)');
    expect(hook).toContain('addPictures(latest.current.packs, questions, pictures)');
    expect(hook).toContain('setPacks(next.packs);\n    setDraft(next.draft);');
  });
});
