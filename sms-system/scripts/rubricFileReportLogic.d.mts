// Types for rubricFileReportLogic.mjs, so the TypeScript tests can import it.

export const SOFT_SCHOOL_FILE_LIMIT: number;
export const FILE_TYPES: Record<string, string>;

export type RubricFileField = { size?: number; mimeType?: string } | undefined;
export type RubricSummary = {
  rubrics: number;
  withFile: number;
  totalBytes: number;
  largestBytes: number;
  shareOfSoftLimit: number;
  overSoftLimit: boolean;
  byType: Record<string, number>;
};

export function fileType(mimeType: string | undefined): string;
export function summariseRubrics(files: RubricFileField[]): RubricSummary;
export function formatBytes(bytes: number): string;

export type ReportOptions = {
  keyPath: string | null;
  institution: string | null;
  read: boolean;
  maxReads: number;
};
export function parseReportArgs(
  argv: string[],
  defaultMaxReads: number,
):
  | { opts: ReportOptions; help?: undefined; error?: undefined }
  | { help: true; opts?: undefined; error?: undefined }
  | { error: string; opts?: undefined; help?: undefined };
