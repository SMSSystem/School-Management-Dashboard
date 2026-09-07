import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

/**
 * Builds a Record<docId, T> from a Firestore query snapshot's docs, applying
 * `mapper` to each doc's data. Shared shape behind the "look up a related
 * collection and index it by id for display" effects on the Students and
 * Teachers list pages, which previously each hand-rolled the same
 * accumulation loop for their own (divergent) per-doc shape.
 */
export function mapDocsById<T>(
  docs: QueryDocumentSnapshot<DocumentData>[],
  mapper: (data: DocumentData, id: string) => T,
): Record<string, T> {
  const map: Record<string, T> = {};
  docs.forEach((d) => { map[d.id] = mapper(d.data(), d.id); });
  return map;
}
