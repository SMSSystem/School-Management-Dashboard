// Types for deleteInstitutionRunners.mjs, so the TypeScript tests can import it.

import type { Budget, CollectionTree } from './deleteInstitutionLogic.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DrainContext = {
  budget: Budget;
  stats: { reads: number; deletes: number };
  save?: () => void;
  onDeleted?: (n: number) => void;
};
export function drainCollection(db: any, base: any, children: CollectionTree, ctx: DrainContext): Promise<boolean>;
export class ReadCapError extends Error {
  constructor(cap: number);
}
export type CountContext = { reads: number; cap: number };
export function countCollection(
  base: any,
  children: CollectionTree,
  path: string,
  ctx: CountContext,
  byPath?: Record<string, number>,
): Promise<{ total: number; byPath: Record<string, number> }>;
