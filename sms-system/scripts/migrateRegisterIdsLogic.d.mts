// Types for migrateRegisterIdsLogic.mjs, so the TypeScript tests can import it.

type Data = Record<string, unknown>;
type CollectionName = "generalAttendance" | "subjectAttendance";

export const COLLECTION_IDS: Record<
  CollectionName,
  (data: Data) => string | null
>;
export function planMigration(
  collection: CollectionName,
  rows: { id: string; data: Data }[],
): {
  moves: { from: string; to: string }[];
  conflicts: { fixedId: string; documentIds: string[] }[];
  alreadyFixed: number;
  missingKey: string[];
};
export function withinBudget(totalDocuments: number, maxReads: number): boolean;
export function moveRegister(
  db: unknown,
  collectionRef: unknown,
  move: { from: string; to: string },
  snapshot: unknown,
): Promise<void>;
