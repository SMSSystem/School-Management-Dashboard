// Types for versionLogic.mjs, so the TypeScript tests can import it.

export const REPO_URL: string;
export const SEMVER_RE: RegExp;
export const BUMP_KINDS: readonly ['major', 'minor', 'patch'];
export type BumpKind = 'major' | 'minor' | 'patch';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string | null;
}

export function parseVersion(text: unknown): ParsedVersion | null;
export function compareVersions(a: string, b: string): -1 | 0 | 1;
export function bumpVersion(version: string, kind: BumpKind | string): string;

export interface ChangelogEntry {
  anchor: string | null;
  open: boolean;
  version: string;
  date: string;
  title: string;
  body: string;
  /** major number of the "## N.x" heading above the entry */
  era: number | null;
  index: number;
}

export interface ParsedChangelog {
  currentVersion: string | null;
  lastUpdated: string | null;
  unreleased: string | null;
  eras: number[];
  entries: ChangelogEntry[];
}

export function normalizeEol(text: string): string;
export function parseChangelog(raw: string): ParsedChangelog;
export function extractEntry(raw: string, version: string): string | null;
export function renderPrLinks(prs: number[] | undefined, repoUrl?: string): string;
export function renderEntry(input: {
  version: string;
  date: string;
  title: string;
  prs?: number[];
  body: string;
  open?: boolean;
  repoUrl?: string;
}): string;
export function renderHeaderLine(version: string, date: string): string;
export function applyRelease(
  raw: string,
  input: { version: string; date: string; title: string; prs?: number[]; repoUrl?: string },
): string;

export interface RetroVersion {
  version: string;
  commit: string;
  date: string;
  prs: number[];
}

export function checkConsistency(input: {
  packageJson: { version?: string } | null;
  packageLock: { version?: string; packages?: Record<string, { version?: string }> } | null;
  changelog: string;
  retroVersions?: RetroVersion[];
  today?: string;
}): string[];

export function isShippedPath(path: string): boolean;
export function checkAgainstBase(input: {
  version: string;
  baseVersion: string;
  changedPaths: string[];
  tagExists: boolean;
}): string[];

export interface RetroTagRow {
  tag: string;
  commit: string;
  date: string;
  action: 'create' | 'skip' | 'conflict';
}
export function planRetroTags(retroVersions: RetroVersion[], existingTags: Map<string, string>): RetroTagRow[];
