// Types for pruneOrphanSubmissionsLogic.mjs, so the TypeScript tests can import it.

export type OrphanOptions = {
  keyPath: string | null;
  institution: string | null;
  live: boolean;
};
export type OrphanSummary = {
  submissions: number;
  attempts: number;
  tombstones: number;
  bytes: number;
};

export function parseOrphanArgs(
  argv: string[],
):
  | { opts: OrphanOptions; help?: undefined; error?: undefined }
  | { help: true; opts?: undefined; error?: undefined }
  | { error: string; opts?: undefined; help?: undefined };
export function summariseOrphan(p: {
  submissionSizes: (number | undefined)[];
  attemptSizes: (number | undefined)[];
  tombstones: number;
}): OrphanSummary;
export function totalOrphans(
  summaries: OrphanSummary[],
): OrphanSummary & { assignments: number };
