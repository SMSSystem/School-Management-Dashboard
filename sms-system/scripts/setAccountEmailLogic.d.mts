// Types for setAccountEmailLogic.mjs, so the TypeScript tests can import it.

export const ALLOWED_ROLES: string[];
export function normalizeEmail(raw: unknown): string | null;
export function maskEmail(email: unknown): string;
export type EmailChangePlan =
  | { action: 'blocked'; reason: string }
  | { action: 'nothing'; email: string }
  | { action: 'change'; email: string; authChange: boolean; docChange: boolean; clearCooldown: true };
export function planEmailChange(args: {
  role: unknown;
  docEmail: unknown;
  authEmail: unknown;
  newEmail: unknown;
}): EmailChangePlan;
