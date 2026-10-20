import { z } from '@/lib/zod';

// The fields of a gradebook column, checked by both the Add column and the Edit column dialogs.
export const columnSchema = z.object({
  label: z.string().min(1, 'Label is required.').max(100),
  assessmentType: z.enum(['coursework', 'exam'] as const, {
    error: 'Type is required.',
  }),
  maxScore: z.number().int().min(1, 'Max score must be at least 1.'),
  columnWeight: z.number().int().min(0).max(100),
  date: z.string().optional(),
});

export type ColumnFormData = z.infer<typeof columnSchema>;
