import { describe, expect, it } from 'vitest';
import { estimateExamWrites } from '../examBudget';
import {
  PACK_COMMIT_MAX_BYTES,
  PACK_TARGET_CHARS,
  assignToPacks,
  changedPacks,
  contentKey,
  findDuplicate,
  orphanImages,
  packBytes,
  packCommits,
  packStats,
  tidy,
  type NewImage,
  type PackMap,
} from '../examImagePack';
import packRaw from '../examImagePack.ts?raw';

// The image packs (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §3.2, §3.4 and §7): stable first-fit packing, what to rewrite, what to
// sweep, the commits that stay under the request limit, and the arithmetic of the budget.

const image = (id: string, chars: number, fill = 'A'): NewImage => ({ id, mime: 'image/png', data: `data:image/png;base64,${fill.repeat(Math.max(0, chars - 22))}` });
const ids = (packs: PackMap) => Object.fromEntries(Object.keys(packs).map((n) => [n, Object.keys(packs[Number(n)].images)]));

describe('assignToPacks', () => {
  it('fills the first pack and opens the next when a picture does not fit (first fit)', () => {
    const { packs, placement } = assignToPacks({}, [image('a', 400_000), image('b', 400_000), image('c', 400_000)], []);
    expect(ids(packs)).toEqual({ 1: ['a', 'b'], 2: ['c'] });
    expect(placement).toEqual({ a: 1, b: 1, c: 2 });
  });

  it('puts a small picture into an earlier pack that has room, not at the end', () => {
    const start = assignToPacks({}, [image('a', 600_000), image('b', 600_000)], []).packs; // one in each pack
    const { placement } = assignToPacks(start, [image('s', 1_000)], []);
    expect(placement.s).toBe(1);
  });

  it('keeps every picture in the pack it was in: adding one moves nothing', () => {
    const start = assignToPacks({}, [image('a', 400_000), image('b', 400_000), image('c', 400_000)], []).packs;
    const next = assignToPacks(start, [image('d', 300_000)], []);
    expect(ids(next.packs)).toEqual({ 1: ['a', 'b'], 2: ['c', 'd'] });
    expect(changedPacks(start, next.packs)).toEqual([2]);
  });

  it('rewrites only its own pack when a picture is removed, and drops a pack that becomes empty', () => {
    const start = assignToPacks({}, [image('a', 400_000), image('b', 400_000), image('c', 400_000)], []).packs;
    const one = assignToPacks(start, [], ['a']);
    expect(ids(one.packs)).toEqual({ 1: ['b'], 2: ['c'] });
    expect(changedPacks(start, one.packs)).toEqual([1]);
    const two = assignToPacks(start, [], ['c']);
    expect(ids(two.packs)).toEqual({ 1: ['a', 'b'] });
    expect(two.emptied).toEqual([2]);
    expect(changedPacks(start, two.packs)).toEqual([2]);
  });

  it('reuses the number of an emptied pack for a new one only when it is free, and never changes the input', () => {
    const start = assignToPacks({}, [image('a', 600_000), image('b', 600_000)], []).packs;
    const copy = JSON.stringify(start);
    const out = assignToPacks(start, [image('c', 600_000)], ['a']);
    expect(ids(out.packs)).toEqual({ 1: ['c'], 2: ['b'] });
    expect(JSON.stringify(start)).toBe(copy);
  });

  it('never fills a pack past the target, whatever the order of the pictures', () => {
    const many = Array.from({ length: 30 }, (_, i) => image(`p${i}`, 100_000 + ((i * 37_000) % 300_000)));
    const { packs } = assignToPacks({}, many, []);
    for (const n of Object.keys(packs)) expect(packBytes(packs[Number(n)])).toBeLessThanOrEqual(PACK_TARGET_CHARS);
    expect(Object.values(packs).reduce((n, p) => n + Object.keys(p.images).length, 0)).toBe(30);
  });
});

describe('changedPacks', () => {
  const base = assignToPacks({}, [image('a', 1000), image('b', 1000, 'B')], []).packs;

  it('is empty when nothing differs, including for a pack copied with another revision', () => {
    expect(changedPacks(base, structuredClone(base))).toEqual([]);
    expect(changedPacks(base, { 1: { ...base[1], revision: 9 } })).toEqual([]);
  });

  it('names a pack whose picture changed, was added or removed, or that exists on one side only', () => {
    expect(changedPacks(base, { 1: { images: { ...base[1].images, a: image('a', 1000, 'Z') } } })).toEqual([1]);
    expect(changedPacks(base, { 1: base[1], 2: { images: { x: image('x', 10) } } })).toEqual([2]);
    expect(changedPacks(base, {})).toEqual([1]);
  });
});

describe('orphanImages', () => {
  const packs = assignToPacks({}, [image('a', 600_000), image('b', 600_000), image('c', 1000)], []).packs; // 1: a, c  2: b

  it('finds pictures no question refers to, and the packs that would be empty', () => {
    const out = orphanImages([{ pack: 1, id: 'a' }], packs);
    expect(out.images).toEqual([{ pack: 1, id: 'c' }, { pack: 2, id: 'b' }]);
    expect(out.emptyPacks).toEqual([2]);
  });

  it('finds nothing when every picture is referred to, and everything when nothing is', () => {
    expect(orphanImages([{ pack: 1, id: 'a' }, { pack: 1, id: 'c' }, { pack: 2, id: 'b' }], packs)).toEqual({ images: [], emptyPacks: [] });
    expect(orphanImages([], packs).emptyPacks).toEqual([1, 2]);
  });

  it('matches by pack and id together: the same id in another pack is not the one referred to', () => {
    expect(orphanImages([{ pack: 2, id: 'a' }], packs).images).toContainEqual({ pack: 1, id: 'a' });
  });
});

describe('tidy', () => {
  it('repacks into the fewest packs and says where everything went', () => {
    const loose: PackMap = {
      1: { images: { a: image('a', 300_000) } },
      2: { images: { b: image('b', 300_000) } },
      3: { images: { c: image('c', 300_000) } },
      4: { images: { d: image('d', 300_000) } },
    };
    const out = tidy(loose);
    expect(Object.keys(out.packs)).toHaveLength(2);
    expect(Object.keys(out.placement).sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const [id, pack] of Object.entries(out.placement)) expect(out.packs[pack].images[id]).toBeDefined();
  });

  it('keeps every picture and every byte', () => {
    const start = assignToPacks({}, Array.from({ length: 12 }, (_, i) => image(`i${i}`, 90_000 + i * 20_000, String.fromCharCode(65 + i))), []).packs;
    const out = tidy(start);
    expect(packStats(out.packs).chars).toBe(packStats(start).chars);
  });
});

describe('packCommits', () => {
  const MB = 1024 * 1024;
  const big = (n: number): PackMap => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, { images: { [`p${i}`]: image(`p${i}`, 900_000) } }]));

  it('never puts more than the request limit into one commit', () => {
    const packs = big(20);
    const commits = packCommits(Object.keys(packs).map(Number), packs);
    expect(commits.flat()).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const commit of commits) expect(commit.reduce((n, p) => n + packBytes(packs[p]), 0)).toBeLessThanOrEqual(PACK_COMMIT_MAX_BYTES);
    expect(commits.length).toBeGreaterThan(1);
    expect(PACK_COMMIT_MAX_BYTES).toBe(8 * MB);
  });

  it('fits as many as the limit allows and starts a new commit exactly when the next would pass it', () => {
    const packs = big(4);
    const one = packBytes(packs[1]);
    expect(packCommits([1, 2, 3, 4], packs, one * 2)).toEqual([[1, 2], [3, 4]]);
    expect(packCommits([1, 2, 3, 4], packs, one * 2 - 1)).toEqual([[1], [2], [3], [4]]);
    expect(packCommits([1, 2, 3, 4], packs, one * 4)).toEqual([[1, 2, 3, 4]]);
  });

  it('gives one commit for a few packs, none for none, and a pack bigger than the limit a commit of its own', () => {
    expect(packCommits([2, 1], big(2))).toEqual([[1, 2]]);
    expect(packCommits([], big(2))).toEqual([]);
    expect(packCommits([1, 2], big(2), 10)).toEqual([[1], [2]]);
  });
});

describe('packStats', () => {
  it('counts the packs and the characters of the pictures, and the bytes the documents come to', () => {
    const packs = assignToPacks({}, [image('a', 1000), image('b', 2000)], []).packs;
    const stats = packStats(packs);
    expect(stats.count).toBe(1);
    expect(stats.chars).toBe(3000);
    expect(stats.bytes).toBeGreaterThan(3000);
    expect(packStats({})).toEqual({ count: 0, chars: 0, bytes: 0 });
  });
});

describe('contentKey and findDuplicate', () => {
  it('give the same key for the same content and another for another, with the length in it', () => {
    expect(contentKey('abc')).toBe(contentKey('abc'));
    expect(contentKey('abc')).not.toBe(contentKey('abd'));
    expect(contentKey('abc').startsWith('3:')).toBe(true);
  });

  it('finds a picture that is already stored, by its content and not by its id', () => {
    const packs = assignToPacks({}, [image('a', 5000, 'X'), image('b', 5000, 'Y')], []).packs;
    expect(findDuplicate(packs, image('new', 5000, 'Y'))).toEqual({ pack: 1, id: 'b' });
    expect(findDuplicate(packs, image('new', 5000, 'Z'))).toBeNull();
    expect(findDuplicate(packs, { ...image('new', 5000, 'Y'), mime: 'image/webp' })).toBeNull();
    expect(findDuplicate({}, image('x', 10))).toBeNull();
  });

  it('is decided by comparing the whole content, so a clash of keys is not taken for a duplicate', () => {
    const a = image('a', 100, 'P');
    const packs: PackMap = { 1: { images: { a: { mime: a.mime, data: a.data } } } };
    // same length and almost the same text: only the full comparison tells them apart
    const other = { ...a, data: a.data.slice(0, -1) + 'Q' };
    expect(findDuplicate(packs, other)).toBeNull();
    expect(findDuplicate(packs, a)).toEqual({ pack: 1, id: 'a' });
  });
});

describe('what a big exam costs in packs and reads (spec §7)', () => {
  it('fills 50 packs with 100 pictures of 300 KB, which adds 100 reads for each student', () => {
    const chars = Math.ceil((300 * 1024) / 3) * 4 + 22; // a 300 KB picture as a data URL
    const { packs } = assignToPacks({}, Array.from({ length: 100 }, (_, i) => image(`p${i}`, chars)), []);
    const stats = packStats(packs);
    expect(stats.count).toBe(50);
    const base = estimateExamWrites({ students: 30, durationMinutes: 60, checkpointMinutes: 10, releaseMode: 'auto' });
    const withPictures = estimateExamWrites({ students: 30, durationMinutes: 60, checkpointMinutes: 10, releaseMode: 'auto', imagePacks: stats.count, imageBytes: stats.bytes });
    expect(withPictures.reads - base.reads).toBe(30 * 100 + 50);
  });

  it('puts one picture at the largest size in a pack of its own', () => {
    const { packs } = assignToPacks({}, [image('a', 600_000), image('b', 600_000)], []);
    expect(Object.keys(packs)).toHaveLength(2);
  });
});

describe('the module', () => {
  it('is pure: no page, Firebase, React or library, and the packs hold only what the rules will accept', () => {
    const text = packRaw.split('\r\n').join('\n');
    expect([...text.matchAll(/^import /gm)]).toHaveLength(0);
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['document.', 'window.', 'firebase', 'react', 'Date.now']) expect(code, forbidden).not.toContain(forbidden);
  });
});
