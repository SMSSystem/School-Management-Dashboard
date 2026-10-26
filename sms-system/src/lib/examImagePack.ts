// The image packs of an exam (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §3.2 and §3.4): several pictures
// to a Firestore document, so a student who opens the paper reads a few documents instead of one for each picture. Pure
// and Firebase-free.
//
// A picture keeps the pack it was first put in, so removing one rewrites its own pack only; a new picture goes to the
// first pack with room (first fit), else a new pack. The same picture on two questions is stored once. Saving writes the
// changed packs first, in commits under the 10 MiB request limit (packCommits), then the questions that refer to them, so
// a failure in between leaves harmless packs that the next save sweeps (orphanImages).

import type { ExamQuestion } from '@/types/exams';

export type PackImage = { mime: 'image/png' | 'image/jpeg' | 'image/webp'; data: string };
export type Pack = { revision?: number; images: Record<string, PackImage> };
/** Pack number (1, 2, 3 …) to its pictures. */
export type PackMap = Record<number, Pack>;

/**
 * A pack is filled to about this many characters: under the 1 MiB document limit with room for the document around the
 * pictures, and enough for two pictures of 300 KB (about 410,000 characters each). One picture is at most IMAGE_CAP_CHARS
 * (600,000), so it always fits.
 */
export const PACK_TARGET_CHARS = 900_000;
/** One commit of packs stays under this many bytes (the API request limit is 10 MiB). */
export const PACK_COMMIT_MAX_BYTES = 8 * 1024 * 1024;
/** The document around the pictures: its keys, the revision and the time, and the key of each picture. */
const PACK_OVERHEAD_CHARS = 1024;
const IMAGE_OVERHEAD_CHARS = 64;

const sizeOf = (image: PackImage) => image.data.length + image.mime.length + IMAGE_OVERHEAD_CHARS;
const packChars = (pack: Pack) => Object.values(pack.images).reduce((n, i) => n + sizeOf(i), PACK_OVERHEAD_CHARS);
const numbers = (packs: PackMap) => Object.keys(packs).map(Number).sort((a, b) => a - b);

/** A stable key for a picture's content: its length and a 53-bit hash. Equal content always gives equal keys. */
export function contentKey(data: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < data.length; i += 1) {
    const ch = data.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${data.length}:${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

/** The picture already stored with exactly this content, if any (the key narrows it, the full comparison decides). */
export function findDuplicate(packs: PackMap, image: PackImage): { pack: number; id: string } | null {
  const key = contentKey(image.data);
  for (const n of numbers(packs)) {
    for (const [id, stored] of Object.entries(packs[n].images)) {
      if (stored.mime === image.mime && contentKey(stored.data) === key && stored.data === image.data) return { pack: n, id };
    }
  }
  return null;
}

export type NewImage = { id: string } & PackImage;

/**
 * Puts new pictures into the packs and takes removed ones out. Nothing moves: a picture stays in its pack, a new one goes
 * to the first pack with room, else a new pack. The result holds only the packs that exist afterwards (an emptied pack is
 * dropped, and `emptied` names it so the save can delete its document). `placement` says where each added picture went.
 */
export function assignToPacks(
  existing: PackMap,
  added: readonly NewImage[],
  removedIds: readonly string[],
): { packs: PackMap; placement: Record<string, number>; emptied: number[] } {
  const packs: PackMap = {};
  for (const n of numbers(existing)) packs[n] = { ...existing[n], images: { ...existing[n].images } };
  const gone = new Set(removedIds);
  for (const n of numbers(packs)) for (const id of Object.keys(packs[n].images)) if (gone.has(id)) delete packs[n].images[id];

  const placement: Record<string, number> = {};
  for (const image of added) {
    const cost = sizeOf(image);
    let target = numbers(packs).find((n) => packChars(packs[n]) + cost <= PACK_TARGET_CHARS);
    if (target === undefined) {
      target = 1;
      while (packs[target]) target += 1;
      packs[target] = { images: {} };
    }
    packs[target].images[image.id] = { mime: image.mime, data: image.data };
    placement[image.id] = target;
  }
  const emptied: number[] = [];
  for (const n of numbers(packs)) {
    if (Object.keys(packs[n].images).length === 0) {
      delete packs[n];
      emptied.push(n);
    }
  }
  return { packs, placement, emptied };
}

/** The numbers of the packs whose pictures differ (added, removed or changed) or that exist on one side only. */
export function changedPacks(before: PackMap, after: PackMap): number[] {
  const all = new Set([...numbers(before), ...numbers(after)]);
  return [...all]
    .filter((n) => {
      const a = before[n]?.images;
      const b = after[n]?.images;
      if (!a || !b) return true;
      const ids = Object.keys(a);
      if (ids.length !== Object.keys(b).length) return true;
      return ids.some((id) => !b[id] || b[id].data !== a[id].data || b[id].mime !== a[id].mime);
    })
    .sort((x, y) => x - y);
}

/**
 * What no question refers to: the pictures in packs that no `{ pack, id }` reference names, and the packs that would be
 * empty without them (their documents are deleted). A failed save leaves such pictures; the next successful one sweeps them.
 */
export function orphanImages(referenced: readonly { pack: number; id: string }[], packs: PackMap): { images: { pack: number; id: string }[]; emptyPacks: number[] } {
  const used = new Set(referenced.map((r) => `${r.pack}/${r.id}`));
  const images: { pack: number; id: string }[] = [];
  const emptyPacks: number[] = [];
  for (const n of numbers(packs)) {
    const ids = Object.keys(packs[n].images);
    const loose = ids.filter((id) => !used.has(`${n}/${id}`));
    for (const id of loose) images.push({ pack: n, id });
    if (loose.length === ids.length) emptyPacks.push(n);
  }
  return { images, emptyPacks };
}

/**
 * Repacks every picture into the fewest packs (first fit, largest first), for the explicit "Tidy images" action. Every
 * picture may move, so every pack is rewritten; `placement` says where each one went and the references must follow.
 */
export function tidy(packs: PackMap): { packs: PackMap; placement: Record<string, number> } {
  const all: NewImage[] = [];
  for (const n of numbers(packs)) for (const [id, image] of Object.entries(packs[n].images)) all.push({ id, ...image });
  all.sort((a, b) => sizeOf(b) - sizeOf(a) || (a.id < b.id ? -1 : 1));
  const out = assignToPacks({}, all, []);
  return { packs: out.packs, placement: out.placement };
}

/** What a pack comes to when written: its characters (the data is ASCII, so one byte each) and the document around it. */
export const packBytes = (pack: Pack): number => packChars(pack);

/**
 * Groups the packs to write into commits, each under `maxBytes`, in pack order. A pack larger than the limit by itself
 * (it cannot be, with one picture at most IMAGE_CAP_CHARS and a pack at most 1 MiB) would still be a commit of its own.
 */
export function packCommits(changed: readonly number[], packs: PackMap, maxBytes: number = PACK_COMMIT_MAX_BYTES): number[][] {
  const commits: number[][] = [];
  let current: number[] = [];
  let size = 0;
  for (const n of [...changed].sort((a, b) => a - b)) {
    const bytes = packs[n] ? packBytes(packs[n]) : 0;
    if (current.length > 0 && size + bytes > maxBytes) {
      commits.push(current);
      current = [];
      size = 0;
    }
    current.push(n);
    size += bytes;
  }
  if (current.length > 0) commits.push(current);
  return commits;
}

/** How many packs the pictures fill and how big they are: the figures the budget and the exam document keep. */
export function packStats(packs: PackMap): { count: number; chars: number; bytes: number } {
  const list = numbers(packs);
  const chars = list.reduce((n, p) => n + Object.values(packs[p].images).reduce((m, i) => m + i.data.length, 0), 0);
  return { count: list.length, chars, bytes: list.reduce((n, p) => n + packBytes(packs[p]), 0) };
}

// ── Saving (spec §3.4) ──────────────────────────────────────────────────────

/** The id of pack n's document under `content`. */
export const packDocId = (n: number): string => `images_${n}`;

/** The number in a pack document's id, or null for any other document (the questions, say). */
export function packNumberOf(docId: string): number | null {
  const m = /^images_(\d+)$/.exec(docId);
  return m ? Number(m[1]) : null;
}

/** Every `{ pack, id }` the questions refer to. */
export function referencesOf(questions: readonly Pick<ExamQuestion, 'image'>[]): { pack: number; id: string }[] {
  return questions.flatMap((q) => (q.image ? [{ pack: q.image.pack, id: q.image.id }] : []));
}

/** The packs without any picture no question refers to; a pack that would be empty is dropped. */
export function withoutOrphans(packs: PackMap, refs: readonly { pack: number; id: string }[]): PackMap {
  const used = new Set(refs.map((r) => `${r.pack}/${r.id}`));
  const out: PackMap = {};
  for (const n of numbers(packs)) {
    const images = Object.fromEntries(Object.entries(packs[n].images).filter(([id]) => used.has(`${n}/${id}`)));
    if (Object.keys(images).length > 0) out[n] = { ...packs[n], images };
  }
  return out;
}

/**
 * What a save writes for the pictures: the packs as they will be (pictures nothing refers to are left out, which also
 * sweeps what a failed save left behind), the packs to write, the packs to delete, the commits to write them in, the
 * totals, and the two fields of the exam document. Those fields are given only when the exam has pictures or already
 * carried them, so an exam that never had a picture is saved exactly as before.
 */
export function planImageSave(p: {
  before: PackMap;
  after: PackMap;
  questions: readonly Pick<ExamQuestion, 'image'>[];
  /** The exam document already has `imagePacks` or `imageBytes`. */
  hadFields?: boolean;
}): {
  packs: PackMap;
  write: number[];
  remove: number[];
  commits: number[][];
  stats: { count: number; chars: number; bytes: number };
  examFields: { imagePacks: number; imageBytes: number } | null;
} {
  const packs = withoutOrphans(p.after, referencesOf(p.questions));
  const write = changedPacks(p.before, packs).filter((n) => packs[n]);
  const remove = numbers(p.before).filter((n) => !packs[n]);
  const stats = packStats(packs);
  return {
    packs,
    write,
    remove,
    commits: packCommits(write, packs),
    stats,
    examFields: stats.count > 0 || p.hadFields ? { imagePacks: stats.count, imageBytes: stats.bytes } : null,
  };
}
