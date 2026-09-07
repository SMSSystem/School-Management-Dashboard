import { z } from 'zod';

// Shared homeroom Room/Building field validation — AdminCreateUserForm.tsx
// and TeacherForm.tsx both validate a senior teacher's homeroom fields
// against the same rules, so this is the single source of truth for the
// max-length and required-when-a-class-is-assigned rules. Each form still
// decides for itself *when* the required check applies (AdminCreateUserForm
// also gates on role, since it handles multiple roles in one schema;
// TeacherForm is teacher-only and doesn't need that extra gate).
export const homeroomRoomField = z.string().max(50, 'Room must be 50 characters or less.').optional();
export const homeroomBuildingField = z.string().max(50, 'Building must be 50 characters or less.').optional();

export function addHomeroomRoomRequiredIssue(ctx: z.RefinementCtx): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['homeroomRoom'],
    message: 'Room is required when a homeroom class is assigned.',
  });
}
