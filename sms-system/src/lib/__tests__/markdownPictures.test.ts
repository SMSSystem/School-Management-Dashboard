import { describe, expect, it } from 'vitest';
import { markdownLines, questionsFromMarkdown } from '../examMarkdown';
import { MAX_PICTURE_BYTES, MAX_PICTURES, PICTURE_MARKER_PREFIX, decodeBase64 } from '../examImportPictures';
import { buildExampleMarkdown } from '../exampleMarkdown';
import { prepareBytes } from '../examImageEncoding';
import { applyPrepared, chosen, keepAllClear, preparePictures, startReview } from '../examImportReview';
import { TEXT_CHUNK, buildPng, chunkTypes } from './imageFixtures';

// Pictures in a Markdown file (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.3): an image with a base64 data address is a
// picture where it stands, placed and reviewed like a Word picture; a web address is ignored with a note.

const m = (n: number) => `${PICTURE_MARKER_PREFIX}${n}`;
const PNG = buildPng({ width: 48, height: 32, extra: [TEXT_CHUNK] });
const base64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const dataUrl = (bytes: Uint8Array = PNG, mime = 'image/png') => `data:${mime};base64,${base64(bytes)}`;
const image = (alt = 'A vice', address = dataUrl()) => `![${alt}](${address})`;

describe('decodeBase64', () => {
  it('decodes padded and unpadded text, ignoring white space', () => {
    expect([...(decodeBase64('aGk=', 100) as { bytes: Uint8Array }).bytes]).toEqual([104, 105]);
    expect([...(decodeBase64('aGk', 100) as { bytes: Uint8Array }).bytes]).toEqual([104, 105]);
    expect([...(decodeBase64(' aG\n k= ', 100) as { bytes: Uint8Array }).bytes]).toEqual([104, 105]);
  });

  it('decodes an address that has been %-escaped', () => {
    expect([...(decodeBase64('aGk%3D', 100) as { bytes: Uint8Array }).bytes]).toEqual([104, 105]);
  });

  it('refuses text that is not base64, in words of its own', () => {
    for (const bad of ['', 'not base64!', 'a', 'aGk=aGk=', '%E0%A4%A']) expect(decodeBase64(bad, 100)).toEqual({ problem: 'invalid' });
  });

  it('refuses one that would be larger than the limit, from its length and before decoding it', () => {
    expect(decodeBase64('A'.repeat(4000), 100)).toEqual({ problem: 'too_large' });
    expect(decodeBase64('A'.repeat(4000), 3000)).toHaveProperty('bytes');
  });
});

describe('where an image goes', () => {
  it('on its own line under the question text is a picture after the stem, and carries the bytes and the alt text', () => {
    const out = markdownLines(['1. Which tool is this?', image(), 'A. A vice', 'B. A clamp', 'Answer: A'].join('\n'));
    expect(out.lines).toEqual(['1. Which tool is this?', m(0), 'A. A vice', 'B. A clamp', 'Answer: A']);
    expect(out.pictures).toHaveLength(1);
    expect(out.pictures[0]).toMatchObject({ format: 'png', alt: 'A vice', cropped: false });
    expect([...out.pictures[0].bytes!]).toEqual([...PNG]);
    expect(out.notes).toEqual([]);
  });

  it('at the end of the question line, or with text on both sides, splits the line around the picture', () => {
    expect(markdownLines(`1. Which tool is this? ${image()}`).lines).toEqual(['1. Which tool is this?', m(0)]);
    expect(markdownLines(`See ${image()} then answer`).lines).toEqual(['See', m(0), 'then answer']);
  });

  it('reads two images of a line in order, and an address followed by a title', () => {
    const out = markdownLines(`${image('one', dataUrl(PNG))} ${image('two', `${dataUrl(PNG)} "A title"`)}`);
    expect(out.lines).toEqual([m(0), m(1)]);
    expect(out.pictures.map((p) => p.alt)).toEqual(['one', 'two']);
  });

  it('places it as the parser always does: clear after the text, check among the options, unassigned before question 1', () => {
    const out = questionsFromMarkdown(['Title', image('t'), '1. Q one?', image('a'), 'A. x', image('b'), 'B. y', 'Answer: A'].join('\n'), 'single');
    expect(out.images).toEqual([
      { index: 0, questionIndex: null, confidence: 'unassigned' },
      { index: 1, questionIndex: 0, confidence: 'clear' },
      { index: 2, questionIndex: 0, confidence: 'check' },
    ]);
    expect(out.pictures).toHaveLength(3);
  });

  it('reads the questions exactly as without the images', () => {
    const body = ['1. Which tool is this?', 'A. A vice', 'B. A clamp', 'Answer: A'];
    const plain = questionsFromMarkdown(body.join('\n'), 'single');
    const marked = questionsFromMarkdown([body[0], image(), ...body.slice(1)].join('\n'), 'single');
    expect(marked.questions.map((q) => [q.text, q.options.map((o) => o.text)])).toEqual(plain.questions.map((q) => [q.text, q.options.map((o) => o.text)]));
    expect(marked.warnings).toEqual(plain.warnings);
    expect(plain.pictures).toBeUndefined();
    expect(plain.images).toBeUndefined();
  });

  it('takes the other marks of the line out of the text around it', () => {
    expect(markdownLines(`- 1. Which **tool** is *this*? ${image()}`).lines).toEqual(['1. Which tool is this?', m(0)]);
  });
});

describe('what is not a picture the file holds', () => {
  it('ignores an image with a web address, writes no marker for it and says so', () => {
    const out = markdownLines(['1. Q?', '![x](https://example.com/a.png)', '![y](//cdn.example.com/b.png)', 'A. a'].join('\n'));
    expect(out.lines).toEqual(['1. Q?', 'A. a']);
    expect(out.pictures).toEqual([]);
    expect(out.notes).toEqual(['2 pictures with a web address were ignored: a paper should not depend on another server. Embed the picture in the file or add it in the builder.']);
  });

  it('keeps the place of a data address that is not base64 or is damaged, as a picture that cannot be read', () => {
    const out = markdownLines(['![a](data:image/svg+xml;utf8,<svg/>)', '![b](data:image/png;base64,@@@@)'].join('\n'));
    expect(out.lines).toEqual([m(0), m(1)]);
    expect(out.pictures.map((p) => [p.bytes, p.problem])).toEqual([[null, 'unsupported'], [null, 'missing']]);
    expect(out.notes).toEqual(['2 pictures could not be read from the file (only a picture embedded as a base64 data address is read).']);
  });

  it('keeps the place of a picture that is too large, and leaves out pictures after the first 100', () => {
    const huge = `data:image/png;base64,${'A'.repeat(Math.ceil(((MAX_PICTURE_BYTES + 100) * 4) / 3))}`;
    const big = markdownLines(`![big](${huge})`);
    expect(big.pictures[0]).toMatchObject({ bytes: null, problem: 'too_large' });
    expect(big.notes[0]).toContain('too large');
    const many = markdownLines(Array.from({ length: MAX_PICTURES + 3 }, () => image('p', dataUrl(buildPng({ width: 24, height: 24 })))).join('\n'));
    expect(many.pictures).toHaveLength(MAX_PICTURES);
    expect(many.lines).toHaveLength(MAX_PICTURES);
    expect(many.notes).toEqual([`3 pictures after the first ${MAX_PICTURES} were left out.`]);
  });

  it('ignores an image in a table line, and leaves an escaped or half-written image as text', () => {
    expect(markdownLines(`| ${image()} | x |`).pictures).toEqual([]);
    expect(markdownLines('\\![not](an image)').lines).toEqual(['![not](an image)']);
    expect(markdownLines('![no close](data:image/png;base64,AAAA').lines).toEqual(['![no close](data:image/png;base64,AAAA']);
    expect(markdownLines('![a] (b) and [link](https://x.y)').pictures).toEqual([]);
  });

  it('reads a line of several megabytes of base64 quickly (no pattern runs over it)', () => {
    const noise = new Uint8Array(4 * 1024 * 1024).map((_, i) => (i * 31) & 255);
    const started = Date.now();
    const out = markdownLines(`1. Q?\n${image('big', dataUrl(noise))}\nA. a`);
    expect(out.pictures[0].bytes!.length).toBe(noise.length);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('the template', () => {
  it('begins with a note about pictures that yields no picture and no warning', () => {
    const out = questionsFromMarkdown(buildExampleMarkdown(), 'both');
    expect(out.pictures).toBeUndefined();
    expect(out.warnings).toEqual([]);
  });
});

describe('a Markdown file through the review to the chosen pictures', () => {
  it('goes through the same picture check as a Word picture, and the private chunk is gone', async () => {
    const result = questionsFromMarkdown(['1. Which tool?', image('A vice'), 'A. vice', 'B. clamp', 'Answer: A'].join('\n'), 'single');
    let items = startReview(result.images ?? [], result.pictures ?? []);
    await preparePictures(
      items,
      result.pictures ?? [],
      (bytes) =>
        prepareBytes(bytes, () => {
          throw new Error('no canvas needed');
        }),
      (index, outcome) => {
        items = applyPrepared(items, index, outcome);
      },
    );
    const picked = chosen(keepAllClear(items));
    expect(picked).toHaveLength(1);
    expect(picked[0]).toMatchObject({ questionIndex: 0, picture: { alt: 'A vice', exact: true } });
    const data = picked[0].picture.data;
    const kept = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), (c) => c.charCodeAt(0));
    expect(chunkTypes(kept)).not.toContain('tEXt');
  });
});
