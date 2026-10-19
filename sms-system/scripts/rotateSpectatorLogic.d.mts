// Types for rotateSpectatorLogic.mjs, so the TypeScript tests can import it.

export const MIN_PASSWORD_LENGTH: number;
export function maskEmail(email: unknown): string;
export function isSafeInstitutionId(id: unknown): boolean;
export function passwordProblem(password: unknown): string | null;
export function generatePassword(randomInt: (n: number) => number): string;
export type SpectatorCandidate = {
  uid: string;
  role?: string;
  mustChangePassword?: boolean;
  institutionId?: string;
  name?: string;
  email?: string;
};
export function pickSpectators(args: { users: SpectatorCandidate[]; authUids: Set<string> }): {
  picked: SpectatorCandidate[];
  skipped: { uid: string; reason: string }[];
};
