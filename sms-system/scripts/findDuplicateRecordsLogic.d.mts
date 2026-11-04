// Types for findDuplicateRecordsLogic.mjs, so the TypeScript tests can import it.

export const DEFAULT_MAX_READS: number;
export const DAILY_READ_QUOTA: number;

type Data = Record<string, unknown>;

export type Definition = {
  name: string;
  fields: string[];
  keyFields: string[];
  where?: [string, string, string];
  scopeOf: (data: Data) => Record<string, unknown>;
  isRegister: boolean;
  logDocIds: boolean;
  valueOf: (data: Data) => unknown;
};
export type Row = { id: string; data: Data };
export type Overlap = {
  studentsInMoreThanOne: number;
  studentsWithDifferentMarks: number;
  extraMarksCounted: number;
};
export type DuplicateGroup = Record<string, unknown> & {
  documents: number;
  valuesDiffer: boolean;
  documentIds?: string[];
  extraMarksCounted?: number;
};
export type Scan = {
  scanned: number;
  skipped: number;
  duplicates: DuplicateGroup[];
};

export const COLLECTIONS: Definition[];
export function keyOf(definition: Definition, data: Data): string | null;
export function registerOverlap(rows: Row[]): Overlap;
export function findDuplicates(definition: Definition, rows: Row[]): Scan;
export function summarise(scan: Scan): {
  scanned: number;
  skipped: number;
  groups: number;
  extraDocuments: number;
  groupsThatDiffer: number;
  extraMarksCounted: number;
};
export function checkBudget(
  totalDocuments: number,
  maxReads: number,
): {
  totalDocuments: number;
  maxReads: number;
  allowed: boolean;
  shareOfDailyQuota: number;
};
export function queryFor(
  institutionRef: unknown,
  definition: Definition,
): unknown;
export function countCollection(
  institutionRef: unknown,
  definition: Definition,
): Promise<number>;
export function scanCollection(
  institutionRef: unknown,
  definition: Definition,
): Promise<Scan>;
