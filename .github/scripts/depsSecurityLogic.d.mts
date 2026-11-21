// Types for depsSecurityLogic.mjs, for the tests.

export type AuditReport = {
  error?: unknown;
  metadata?: unknown;
  vulnerabilities?: Record<
    string,
    {
      severity: string;
      isDirect?: boolean;
      via?: (string | { title?: string; severity?: string; url?: string })[];
      nodes?: string[];
      fixAvailable?:
        | boolean
        | { name: string; version: string; isSemVerMajor?: boolean };
    }
  >;
};

export type Lockfile = {
  packages?: Record<string, { version?: string; dev?: boolean }>;
};

export type FixedPackage = {
  name: string;
  severity: string;
  direct: boolean;
  titles: string[];
  version: string;
  dev: boolean;
};

export type RemainingPackage = {
  name: string;
  severity: string;
  reason: string;
};

export function auditError(report: unknown): boolean;
export function vulnerabilityCount(report: AuditReport): number;
export function fixedPackages(
  before: AuditReport,
  after: AuditReport,
  lockAfter: Lockfile,
): FixedPackage[];
export function remainingPackages(after: AuditReport): RemainingPackage[];
export function securityBullets(fixed: FixedPackage[]): string[];
export function addUnreleasedBullets(raw: string, bullets: string[]): string;
export function prBody(input: {
  fixed: FixedPackage[];
  remaining: RemainingPackage[];
  checks: Record<string, boolean>;
}): string;
