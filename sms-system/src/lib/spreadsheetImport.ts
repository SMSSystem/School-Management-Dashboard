import * as XLSX from '@e965/xlsx';
import { writeBatch, type DocumentReference, type Firestore } from 'firebase/firestore';

// Read-side counterpart to spreadsheetExport.ts (which stays write-only).
// Primitives only — see docs/data/import/SPREADSHEET_IMPORT_SPEC.md §4.
// Per-target column definitions, identity resolvers, and validation rules
// are built on top of these in later implementation steps (§17), not here.

// ─── File parsing ────────────────────────────────────────────────────────

export type RawRow = Record<string, string | number | null>;

/**
 * Reads a File (CSV or XLSX) into plain row objects keyed by header. One
 * path for both formats — XLSX.read() accepts raw CSV text as well as XLSX
 * binary input. See §19.1 for the direct test confirming CSV edge cases
 * (quoted commas, escaped quotes, embedded newlines) round-trip correctly.
 */
export async function parseSpreadsheetFile(file: File): Promise<RawRow[]> {
  const isCSV = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
  const workbook = isCSV
    ? XLSX.read(await file.text(), { type: 'string' })
    : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null });
}

// ─── Structural validation + per-cell parsing ───────────────────────────

export interface RowError {
  /** 1-indexed against the original spreadsheet (header = row 1, first data row = row 2). */
  row: number;
  message: string;
}

export type CellParseResult = { ok: true; value: unknown } | { ok: false; error: string };

export interface ImportColumn<T> {
  header: string;
  required: boolean;
  /** Key on T this column's parsed value is assigned to. */
  field: keyof T;
  /** Converts one cell's raw value into the field's typed value. Returns an
   * error message instead of throwing, so one bad cell produces a row error
   * rather than aborting the whole parse. */
  parse: (raw: string | number) => CellParseResult;
}

export interface StructuralValidationResult {
  ok: boolean;
  missingHeaders: string[];
}

// ─── Reusable per-cell parsers ────────────────────────────────────────────
// Shared across per-target column definitions (§6-§10) so each new target
// doesn't reimplement string/number/date/enum/boolean cell parsing. Error
// text omits the column name — parseRows already prefixes it.

export function parseRequiredString(raw: string | number): CellParseResult {
  return { ok: true, value: String(raw).trim() };
}

export function parseNumberCell(raw: string | number, label: string): CellParseResult {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `"${raw}" is not a valid ${label}` };
}

/**
 * Accepts either an ISO "YYYY-MM-DD" string or an Excel date-serial number
 * (XLSX date cells come through as a raw number via sheet_to_json unless
 * read with cellDates: true — parseSpreadsheetFile doesn't set that, so
 * this has to handle both shapes itself).
 */
export function parseDateCell(raw: string | number): CellParseResult {
  if (typeof raw === 'number') {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return { ok: false, error: `"${raw}" is not a valid date` };
    const mm = String(parsed.m).padStart(2, '0');
    const dd = String(parsed.d).padStart(2, '0');
    return { ok: true, value: `${parsed.y}-${mm}-${dd}` };
  }
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || Number.isNaN(new Date(trimmed).getTime())) {
    return { ok: false, error: `"${raw}" is not a valid date (expected YYYY-MM-DD)` };
  }
  return { ok: true, value: trimmed };
}

/** Case-insensitive match against a fixed set of allowed string values. */
export function parseEnumCell<T extends string>(raw: string | number, allowed: readonly T[]): CellParseResult {
  const normalized = String(raw).trim().toLowerCase();
  const match = allowed.find((v) => v.toLowerCase() === normalized);
  if (match) return { ok: true, value: match };
  const quoted = allowed.map((v) => `"${v}"`);
  const joined = quoted.length <= 2 ? quoted.join(' or ') : `${quoted.slice(0, -1).join(', ')}, or ${quoted[quoted.length - 1]}`;
  return { ok: false, error: `"${raw}" must be ${joined}` };
}

export function parseBooleanCell(raw: string | number): CellParseResult {
  const normalized = String(raw).trim().toLowerCase();
  if (['true', 'yes', '1'].includes(normalized)) return { ok: true, value: true };
  if (['false', 'no', '0'].includes(normalized)) return { ok: true, value: false };
  return { ok: false, error: `"${raw}" must be true/false, yes/no, or 1/0` };
}

/** Checks every required column's header is present before parsing any row. */
export function validateStructure<T>(rawRows: RawRow[], columns: ImportColumn<T>[]): StructuralValidationResult {
  const presentHeaders = new Set(rawRows.length > 0 ? Object.keys(rawRows[0]) : []);
  const missingHeaders = columns.filter((c) => c.required && !presentHeaders.has(c.header)).map((c) => c.header);
  return { ok: missingHeaders.length === 0, missingHeaders };
}

/** Runs each column's parse() over every row, collecting per-row errors rather than throwing. */
export function parseRows<T>(rawRows: RawRow[], columns: ImportColumn<T>[]): { rows: T[]; errors: RowError[] } {
  const rows: T[] = [];
  const errors: RowError[] = [];

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2;
    const parsed = {} as T;
    let rowHasError = false;

    for (const column of columns) {
      const raw = rawRow[column.header];
      const isEmpty = raw === null || raw === undefined || raw === '';

      if (isEmpty) {
        if (column.required) {
          errors.push({ row: rowNumber, message: `Missing required value for "${column.header}"` });
          rowHasError = true;
        }
        continue;
      }

      const result = column.parse(raw);
      if (!result.ok) {
        errors.push({ row: rowNumber, message: `${column.header}: ${result.error}` });
        rowHasError = true;
        continue;
      }
      parsed[column.field] = result.value as T[keyof T];
    }

    if (!rowHasError) rows.push(parsed);
  });

  return { rows, errors };
}

// ─── Identity resolution (§3) ────────────────────────────────────────────

export interface IdentityMatch {
  id: string;
  label: string;
}

export interface IdentityResolver<T> {
  /** Field on T holding the raw spreadsheet value to resolve, e.g. "studentName". */
  column: keyof T;
  /** Human-readable name for reporting, e.g. "Student". */
  label: string;
  /** Field on T to write the single resolved id into once matched, e.g. "studentId". */
  resolvedField: keyof T;
  /** Looks up live candidates for one distinct raw value. */
  lookup: (rawValue: string) => Promise<IdentityMatch[]>;
}

export interface AmbiguousEntry {
  column: string;
  value: string;
  /** Empty = no match found; 2+ = ambiguous. Exactly 1 never appears here — that's auto-resolved. */
  matches: IdentityMatch[];
}

export interface ResolveIdentitiesResult<T> {
  resolved: T[];
  needsResolution: AmbiguousEntry[];
}

export interface NameCandidate {
  id: string;
  name: string;
}

/**
 * Case-insensitive, trimmed exact match against a live candidate list (§3
 * step 1) — the common shape of "resolve a spreadsheet name against
 * Students/Classes/Subjects/Terms" every target's identity resolvers need.
 * Per-target modules fetch the candidate list (a Firestore concern, kept
 * out of this file) and pass it in here.
 */
export function matchByName(candidates: NameCandidate[], rawValue: string): IdentityMatch[] {
  const needle = rawValue.trim().toLowerCase();
  return candidates
    .filter((c) => c.name.trim().toLowerCase() === needle)
    .map((c) => ({ id: c.id, label: c.name }));
}

/**
 * Implements §3's per-identity-column resolution flow, generically over
 * whichever columns a target declares. Queries each distinct raw value once
 * (not once per row) via the resolver's lookup(). If anything needs
 * resolution, `resolved` is empty — the caller can't proceed to commit (§2's
 * all-or-nothing decision) until every entry in `needsResolution` is cleared.
 */
export async function resolveIdentities<T extends object>(
  rows: T[],
  resolvers: IdentityResolver<T>[],
): Promise<ResolveIdentitiesResult<T>> {
  const needsResolution: AmbiguousEntry[] = [];
  const matchesByResolver = new Map<string, Map<string, IdentityMatch[]>>();

  for (const resolver of resolvers) {
    const distinctValues = new Set(
      rows.map((row) => String(row[resolver.column] ?? '').trim()).filter((v) => v.length > 0),
    );
    const matchesByValue = new Map<string, IdentityMatch[]>();
    for (const value of distinctValues) {
      const matches = await resolver.lookup(value);
      matchesByValue.set(value, matches);
      if (matches.length !== 1) {
        needsResolution.push({ column: resolver.label, value, matches });
      }
    }
    matchesByResolver.set(resolver.label, matchesByValue);
  }

  if (needsResolution.length > 0) {
    return { resolved: [], needsResolution };
  }

  const resolved = rows.map((row) => {
    const next = { ...row };
    for (const resolver of resolvers) {
      const raw = String(row[resolver.column] ?? '').trim();
      const [match] = matchesByResolver.get(resolver.label)!.get(raw)!;
      next[resolver.resolvedField] = match.id as T[keyof T];
    }
    return next;
  });

  return { resolved, needsResolution: [] };
}

/**
 * §19.3's advisory duplicate count — purely informational, never blocks
 * (unlike validateRows' hard errors). `existingKeys` comes from a
 * pre-fetch of live documents scoped by the caller (e.g. by the terms
 * actually referenced in this import); `keyFn` must build its keys the
 * same way for both the resolved rows and whatever produced
 * `existingKeys`, or every count comes back 0.
 */
export function countAdvisoryDuplicates<T>(rows: T[], existingKeys: Set<string>, keyFn: (row: T) => string): number {
  return rows.filter((row) => existingKeys.has(keyFn(row))).length;
}

// ─── Business-rule validation ────────────────────────────────────────────

export interface ValidationRule<T> {
  check: (row: T) => boolean;
  message: (row: T) => string;
}

/**
 * Per-target business-rule validation (e.g. Results' score <= maxScore),
 * mirroring the equivalent firestore.rules constraint client-side so
 * failures surface as a specific per-row message (§14) instead of a
 * permission-denied after commit. `rows` must be in original spreadsheet
 * order for the reported row numbers (§14) to line up.
 */
export function validateRows<T>(rows: T[], rules: ValidationRule<T>[]): { valid: T[]; errors: RowError[] } {
  const valid: T[] = [];
  const errors: RowError[] = [];

  rows.forEach((row, index) => {
    const failures = rules.filter((rule) => !rule.check(row));
    if (failures.length === 0) {
      valid.push(row);
    } else {
      errors.push(...failures.map((rule) => ({ row: index + 2, message: rule.message(row) })));
    }
  });

  return { valid, errors };
}

// ─── Chunked commit ──────────────────────────────────────────────────────

export interface PendingWrite {
  ref: DocumentReference;
  data: Record<string, unknown>;
  /** true = merge into an existing document (Gradebook's update case, §8); false/omitted = create. */
  merge?: boolean;
}

export interface CommitProgress {
  done: number;
  total: number;
  errors: string[];
}

// Matches the safety margin already used in scripts/backfill-department-ids.mjs
// (BATCH_LIMIT = 450) — stays under Firestore's 500-operation batch limit.
const BATCH_LIMIT = 450;

/** Pure chunking split, kept separate from the Firestore commit call so the
 * chunk-boundary logic itself (450/451/900 writes, §16) is unit-testable
 * without a real Firestore instance. */
export function chunkWrites(writes: PendingWrite[], limit: number = BATCH_LIMIT): PendingWrite[][] {
  const chunks: PendingWrite[][] = [];
  for (let start = 0; start < writes.length; start += limit) {
    chunks.push(writes.slice(start, start + limit));
  }
  return chunks;
}

/**
 * Commits `writes` as a sequence of ≤450-operation batches, reporting
 * {done, total, errors} progress after each chunk — the same shape
 * report-cards/index.tsx's BatchProgress already uses for its own bulk
 * operation. A chunk that fails to commit is recorded in `errors` and the
 * remaining chunks still run (§14's non-aborting accumulation pattern);
 * the real Firestore commit itself is a browser/network boundary this
 * module doesn't unit-test, same precedent as downloadXLSX in
 * spreadsheetExport.ts (see gridsheetExports.test.ts).
 */
export async function chunkedBatchWrite(
  writes: PendingWrite[],
  firestore: Firestore,
  onProgress?: (progress: CommitProgress) => void,
): Promise<CommitProgress> {
  const progress: CommitProgress = { done: 0, total: writes.length, errors: [] };
  onProgress?.({ ...progress });

  for (const chunk of chunkWrites(writes)) {
    const batch = writeBatch(firestore);
    for (const write of chunk) {
      batch.set(write.ref, write.data, write.merge ? { merge: true } : {});
    }
    try {
      await batch.commit();
      progress.done += chunk.length;
    } catch (err) {
      progress.errors.push(err instanceof Error ? err.message : String(err));
    }
    onProgress?.({ ...progress });
  }

  return progress;
}
