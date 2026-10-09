// Types for migrateLessonNoteFilesLogic.mjs, so the TypeScript tests can import it.

export type NoteLike = {
  hasAttachment?: unknown;
  attachments?: unknown;
  attachmentFileName?: unknown;
  attachmentMimeType?: unknown;
  attachmentSize?: unknown;
  [key: string]: unknown;
};
export type LegacyFile = { fileName?: unknown; mimeType?: unknown; size?: unknown } | null;
export type MigrationPlan =
  | { action: 'already' }
  | { action: 'no-file' }
  | { action: 'missing-file'; reason: string }
  | {
      action: 'migrate';
      update: {
        attachments: { id: string; fileName: string; mimeType: string; size: number }[];
        attachmentIds: string[];
      };
    };

export const LEGACY_FILE_ID: string;
export const LEGACY_FIELDS: string[];
export function planNoteMigration(note: NoteLike, legacyFile: LegacyFile): MigrationPlan;
export function legacyFieldsToDrop(note: NoteLike): string[];
export function tally(outcomes: string[]): {
  migrate: number;
  already: number;
  'no-file': number;
  'missing-file': number;
  dropLegacy: number;
};
