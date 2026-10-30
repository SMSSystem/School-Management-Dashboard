// The Firestore side of scripts/delete-real-institution.mjs: draining a collection and its subcollections under a delete
// budget, and counting them. Written against the small part of the Admin SDK it needs (collection / doc / where / limit /
// orderBy / startAfter / get / count / batch), imports nothing from firebase, so a fake in the tests can stand in for it.

import { BATCH_LIMIT } from './deleteInstitutionLogic.mjs';

/**
 * Deletes every document of `base` (a collection or a query on one) and, first, every document of the subcollections named by
 * `children` under each of them, until `ctx.budget` is spent. A document is deleted only after its subcollections are empty,
 * so a stopped run leaves a parent to be found again. Returns true when `base` is empty.
 *   ctx: { budget, stats: { reads, deletes }, save?: () => void, onDeleted?: (n) => void }
 */
export async function drainCollection(db, base, children, ctx) {
  const childNames = Object.keys(children);
  for (;;) {
    if (ctx.budget.exhausted()) return false;
    const take = Math.min(BATCH_LIMIT, ctx.budget.remaining());
    const page = await base.limit(take).get();
    ctx.stats.reads += Math.max(1, page.docs.length);
    if (page.empty) return true;

    if (childNames.length === 0) {
      const batch = db.batch();
      page.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      spent(ctx, page.docs.length);
    } else {
      for (const doc of page.docs) {
        for (const child of childNames) {
          if (!(await drainCollection(db, doc.ref.collection(child), children[child], ctx))) return false;
        }
        if (ctx.budget.exhausted()) return false;
        await doc.ref.delete();
        spent(ctx, 1);
      }
    }
    if (page.docs.length < take) return true;
  }
}

function spent(ctx, n) {
  ctx.budget.spend(n);
  ctx.stats.deletes += n;
  ctx.onDeleted?.(n);
  ctx.save?.();
}

/** Thrown when counting would pass the read cap, so a dry run cannot quietly spend the day's reads. */
export class ReadCapError extends Error {
  constructor(cap) {
    super(`Counting needs more than ${cap} reads; stopped. Raise --max-reads only if the day's quota allows it.`);
    this.name = 'ReadCapError';
  }
}

/**
 * Counts the documents of `base` and of the subcollections named by `children`. The documents themselves are counted with
 * count() (one read per up to 1,000 entries); only a collection that has subcollections is paged through, because each of
 * its documents has to be asked for its children. Returns { total, byPath } where byPath maps `exams` / `exams/attempts` ... to counts.
 *   ctx: { reads, cap }  (reads is a running total, updated here)
 */
export async function countCollection(base, children, path, ctx, byPath = {}) {
  const aggregate = await base.count().get();
  const n = aggregate.data().count;
  charge(ctx, 1 + Math.floor(n / 1000));
  byPath[path] = (byPath[path] ?? 0) + n;
  let total = n;
  const childNames = Object.keys(children);
  if (childNames.length > 0 && n > 0) {
    let last = null;
    for (;;) {
      let q = base.orderBy('__name__').limit(BATCH_LIMIT);
      if (last) q = q.startAfter(last);
      const page = await q.get();
      charge(ctx, Math.max(1, page.docs.length));
      for (const doc of page.docs) {
        for (const child of childNames) {
          const inner = await countCollection(doc.ref.collection(child), children[child], `${path}/${child}`, ctx, byPath);
          total += inner.total;
        }
      }
      if (page.docs.length < BATCH_LIMIT) break;
      last = page.docs[page.docs.length - 1];
    }
  }
  return { total, byPath };
}

function charge(ctx, n) {
  ctx.reads += n;
  if (ctx.reads > ctx.cap) throw new ReadCapError(ctx.cap);
}
