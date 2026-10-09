// Types for sweepOrphanBlobsLogic.mjs, so the TypeScript tests can import it.

export type Blob = { institutionId: string; key: string; size?: unknown; uploadedAt?: unknown };
export type Classified = { referenced: Blob[]; recent: Blob[]; unknownAge: Blob[]; orphans: Blob[] };
export type Totals = { perInstitution: Map<string, number>; total: number };
export type CounterChange = { path: string; label: string; from: number; to: number };

export const DAY_MS: number;
export const DEFAULT_GRACE_DAYS: number;
export const MIN_GRACE_DAYS: number;
export function noteFileInstitution(path: string): string | null;
export function pairKey(institutionId: string, key: string): string;
export function parseGraceDays(raw?: string | number | null): number;
export function classifyBlobs(args: {
  blobs: Blob[];
  referenced: Set<string>;
  nowMs: number;
  graceMs: number;
}): Classified;
export function findDangling(referenced: Set<string>, present: Set<string>): string[];
export function withBadSize(blobs: Blob[]): Blob[];
export function sumByInstitution(blobs: Blob[]): Totals;
export function isValidInstitutionId(id: unknown): boolean;
export function counterPlan(args: {
  stored: { institutions?: Record<string, number>; total?: number };
  actual: Totals;
  institutionId?: string | null;
}): CounterChange[];
export function shortKey(key: string): string;
