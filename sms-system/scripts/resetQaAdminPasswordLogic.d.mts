// Types for resetQaAdminPasswordLogic.mjs, so the TypeScript tests can import it.

export const QA_INSTITUTION_NAMES: string[];
export const MIN_PASSWORD_LENGTH: number;
export function maskEmail(email: unknown): string;
export function isQaInstitutionName(name: unknown): boolean;
export function passwordProblem(password: unknown): string | null;
export type AdminResetPlan =
  | { kind: 'refuse' | 'no-institution' | 'ambiguous' | 'no-admin'; reason: string }
  | {
      kind: 'ready';
      institutionId: string;
      resettable: string[];
      orphaned: string[];
      recreatable: string[];
      blocked: { uid: string; reason: string }[];
    };
export function planAdminReset(args: {
  name: string;
  institutions: { id: string }[];
  admins: { uid: string; email?: string }[];
  authUids: Set<string>;
  recreate?: boolean;
  emailOwners?: Map<string, string>;
}): AdminResetPlan;
