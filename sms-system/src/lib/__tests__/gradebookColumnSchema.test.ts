import { describe, expect, it } from 'vitest';
import { columnSchema } from '../../scenes/(dashboard)/list/gradebook/columnSchema';
import creationRaw from '../../scenes/(dashboard)/list/gradebook/ColumnCreationModal.tsx?raw';
import editRaw from '../../scenes/(dashboard)/list/gradebook/ColumnEditModal.tsx?raw';

// The Add column and Edit column dialogs each carried the same zod schema; it now lives in gradebook/columnSchema.ts.
// These pin what it accepts and refuses, and that both dialogs use it.

const lf = (s: string) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const valid = { label: 'Quiz 1', assessmentType: 'coursework', maxScore: 20, columnWeight: 10 };
const messageFor = (input: unknown) => {
  const r = columnSchema.safeParse(input);
  return r.success ? null : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('the gradebook column schema', () => {
  it('accepts a column with or without a date', () => {
    expect(columnSchema.safeParse(valid).success).toBe(true);
    expect(columnSchema.safeParse({ ...valid, date: '2026-10-01', assessmentType: 'exam' }).success).toBe(true);
  });

  it('asks for a label of 1 to 100 characters', () => {
    expect(messageFor({ ...valid, label: '' })).toEqual(['label: Label is required.']);
    expect(columnSchema.safeParse({ ...valid, label: 'x'.repeat(100) }).success).toBe(true);
    expect(columnSchema.safeParse({ ...valid, label: 'x'.repeat(101) }).success).toBe(false);
  });

  it('asks for a type that is coursework or exam', () => {
    expect(messageFor({ ...valid, assessmentType: 'quiz' })).toEqual(['assessmentType: Type is required.']);
    expect(messageFor({ ...valid, assessmentType: undefined })).toEqual(['assessmentType: Type is required.']);
  });

  it('asks for a whole max score of at least 1', () => {
    expect(messageFor({ ...valid, maxScore: 0 })).toEqual(['maxScore: Max score must be at least 1.']);
    expect(columnSchema.safeParse({ ...valid, maxScore: 1.5 }).success).toBe(false);
  });

  it('asks for a whole weight from 0 to 100', () => {
    expect(columnSchema.safeParse({ ...valid, columnWeight: 0 }).success).toBe(true);
    expect(columnSchema.safeParse({ ...valid, columnWeight: 100 }).success).toBe(true);
    expect(columnSchema.safeParse({ ...valid, columnWeight: 101 }).success).toBe(false);
    expect(columnSchema.safeParse({ ...valid, columnWeight: -1 }).success).toBe(false);
    expect(columnSchema.safeParse({ ...valid, columnWeight: 2.5 }).success).toBe(false);
  });
});

describe('the Add and Edit column dialogs', () => {
  it('both use the shared schema and define none of their own', () => {
    for (const raw of [creationRaw, editRaw]) {
      const src = lf(raw);
      expect(src).toContain("import { columnSchema, type ColumnFormData } from './columnSchema';");
      expect(src).toContain('zodResolver(columnSchema)');
      expect(src).not.toContain('z.object(');
    }
  });
});
