// How the Report Cards and Progress Reports tables show the day a document was generated: a
// Firestore Timestamp (or nothing yet, for a document still being written) as "October 19, 2026".
type HasToDate = { toDate?: () => Date } | null | undefined;

export function formatGeneratedDate(generatedAt: HasToDate): string {
  return (
    generatedAt?.toDate?.()?.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }) ?? "—"
  );
}
