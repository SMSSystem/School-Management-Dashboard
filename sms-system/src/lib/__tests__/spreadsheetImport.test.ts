import { describe, it, expect } from 'vitest';
import {
  parseSpreadsheetFile,
  validateStructure,
  parseRows,
  resolveIdentities,
  validateRows,
  chunkWrites,
  countAdvisoryDuplicates,
  type ImportColumn,
  type PendingWrite,
  type IdentityResolver,
} from '../spreadsheetImport';

// ─── parseSpreadsheetFile ────────────────────────────────────────────────

describe('parseSpreadsheetFile', () => {
  it('parses a plain CSV into row objects keyed by header', async () => {
    const csv = 'Student,Class,Score\nAda,Class A,90\nBo,Class B,85';
    const file = new File([csv], 'rows.csv', { type: 'text/csv' });
    const rows = await parseSpreadsheetFile(file);
    expect(rows).toEqual([
      { Student: 'Ada', Class: 'Class A', Score: 90 },
      { Student: 'Bo', Class: 'Class B', Score: 85 },
    ]);
  });

  it('handles quoted commas, escaped quotes, and embedded newlines (§19.1)', async () => {
    const csv = [
      'Student,Class,Note',
      '"Doe, Jane","Class A","Contains a comma, right there"',
      '"Smith, ""Bobby"" John","Class B","Line one\nLine two (embedded newline)"',
      'Plain Value,Class C,No quoting needed',
    ].join('\n');
    const file = new File([csv], 'edge-cases.csv', { type: 'text/csv' });
    const rows = await parseSpreadsheetFile(file);

    expect(rows[0]).toEqual({ Student: 'Doe, Jane', Class: 'Class A', Note: 'Contains a comma, right there' });
    expect(rows[1]).toEqual({
      Student: 'Smith, "Bobby" John',
      Class: 'Class B',
      Note: 'Line one\nLine two (embedded newline)',
    });
    expect(rows[2]).toEqual({ Student: 'Plain Value', Class: 'Class C', Note: 'No quoting needed' });
  });

  it('fills missing cells with null rather than omitting the key', async () => {
    const csv = 'Student,Reason\nAda,';
    const file = new File([csv], 'rows.csv', { type: 'text/csv' });
    const rows = await parseSpreadsheetFile(file);
    expect(rows).toEqual([{ Student: 'Ada', Reason: null }]);
  });
});

// ─── validateStructure ───────────────────────────────────────────────────

type ResultRow = { studentName: string; score: number };
const resultColumns: ImportColumn<ResultRow>[] = [
  { header: 'Student', required: true, field: 'studentName', parse: (raw) => ({ ok: true, value: String(raw) }) },
  {
    header: 'Score',
    required: true,
    field: 'score',
    parse: (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: 'not a number' };
    },
  },
];

describe('validateStructure', () => {
  it('passes when every required header is present', () => {
    const result = validateStructure([{ Student: 'Ada', Score: 90 }], resultColumns);
    expect(result).toEqual({ ok: true, missingHeaders: [] });
  });

  it('reports missing required headers, ignoring an empty row set', () => {
    const result = validateStructure([], resultColumns);
    expect(result).toEqual({ ok: false, missingHeaders: ['Student', 'Score'] });
  });

  it('reports only the headers that are actually missing', () => {
    const result = validateStructure([{ Student: 'Ada' }], resultColumns);
    expect(result).toEqual({ ok: false, missingHeaders: ['Score'] });
  });
});

// ─── parseRows ────────────────────────────────────────────────────────────

describe('parseRows', () => {
  it('parses every valid row', () => {
    const { rows, errors } = parseRows(
      [
        { Student: 'Ada', Score: 90 },
        { Student: 'Bo', Score: 85 },
      ],
      resultColumns,
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { studentName: 'Ada', score: 90 },
      { studentName: 'Bo', score: 85 },
    ]);
  });

  it('reports a missing-required-value error with a 1-indexed row number (header = row 1)', () => {
    const { rows, errors } = parseRows([{ Student: '', Score: 90 }], resultColumns);
    expect(rows).toEqual([]);
    expect(errors).toEqual([{ row: 2, message: 'Missing required value for "Student"' }]);
  });

  it("surfaces a column's own parse error instead of throwing", () => {
    const { rows, errors } = parseRows([{ Student: 'Ada', Score: 'not-a-number' }], resultColumns);
    expect(rows).toEqual([]);
    expect(errors).toEqual([{ row: 2, message: 'Score: not a number' }]);
  });

  it('excludes a row with any error from the parsed output, without aborting later rows', () => {
    const { rows, errors } = parseRows(
      [
        { Student: '', Score: 90 },
        { Student: 'Bo', Score: 85 },
      ],
      resultColumns,
    );
    expect(rows).toEqual([{ studentName: 'Bo', score: 85 }]);
    expect(errors).toHaveLength(1);
  });

  it('skips an empty optional cell without an error', () => {
    type Row = { studentName: string; reason: string | null };
    const columns: ImportColumn<Row>[] = [
      { header: 'Student', required: true, field: 'studentName', parse: (raw) => ({ ok: true, value: String(raw) }) },
      { header: 'Reason', required: false, field: 'reason', parse: (raw) => ({ ok: true, value: String(raw) }) },
    ];
    const { rows, errors } = parseRows([{ Student: 'Ada', Reason: null }], columns);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ studentName: 'Ada' }]);
  });
});

// ─── resolveIdentities ────────────────────────────────────────────────────

type StudentRow = { studentName: string; studentId?: string };

describe('resolveIdentities', () => {
  it('auto-resolves a column where every distinct value has exactly one match', async () => {
    const resolver: IdentityResolver<StudentRow> = {
      column: 'studentName',
      label: 'Student',
      resolvedField: 'studentId',
      lookup: async (value) => [{ id: `id-${value}`, label: value }],
    };
    const result = await resolveIdentities<StudentRow>([{ studentName: 'Ada' }, { studentName: 'Bo' }], [resolver]);
    expect(result.needsResolution).toEqual([]);
    expect(result.resolved).toEqual([
      { studentName: 'Ada', studentId: 'id-Ada' },
      { studentName: 'Bo', studentId: 'id-Bo' },
    ]);
  });

  it('flags a zero-match value as needing resolution and returns no resolved rows', async () => {
    const resolver: IdentityResolver<StudentRow> = {
      column: 'studentName',
      label: 'Student',
      resolvedField: 'studentId',
      lookup: async () => [],
    };
    const result = await resolveIdentities<StudentRow>([{ studentName: 'Ghost' }], [resolver]);
    expect(result.resolved).toEqual([]);
    expect(result.needsResolution).toEqual([{ column: 'Student', value: 'Ghost', matches: [] }]);
  });

  it('flags a multiple-match value as needing resolution, listing every candidate', async () => {
    const resolver: IdentityResolver<StudentRow> = {
      column: 'studentName',
      label: 'Student',
      resolvedField: 'studentId',
      lookup: async () => [
        { id: 's1', label: 'Ada' },
        { id: 's2', label: 'Ada' },
      ],
    };
    const result = await resolveIdentities<StudentRow>([{ studentName: 'Ada' }], [resolver]);
    expect(result.resolved).toEqual([]);
    expect(result.needsResolution).toEqual([
      { column: 'Student', value: 'Ada', matches: [{ id: 's1', label: 'Ada' }, { id: 's2', label: 'Ada' }] },
    ]);
  });

  it('looks up each distinct value only once, not once per row', async () => {
    let lookupCount = 0;
    const resolver: IdentityResolver<StudentRow> = {
      column: 'studentName',
      label: 'Student',
      resolvedField: 'studentId',
      lookup: async (value) => {
        lookupCount += 1;
        return [{ id: `id-${value}`, label: value }];
      },
    };
    await resolveIdentities<StudentRow>(
      [{ studentName: 'Ada' }, { studentName: 'Ada' }, { studentName: 'Bo' }],
      [resolver],
    );
    expect(lookupCount).toBe(2);
  });
});

// ─── validateRows ─────────────────────────────────────────────────────────

describe('validateRows', () => {
  const scoreRule = {
    check: (row: ResultRow) => row.score <= 100,
    message: (row: ResultRow) => `score (${row.score}) exceeds max score (100)`,
  };

  it('passes rows that satisfy every rule', () => {
    const { valid, errors } = validateRows([{ studentName: 'Ada', score: 90 }], [scoreRule]);
    expect(valid).toEqual([{ studentName: 'Ada', score: 90 }]);
    expect(errors).toEqual([]);
  });

  it('reports a failing rule with a 1-indexed row number', () => {
    const { valid, errors } = validateRows([{ studentName: 'Ada', score: 150 }], [scoreRule]);
    expect(valid).toEqual([]);
    expect(errors).toEqual([{ row: 2, message: 'score (150) exceeds max score (100)' }]);
  });

  it('collects every failing rule for a row that breaks more than one', () => {
    const nameRule = {
      check: (row: ResultRow) => row.studentName.length > 0,
      message: () => 'student name is required',
    };
    const { errors } = validateRows([{ studentName: '', score: 150 }], [scoreRule, nameRule]);
    expect(errors).toHaveLength(2);
  });
});

// ─── countAdvisoryDuplicates ───────────────────────────────────────────────

describe('countAdvisoryDuplicates', () => {
  const keyFn = (row: ResultRow) => `${row.studentName}::${row.score}`;

  it('counts rows whose key matches an existing key', () => {
    const rows: ResultRow[] = [{ studentName: 'Ada', score: 90 }, { studentName: 'Bo', score: 85 }];
    const existingKeys = new Set(['Ada::90']);
    expect(countAdvisoryDuplicates(rows, existingKeys, keyFn)).toBe(1);
  });

  it('returns 0 when nothing matches', () => {
    const rows: ResultRow[] = [{ studentName: 'Ada', score: 90 }];
    expect(countAdvisoryDuplicates(rows, new Set(['Someone::1']), keyFn)).toBe(0);
  });

  it('returns 0 for an empty existing-keys set, without needing a special case', () => {
    const rows: ResultRow[] = [{ studentName: 'Ada', score: 90 }];
    expect(countAdvisoryDuplicates(rows, new Set(), keyFn)).toBe(0);
  });
});

// ─── chunkWrites ──────────────────────────────────────────────────────────

function fakeWrite(): PendingWrite {
  return { ref: {} as PendingWrite['ref'], data: {} };
}

describe('chunkWrites', () => {
  it('returns one chunk when the write count is under the limit', () => {
    const chunks = chunkWrites(Array.from({ length: 450 }, fakeWrite));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(450);
  });

  it('splits into two chunks the moment the count exceeds the limit', () => {
    const chunks = chunkWrites(Array.from({ length: 451 }, fakeWrite));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(450);
    expect(chunks[1]).toHaveLength(1);
  });

  it('splits 900 writes into exactly two full 450-write chunks', () => {
    const chunks = chunkWrites(Array.from({ length: 900 }, fakeWrite));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(450);
    expect(chunks[1]).toHaveLength(450);
  });

  it('returns no chunks for an empty write list', () => {
    expect(chunkWrites([])).toEqual([]);
  });
});
