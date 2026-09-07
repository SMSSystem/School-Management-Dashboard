import { describe, it, expect } from 'vitest';
import { validateStructure, parseRows, resolveIdentities, validateRows } from '../spreadsheetImport';
import {
  mddsImportColumns,
  mddsValidationRules,
  buildMddsIdentityResolvers,
  buildMddsData,
  type MddsImportRow,
  type ResolvedMddsImportRow,
  type MddsIdentityCandidates,
} from '../importMdds';

const candidates: MddsIdentityCandidates = {
  students: [{ id: 'stu1', name: 'Ada Lovelace' }, { id: 'stu2', name: 'Ada Lovelace' }, { id: 'stu3', name: 'Bo Diddley' }],
  classes: [{ id: 'cls1', name: 'Class A' }],
  terms: [{ id: 'trm1', name: 'Christmas Term' }],
};

// ─── Column parsing ───────────────────────────────────────────────────────

describe('mddsImportColumns', () => {
  it('parses a clean merit row, leaving End Date/Served unset', () => {
    const { rows, errors } = parseRows(
      [
        {
          Student: 'Bo Diddley', Class: 'Class A', Term: 'Christmas Term',
          Type: 'Merit', Reason: 'Helped a classmate', Date: '2026-09-03',
          'End Date': null, Served: null,
        },
      ],
      mddsImportColumns,
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        studentName: 'Bo Diddley', className: 'Class A', termName: 'Christmas Term',
        type: 'merit', reason: 'Helped a classmate', date: '2026-09-03',
      },
    ]);
  });

  it('parses a suspension row with End Date and Served populated', () => {
    const { rows, errors } = parseRows(
      [
        {
          Student: 'Bo Diddley', Class: 'Class A', Term: 'Christmas Term',
          Type: 'suspension', Reason: 'Repeated disruption', Date: '2026-09-03',
          'End Date': '2026-09-10', Served: 'yes',
        },
      ],
      mddsImportColumns,
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ endDate: '2026-09-10', served: true });
  });

  it('rejects a type outside the 4 enum values', () => {
    const { errors } = parseRows(
      [
        {
          Student: 'Bo', Class: 'Class A', Term: 'Christmas Term',
          Type: 'expulsion', Reason: 'x', Date: '2026-09-03', 'End Date': null, Served: null,
        },
      ],
      mddsImportColumns,
    );
    expect(errors).toEqual([
      { row: 2, message: 'Type: "expulsion" must be "merit", "demerit", "detention", or "suspension"' },
    ]);
  });

  it('rejects a reason over 500 characters', () => {
    const { errors } = parseRows(
      [
        {
          Student: 'Bo', Class: 'Class A', Term: 'Christmas Term',
          Type: 'merit', Reason: 'x'.repeat(501), Date: '2026-09-03', 'End Date': null, Served: null,
        },
      ],
      mddsImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'Reason: must be 500 characters or fewer' }]);
  });

  it('rejects an unparseable Served value', () => {
    const { errors } = parseRows(
      [
        {
          Student: 'Bo', Class: 'Class A', Term: 'Christmas Term',
          Type: 'detention', Reason: 'x', Date: '2026-09-03', 'End Date': null, Served: 'maybe',
        },
      ],
      mddsImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'Served: "maybe" must be true/false, yes/no, or 1/0' }]);
  });

  it('flags every missing required header via validateStructure', () => {
    const result = validateStructure([{ Student: 'Bo' }], mddsImportColumns);
    expect(result.ok).toBe(false);
    expect(result.missingHeaders).toEqual(['Class', 'Term', 'Type', 'Reason', 'Date']);
  });
});

// ─── Identity resolution ──────────────────────────────────────────────────

describe('buildMddsIdentityResolvers', () => {
  it('auto-resolves every column when each name has exactly one match', async () => {
    const row: MddsImportRow = {
      studentName: 'Bo Diddley', className: 'Class A', termName: 'Christmas Term',
      type: 'merit', reason: 'Helped out', date: '2026-09-03',
    };
    const { resolved, needsResolution } = await resolveIdentities([row], buildMddsIdentityResolvers(candidates));
    expect(needsResolution).toEqual([]);
    expect(resolved).toEqual([{ ...row, studentId: 'stu3', classId: 'cls1', termId: 'trm1' }]);
  });

  it('flags an ambiguous student name', async () => {
    const row: MddsImportRow = {
      studentName: 'Ada Lovelace', className: 'Class A', termName: 'Christmas Term',
      type: 'merit', reason: 'Helped out', date: '2026-09-03',
    };
    const { resolved, needsResolution } = await resolveIdentities([row], buildMddsIdentityResolvers(candidates));
    expect(resolved).toEqual([]);
    expect(needsResolution).toEqual([
      { column: 'Student', value: 'Ada Lovelace', matches: [{ id: 'stu1', label: 'Ada Lovelace' }, { id: 'stu2', label: 'Ada Lovelace' }] },
    ]);
  });

  it('flags a term name with no match', async () => {
    const row: MddsImportRow = {
      studentName: 'Bo Diddley', className: 'Class A', termName: 'Easter Term',
      type: 'merit', reason: 'Helped out', date: '2026-09-03',
    };
    const { needsResolution } = await resolveIdentities([row], buildMddsIdentityResolvers(candidates));
    expect(needsResolution).toEqual([{ column: 'Term', value: 'Easter Term', matches: [] }]);
  });
});

// ─── Business-rule validation ─────────────────────────────────────────────

describe('mddsValidationRules', () => {
  it('is empty — every §7 validation item is a single-cell format check, not a cross-field rule', () => {
    const row: MddsImportRow = {
      studentName: 'Bo', className: 'Class A', termName: 'Christmas Term',
      type: 'merit', reason: 'x', date: '2026-09-03',
    };
    const { valid, errors } = validateRows([row], mddsValidationRules);
    expect(errors).toEqual([]);
    expect(valid).toEqual([row]);
  });
});

// ─── Write shape ───────────────────────────────────────────────────────────

describe('buildMddsData', () => {
  const ctx = { institutionId: 'inst1', issuedBy: 'teacher1', issuedByName: 'Mr. Doe', issuedByRole: 'senior_teacher' };

  it('omits endDate and served entirely for a merit row, even if somehow present on the resolved row', () => {
    const row: ResolvedMddsImportRow = {
      studentName: 'Bo', className: 'Class A', termName: 'Christmas Term',
      type: 'merit', reason: 'Helped out', date: '2026-09-03',
      endDate: '2026-09-10', served: true,
      studentId: 'stu3', classId: 'cls1', termId: 'trm1',
    };
    const data = buildMddsData(row, ctx);
    expect(data).not.toHaveProperty('endDate');
    expect(data).not.toHaveProperty('served');
    expect(data).toMatchObject({
      institutionId: 'inst1', studentId: 'stu3', studentName: 'Bo',
      classId: 'cls1', className: 'Class A', termId: 'trm1', termName: 'Christmas Term',
      type: 'merit', reason: 'Helped out', date: '2026-09-03',
      issuedBy: 'teacher1', issuedByName: 'Mr. Doe', issuedByRole: 'senior_teacher',
    });
    expect(data.createdAt).toBeDefined();
  });

  it('includes served (defaulted false) and omits endDate when absent, for a suspension row', () => {
    const row: ResolvedMddsImportRow = {
      studentName: 'Bo', className: 'Class A', termName: 'Christmas Term',
      type: 'suspension', reason: 'Repeated disruption', date: '2026-09-03',
      studentId: 'stu3', classId: 'cls1', termId: 'trm1',
    };
    const data = buildMddsData(row, ctx);
    expect(data).not.toHaveProperty('endDate');
    expect(data.served).toBe(false);
  });

  it('includes both endDate and served when both are supplied on a detention row', () => {
    const row: ResolvedMddsImportRow = {
      studentName: 'Bo', className: 'Class A', termName: 'Christmas Term',
      type: 'detention', reason: 'Late to class', date: '2026-09-03',
      endDate: '2026-09-05', served: true,
      studentId: 'stu3', classId: 'cls1', termId: 'trm1',
    };
    const data = buildMddsData(row, ctx);
    expect(data.endDate).toBe('2026-09-05');
    expect(data.served).toBe(true);
  });
});
