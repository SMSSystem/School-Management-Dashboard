import { describe, it, expect } from 'vitest';
import { computePossibleDuplicates } from '../registrationDuplicates';

function reg(
  overrides: Partial<{
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    academicYearName: string;
    possibleDuplicate: boolean;
    status: 'pending' | 'reviewed' | 'converted' | 'rejected';
  }>,
) {
  return {
    id: overrides.id ?? 'r1',
    institutionId: 'inst1',
    academicYearId: 'y1',
    academicYearName: overrides.academicYearName ?? '2026-2027',
    status: overrides.status ?? ('pending' as const),
    submittedAt: '2026-01-01T00:00:00.000Z',
    possibleDuplicate: overrides.possibleDuplicate ?? false,
    student: {
      lastName: overrides.lastName ?? 'Smith',
      firstName: overrides.firstName ?? 'Jane',
      requestedClass: 'Grade 7',
      dateOfBirth: overrides.dateOfBirth ?? '2015-05-01',
      gender: 'Female' as const,
      email: 'jane.smith@example.com',
    },
    mother: null,
    father: null,
  };
}

describe('computePossibleDuplicates', () => {
  it('flags no duplicates when nothing matches', () => {
    const result = computePossibleDuplicates([reg({ id: 'r1' })], []);
    expect(result).toEqual([]);
  });

  it('flags two registrations with the same name and DOB in the same year', () => {
    const regs = [reg({ id: 'r1' }), reg({ id: 'r2' })];
    const result = computePossibleDuplicates(regs, []);
    expect(result).toEqual(
      expect.arrayContaining([
        { id: 'r1', possibleDuplicate: true },
        { id: 'r2', possibleDuplicate: true },
      ]),
    );
  });

  it('is case-insensitive on name matching', () => {
    const regs = [
      reg({ id: 'r1', firstName: 'jane', lastName: 'SMITH' }),
      reg({ id: 'r2', firstName: 'Jane', lastName: 'Smith' }),
    ];
    const result = computePossibleDuplicates(regs, []);
    expect(result.map((u) => u.id).sort()).toEqual(['r1', 'r2']);
  });

  it('does not flag same name with different academic years', () => {
    const regs = [reg({ id: 'r1', academicYearName: '2025-2026' }), reg({ id: 'r2', academicYearName: '2026-2027' })];
    expect(computePossibleDuplicates(regs, [])).toEqual([]);
  });

  it('flags a match against an existing student', () => {
    const result = computePossibleDuplicates(
      [reg({ id: 'r1' })],
      [{ firstName: 'Jane', lastName: 'Smith', dateOfBirth: '2015-05-01' }],
    );
    expect(result).toEqual([{ id: 'r1', possibleDuplicate: true }]);
  });

  it('does not re-emit an update when the computed value already matches stored state', () => {
    const result = computePossibleDuplicates(
      [reg({ id: 'r1', possibleDuplicate: true })],
      [{ firstName: 'Jane', lastName: 'Smith', dateOfBirth: '2015-05-01' }],
    );
    expect(result).toEqual([]);
  });

  it('does not flag a fresh resubmission against a rejected registration', () => {
    const regs = [reg({ id: 'r1', status: 'rejected' }), reg({ id: 'r2' })];
    const result = computePossibleDuplicates(regs, []);
    expect(result.find((u) => u.id === 'r2')).toBeUndefined();
  });

  it('still flags a resubmission against a converted registration', () => {
    const regs = [reg({ id: 'r1', status: 'converted' }), reg({ id: 'r2' })];
    const result = computePossibleDuplicates(regs, []);
    expect(result).toEqual(
      expect.arrayContaining([
        { id: 'r1', possibleDuplicate: true },
        { id: 'r2', possibleDuplicate: true },
      ]),
    );
  });

  it('clears an existing possibleDuplicate flag once the matching registration is rejected', () => {
    const regs = [reg({ id: 'r1', status: 'rejected', possibleDuplicate: true }), reg({ id: 'r2', possibleDuplicate: true })];
    const result = computePossibleDuplicates(regs, []);
    expect(result).toEqual([{ id: 'r2', possibleDuplicate: false }]);
  });
});
