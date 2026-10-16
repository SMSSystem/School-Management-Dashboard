// Types for renameInstitutionLogic.mjs, so the TypeScript tests can import it.

export const NON_INSTITUTION_IDS: string[];
export const MAX_NAME_LENGTH: number;
export const BATCH_SIZE: number;
export function normalizeName(raw: unknown): string | null;
export type InstitutionRenamePlan =
  | { action: 'blocked'; reason: string }
  | { action: 'rename'; id: string; from: string; to: string; nameChange: boolean };
export function planInstitutionRename(args: {
  institutions: Array<{ id: string; name?: unknown }>;
  fromName: unknown;
  toName: unknown;
  institutionId?: string | null;
}): InstitutionRenamePlan;
export function pickSnapshotsToUpdate<T extends { institutionName?: unknown }>(docs: T[], fromName: unknown): T[];
export function directoryNeedsUpdate(directoryDoc: { name?: unknown } | null | undefined, toName: unknown): boolean;
export function portalNeedsUpdate(settingsDoc: { portalName?: unknown } | null | undefined, portalName: unknown): boolean;
export function chunk<T>(list: T[], size?: number): T[][];
