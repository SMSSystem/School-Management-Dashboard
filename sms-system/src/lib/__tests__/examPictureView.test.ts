import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import QuestionImage from '../../components/exam/take/QuestionImage';
import PictureZoom from '../../components/exam/take/PictureZoom';
import StudentQuestionView from '../../components/exam/take/StudentQuestionView';
import dialogRaw from '../../components/DialogShell.tsx?raw';
import hookRaw from '../../hooks/useExamPictures.ts?raw';
import attemptHookRaw from '../../hooks/useExamAttempt.ts?raw';
import previewHookRaw from '../../hooks/useExamPreview.ts?raw';
import sessionRaw from '../examAttemptSession.ts?raw';
import takePageRaw from '../../scenes/(dashboard)/list/exams/take/index.tsx?raw';
import previewPageRaw from '../../scenes/(dashboard)/list/exams/preview/index.tsx?raw';
import previewScreenRaw from '../../components/exam/take/ExamPreviewScreen.tsx?raw';
import { isImageDataUrl, packOrder, pictureState, withRetries } from '../examPictureLoad';
import type { ExamQuestion, ExamQuestionImage } from '@/types/exams';

// A student sees a question's picture (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §6.2): the order the
// packs are read in, the retries, the three states of the picture, the zoom, and the pins that keep the reading in the
// background and by id.

const norm = (s: string) => s.split('\r\n').join('\n');
const dialog = norm(dialogRaw);
const hook = norm(hookRaw);
const attemptHook = norm(attemptHookRaw);
const previewHook = norm(previewHookRaw);
const session = norm(sessionRaw);
const takePage = norm(takePageRaw);
const previewPage = norm(previewPageRaw) + norm(previewScreenRaw);
const noop = () => undefined;

const image = (pack: number, id = 'i1', over: Partial<ExamQuestionImage> = {}): ExamQuestionImage => ({
  id,
  pack,
  w: 400,
  h: 200,
  bytes: 1000,
  exact: true,
  alt: 'A vice on a bench',
  ...over,
});
const q = (id: string, img?: ExamQuestionImage): ExamQuestion => ({
  id,
  text: `Text of ${id}`,
  kind: 'single',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ],
  points: 1,
  ...(img && { image: img }),
});

describe('the order the packs are read in', () => {
  const list = [q('q1', image(1)), q('q2'), q('q3', image(2)), q('q4', image(1, 'i2')), q('q5', image(3))];

  it('puts the pack of the question on screen first, then the questions after it, then those before', () => {
    expect(packOrder(list, 0)).toEqual([1, 2, 3]);
    expect(packOrder(list, 2)).toEqual([2, 1, 3]);
    expect(packOrder(list, 4)).toEqual([3, 1, 2]);
  });

  it('names each pack once, and none without pictures', () => {
    expect(packOrder([q('a'), q('b')], 0)).toEqual([]);
    expect(packOrder([], 0)).toEqual([]);
    expect(packOrder([q('a', image(5)), q('b', image(5, 'i2'))], 1)).toEqual([5]);
  });

  it('keeps a current index outside the list inside it', () => {
    expect(packOrder(list, 99)).toEqual([3, 1, 2]);
    expect(packOrder(list, -3)).toEqual([1, 2, 3]);
  });
});

describe('the state of a picture', () => {
  const loaded = { 1: { i1: { mime: 'image/png', data: 'data:x' } } };

  it('is ready when its pack holds it, failed when its pack failed or lacks it, loading otherwise', () => {
    expect(pictureState({ pack: 1, id: 'i1' }, loaded, [])).toBe('ready');
    expect(pictureState({ pack: 1, id: 'gone' }, loaded, [])).toBe('failed');
    expect(pictureState({ pack: 2, id: 'i1' }, loaded, [2])).toBe('failed');
    expect(pictureState({ pack: 2, id: 'i1' }, loaded, [])).toBe('loading');
  });
});

describe('withRetries', () => {
  const noWait = async () => undefined;

  it('returns the first answer and tries again after a failure, pausing between', async () => {
    let calls = 0;
    const pauses: number[] = [];
    const result = await withRetries(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('offline');
        return 'ok';
      },
      3,
      1500,
      async (ms) => {
        pauses.push(ms);
      },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(pauses).toEqual([1500, 1500]);
  });

  it('throws the last error after the last try, without pausing after it', async () => {
    let calls = 0;
    const pauses: number[] = [];
    await expect(
      withRetries(
        async () => {
          calls += 1;
          throw new Error(`try ${calls}`);
        },
        3,
        10,
        async (ms) => {
          pauses.push(ms);
        },
      ),
    ).rejects.toThrow('try 3');
    expect(pauses).toHaveLength(2);
    await expect(withRetries(async () => 1, 1, 0, noWait)).resolves.toBe(1);
  });
});

describe('QuestionImage', () => {
  const render = (state: 'ready' | 'loading' | 'failed', src: string | undefined, img = image(1)) =>
    renderToStaticMarkup(createElement(QuestionImage, { image: img, state, src, onRetry: noop }));

  it('shows the picture on a button that enlarges it, with the alt text, the stored size and no dragging', () => {
    const html = render('ready', 'data:image/png;base64,AAAA');
    expect(html).toContain('aria-label="Enlarge picture"');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('alt="A vice on a bench"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('width="400"');
    expect(html).toContain('aspect-ratio:400 / 200');
  });

  it('has an empty alt when the picture is decorative', () => {
    expect(render('ready', 'data:x', image(1, 'i1', { decorative: true, alt: '' }))).toContain('alt=""');
  });

  it('reserves the space with the stored ratio and says it is loading', () => {
    const html = render('loading', undefined);
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading the picture…');
    expect(html).toContain('aspect-ratio:400 / 200');
    expect(html).not.toContain('<img');
  });

  it('says it could not be loaded, offers Try again and tells the student they can still answer', () => {
    const html = render('failed', undefined);
    expect(html).toContain('role="alert"');
    expect(html).toContain('The picture could not be loaded. You can still answer the question.');
    expect(html).toContain('Try again');
    expect(html).not.toContain('<img');
  });
});

describe('PictureZoom', () => {
  it('opens fitted, with a button to see the actual size', () => {
    const html = renderToStaticMarkup(createElement(PictureZoom, { image: image(1), src: 'data:image/png;base64,AAAA', onClose: noop }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('max-w-4xl');
    expect(html).toContain('Actual size');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('alt="A vice on a bench"');
    expect(html).toContain('touch-action:pan-x pan-y pinch-zoom');
  });
});

describe('StudentQuestionView with a picture', () => {
  const view = (question: ExamQuestion, picture?: { state: 'ready' | 'loading' | 'failed'; src: string | undefined; onRetry: () => void }) =>
    renderToStaticMarkup(
      createElement(StudentQuestionView, {
        question,
        number: 1,
        total: 3,
        chosen: [],
        flagged: false,
        onToggleOption: noop,
        onToggleFlag: noop,
        picture,
      }),
    );

  it('puts the picture between the question text and the instruction', () => {
    const html = view(q('q1', image(1)), { state: 'ready', src: 'data:image/png;base64,AAAA', onRetry: noop });
    const text = html.indexOf('Text of q1');
    const picture = html.indexOf('Enlarge picture');
    const instruction = html.indexOf('Choose one answer.');
    expect(text).toBeGreaterThan(-1);
    expect(picture).toBeGreaterThan(text);
    expect(instruction).toBeGreaterThan(picture);
  });

  it('shows no picture for a question without one, and the loading box when the state is not given', () => {
    expect(view(q('q1'))).not.toContain('Loading the picture');
    expect(view(q('q1', image(1)))).toContain('Loading the picture…');
  });
});

describe('pins', () => {
  it('the shared dialog keeps its width unless asked for a wide one', () => {
    expect(dialog).toContain('wide = false');
    expect(dialog).toContain('max-w-md');
  });

  it('a pack is read by its id with one document read, never listed, on the student path', () => {
    const load = session.slice(session.indexOf('export async function loadAttemptPack'), session.indexOf('export async function loadGrade'));
    expect(load).toContain("'content', packDocId(pack)");
    expect(load).toContain('getDoc(');
    expect(load).not.toContain('getDocs');
    expect(takePage + hook).not.toContain('getDocs');
  });

  it('the hook reads in the background, one pack at a time, with the question policy of three tries, and never blocks the attempt', () => {
    expect(hook).toContain('PACK_READ_TRIES = 3');
    expect(hook).toContain('PACK_READ_PAUSE_MS = 1500');
    expect(hook).toContain('withRetries(() => loadAttemptPack(institutionId, examId, n)');
    expect(hook).toContain('reportError(err, { what: "a question picture", quiet: true })');
    expect(hook).not.toContain('setView');
    expect(hook).not.toContain('Promise.all');
  });

  it('the questions are still read with the shared retry, and the pictures are started from the running attempt', () => {
    expect(attemptHook).toContain('withRetries(() => loadAttemptQuestions(institutionId, examId)');
    expect(attemptHook).toContain('await loadQuestionsWithRetry(institutionId, exam.id)');
    expect(takePage).toContain('useExamPictures({ institutionId, examId: exam.id, questions: session.questions, current: run.current })');
    expect(takePage).toContain('pictures={pictures}');
  });

  it('the preview reads the packs only when the exam has pictures, and shows them with the same view', () => {
    expect(previewHook).toContain('(loaded.imagePacks ?? 0) > 0 ? loadExamPacks(institutionId, examId)');
    expect(previewPage).toContain('picture={');
    expect(previewPage).toContain('srcOf={p.srcOf}');
    expect(previewPage).toContain('srcOf(question.image)');
  });
});

describe('no picture can be dragged out of an exam screen', () => {
  const screens = import.meta.glob('../../components/exam/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

  it('every img element in the exam screens has draggable={false}', () => {
    const tags = Object.entries(screens).flatMap(([path, text]) => (norm(text).match(/<img\b[^>]*>/g) ?? []).map((tag) => [path, tag] as const));
    expect(tags.length).toBeGreaterThan(0);
    for (const [path, tag] of tags) expect(tag, path).toContain('draggable={false}');
  });
});

describe('which strings a picture may be shown from', () => {
  it('are the data URLs of a PNG, a JPEG or a WebP in base64, and nothing else', () => {
    for (const ok of ['data:image/png;base64,iVBORw0KGgo=', 'data:image/jpeg;base64,/9j/4AAQ', 'data:image/webp;base64,UklGRg==']) expect(isImageDataUrl(ok), ok).toBe(true);
    for (const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGI+', 'javascript:alert(1)', 'https://example.com/a.png', 'data:image/png;base64,', 'data:image/png;base64,a b', '', undefined, 3]) {
      expect(isImageDataUrl(bad), String(bad)).toBe(false);
    }
  });

  it('is what the hook hands to the screens, so an unexpected string shows nothing', () => {
    expect(norm(hookRaw)).toContain('return isImageDataUrl(data) ? data : undefined;');
  });
});
