// Types for setupQaInstitutionLogic.mjs, so the TypeScript tests can import it.

export const SETUP_ALLOWED_NAMES: string[];
export const SPEC07_NAMES: { year: string; subject: string; class: string };
export const BASE_CLASS_NAME: string;
export const SCHOOL_WEEK_DAYS: number[];
export const FIXED_IDS: { year: string; term: string; department: string; class: string };
export type AccountKind = { key: string; role: string; code: string; firstName: string; lastName: string; envPrefix: string };
export const ACCOUNT_KINDS: AccountKind[];
export type QaAccount = AccountKind & { uid: string; email: string; name: string };
export function isValidEmailPrefix(prefix: unknown): boolean;
export function qaAccounts(prefix: string): QaAccount[];
export function academicYearAround(todayISO: string): { name: string; startDate: string; endDate: string };
export function checkSetupTarget(args: { institutionId?: string | null; confirmName?: string | null; exists?: boolean; storedName?: string }): string[];
export const SYSTEM_INSTITUTION_IDS: string[];
export type Snapshot = {
  years: { id: string; name: string }[];
  terms: { id: string; name: string; academicYearId?: string }[];
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  slots: { id: string; classId?: string; subjectId?: string; termId?: string }[];
};
export function findLeftovers(snapshot: Snapshot, institutionId: string): { remove: { path: string; label: string }[]; unexpected: string[] };
export function buildQaPlan(args: {
  institutionId: string;
  prefix: string;
  departmentName: string;
  termName: string;
  todayISO: string;
  now: Date;
}): { items: { path: string; data: Record<string, unknown> }[]; accounts: QaAccount[]; year: { name: string; startDate: string; endDate: string } };
export const ACADEMIC_FIELDS: { calendarMode: 'academic_year' };
export function envLines(args: {
  institutionName: string;
  institutionId: string;
  prefix: string;
  departmentName: string;
  termName: string;
  issued: Record<string, string | undefined>;
}): string[];
export function setupPhrase(count: number, institutionId: string): string;
export type SetupOptions = {
  institutionId: string | null;
  confirmName: string | null;
  project: string | null;
  keyPath: string | null;
  emailPrefix: string | null;
  departmentName: string;
  termName: string;
  live: boolean;
  help: boolean;
};
export function parseSetupArgs(argv: string[]): { opts: SetupOptions } | { error: string };
