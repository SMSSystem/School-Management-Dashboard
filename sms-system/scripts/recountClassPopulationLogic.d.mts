// Types for recountClassPopulationLogic.mjs, so the TypeScript tests can import it.

export type Counts = { male: number; female: number; unspecified: number };
export type StudentRow = { classId?: unknown; classIds?: unknown; gender?: unknown; status?: unknown };
export type ClassRow = { id: string; name?: string; population?: unknown; populationBaseline?: unknown };
export type RecountRow = { id: string; name?: string; counted: Counts; stored: Partial<Counts> | null; hadBaseline: boolean; changed: boolean };

export function classIdsOf(student: StudentRow): string[];
export function bucketOf(gender: unknown): keyof Counts;
export function tallyPopulation(students: StudentRow[], classIds: Iterable<string>): Map<string, Counts>;
export function planRecount(classes: ClassRow[], tally: Map<string, Counts>): RecountRow[];
