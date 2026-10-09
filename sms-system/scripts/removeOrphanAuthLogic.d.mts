// Types for removeOrphanAuthLogic.mjs, so the TypeScript tests can import it.

export const MIN_AGE_MS: number;
export function maskEmail(email: unknown): string;
export type AuthUserLite = { uid: string; email?: string; creationTime?: string };
export function pickOrphans(args: {
  authUsers: AuthUserLite[];
  existingUids: Set<string>;
  nowMs: number;
  onlyUid?: string | null;
  minAgeMs?: number;
}): { picked: AuthUserLite[]; skipped: { uid: string; reason: string }[] };
