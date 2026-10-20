// Types for removeOrphanAuthLogic.mjs, so the TypeScript tests can import it.

export const MIN_AGE_MS: number;
export const MIN_ALLOWED_DELETIONS: number;
export const MAX_DELETION_SHARE: number;
export function maskEmail(email: unknown): string;
export type AuthUserLite = { uid: string; email?: string; creationTime?: string };
export function pickOrphans(args: {
  authUsers: AuthUserLite[];
  existingUids: Set<string>;
  nowMs: number;
  onlyUid?: string | null;
  minAgeMs?: number;
}): { picked: AuthUserLite[]; skipped: { uid: string; reason: string }[] };
export function checkDeletionSafety(args: {
  authCount: number;
  userDocCount: number;
  pickedCount: number;
  allowLarge?: boolean;
}): string | null;
