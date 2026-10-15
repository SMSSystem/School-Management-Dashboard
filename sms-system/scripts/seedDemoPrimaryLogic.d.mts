// Types for seedDemoPrimaryLogic.mjs, so the TypeScript tests can import it.

export type Item = { path: string; data: Record<string, unknown> };
export type Person = {
  uid: string;
  role: string;
  firstName: string;
  lastName: string;
  name: string;
  gender: string;
  email: string;
  phone: string;
  [key: string]: unknown;
};
export type People = {
  admin: Person;
  spectator: Person;
  seniors: Person[];
  regulars: Person[];
  students: (Person & { grade: number; section: string; classId: string; houseKey: string; dateOfBirth: string })[];
  parents: Person[];
  links: { parentUid: string; studentUid: string; relationship: string }[];
  familyCount: number;
};
export type Subject = {
  id: string;
  name: string;
  days: number[];
  classes: { id: string; grade: number; section: string; name: string }[];
  teachers: Person[];
  assistant: Person | null;
  wholeSchool: boolean;
  [key: string]: unknown;
};
export const SCHOOL: { name: string; emailDomain: string; [key: string]: string };
export const CREATED_BY: string;
export const STUDENT_COUNT: number;
export const GRADES: number[];
export const SECTIONS: string[];
export const YEAR: { name: string; startDate: string; endDate: string };
export const TERMS: { number: number; name: string; startDate: string; endDate: string }[];
export const CONTENT_TERM: { number: number; name: string; startDate: string; endDate: string };
export const HOUSES: { key: string; name: string; description: string }[];
export const CLASSES: { id: string; grade: number; section: string; name: string }[];
export const SUBJECTS: { name: string; dept: string; days: number[]; time: string; teachers: string[]; minGrade: number; assistant?: string }[];
export const GRADEBOOK_COLUMNS: { id: string; label: string; assessmentType: string; maxScore: number; columnWeight: number; date: string }[];
export const LOGIN_UIDS: string[];
export const DATED_PHASES: string[];
export function rng(seed: string): () => number;
export function toISO(d: Date): string;
export function addDays(iso: string, n: number): string;
export function dayOfWeek(iso: string): number;
export function jamaicanPublicHolidays(year: number): { name: string; date: string }[];
export function yearHolidays(): { name: string; date: string }[];
export function schoolDays(through: string): string[];
export function countSchoolDays(startISO: string, endISO: string): number;
export function buildPeople(): People;
export function buildSubjects(people: People): Subject[];
export function teacherForClass(subject: Subject, cls: { id: string }): Person;
export function supervisorOf(people: People, cls: { grade: number; section: string }): Person;
export function classId(grade: number, section: string): string;
export function className(grade: number, section: string): string;
export function subjectId(name: string): string;
export function academicYearId(institutionId: string): string;
export function termId(institutionId: string, n: number): string;
export function gradebookId(clsId: string, subjId: string, institutionId: string): string;
export function buildStaticPlan(institutionId: string, todayISO: string): { people: People; subjects: Subject[]; items: Item[] };
export function generalRegisters(
  students: { uid: string; name: string }[],
  clsId: string,
  date: string,
): { AM: Record<string, { state: string; studentName: string; reason?: string }>; PM: Record<string, { state: string; studentName: string; reason?: string }> };
export function buildGeneralAttendance(institutionId: string, people: People, through: string): Item[];
export function buildSubjectAttendance(institutionId: string, people: People, subjects: Subject[], through: string): Item[];
export function buildAttendanceSummaries(institutionId: string, people: People, through: string): Item[];
export function buildAssignments(institutionId: string, subjects: Subject[], through: string): Item[];
export function buildLessonNotes(institutionId: string, subjects: Subject[], through: string): Item[];
export function buildResults(institutionId: string, people: People, subjects: Subject[], through: string): Item[];
export function buildDatedPlan(institutionId: string, people: People, subjects: Subject[], through: string): Record<string, Item[]>;
export function clampThrough(requested: string | null | undefined, todayISO: string): string;
export function contentThrough(through: string): string;
export function termStatus(term: { startDate: string; endDate: string }, todayISO: string): 'upcoming' | 'active' | 'completed';
export function isSafePath(path: unknown, institutionId: unknown): boolean;
export function maskEmail(email: unknown): string;
