// Types for deleteInstitutionLogic.mjs, so the TypeScript tests can import it.

export type CollectionTree = { [name: string]: CollectionTree };

export const SYSTEM_INSTITUTION_IDS: string[];
export const BATCH_LIMIT: number;
export const DEFAULT_BUDGET: number;
export const DEFAULT_COUNT_READ_CAP: number;
export const INSTITUTION_TREE: CollectionTree;
export const USER_SUBCOLLECTIONS: string[];
export const LEGACY_TREE: CollectionTree;
export function isValidInstitutionId(id: unknown): boolean;
export function collectionPaths(tree: CollectionTree, prefix?: string): string[];
export function rulesCollectionPaths(rulesText: string): string[];
export function phaseOrder(): string[];
export function checkTarget(args: { institutionId?: string | null; confirmName?: string | null; exists?: boolean; storedName?: string }): string[];
export type RosterUser = { uid: string; role?: string; institutionId?: string };
export function rosterProblems(users: RosterUser[], institutionId: string): string[];
export function roleCounts(users: RosterUser[]): Record<string, number>;
export function confirmationPhrase(total: number, institutionId: string): string;
export function estimateRuns(totalDeletes: number, budget: number): number;
export type Budget = { limit: number; spend: (n: number) => void; spent: () => number; remaining: () => number; exhausted: () => boolean };
export function createBudget(limit: number): Budget;
export type PhaseStatus = { status: 'pending' | 'in_progress' | 'complete'; completedAt?: string };
export type DeleteCheckpoint = {
  institutionId: string;
  name: string;
  createdAt: string;
  uids: string[] | null;
  progress: Record<string, { deleted: number }>;
  phases: Record<string, PhaseStatus>;
};
export function newCheckpoint(args: { institutionId: string; name: string }): DeleteCheckpoint;
export function resumeCheckpoint(saved: DeleteCheckpoint, args: { institutionId: string; name?: string }): { problems: string[]; checkpoint: DeleteCheckpoint | null };
export function checkpointPathFor(institutionId: string): string;
export function isComplete(checkpoint: DeleteCheckpoint): boolean;
export type DeleteOptions = {
  institutionId: string | null;
  confirmName: string | null;
  project: string | null;
  keyPath: string | null;
  databaseUrl: string | null;
  budget: number;
  maxReads: number;
  live: boolean;
  verify: boolean;
  listMatches: string | null;
  help: boolean;
};
export function parseDeleteArgs(argv: string[]): { opts: DeleteOptions } | { error: string };
