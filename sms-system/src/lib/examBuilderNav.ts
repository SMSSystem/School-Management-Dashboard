// Which question the builder shows, and where the choice goes after an edit (docs: the builder is a carousel, one editor at
// a time). The choice is a question's id, not its place in the list, so moving a question keeps it chosen; these rules say
// what is chosen after a delete, a copy or an import. Pure; works on anything that has an id.

type Item = { id: string };

/** The place of the chosen question in the list, or -1 when none is chosen or it is gone. */
export function indexOfId(list: readonly Item[], id: string | null | undefined): number {
  return id ? list.findIndex((q) => q.id === id) : -1;
}

/** The place of the question to show: the chosen one, else the first (0 for an empty list). */
export function activeIndex(list: readonly Item[], id: string | null | undefined): number {
  const at = indexOfId(list, id);
  return at >= 0 ? at : 0;
}

/** The id `delta` places from the chosen question, kept inside the list; null for an empty list. */
export function stepId(list: readonly Item[], id: string | null | undefined, delta: number): string | null {
  if (list.length === 0) return null;
  const to = Math.min(Math.max(activeIndex(list, id) + delta, 0), list.length - 1);
  return list[to].id;
}

/** What to show after the question `id` is deleted: the one that took its place, else the one before, else nothing. */
export function idAfterDelete(list: readonly Item[], id: string): string | null {
  const at = indexOfId(list, id);
  if (at < 0) return list[0]?.id ?? null;
  return list[at + 1]?.id ?? list[at - 1]?.id ?? null;
}

/** The first question of `after` that `before` did not have: the copy that was made, or the first one imported. */
export function firstNewId(before: readonly Item[], after: readonly Item[]): string | null {
  const known = new Set(before.map((q) => q.id));
  return after.find((q) => !known.has(q.id))?.id ?? null;
}

const LABEL_MAX = 40;

/** A question as the rail and the sheet name it: its first words on one line, or a note that it has no text yet. */
export function questionLabel(question: { text: string }): string {
  const text = question.text.replace(/\s+/g, ' ').trim();
  if (text === '') return '(no text yet)';
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX).trimEnd()}…` : text;
}
