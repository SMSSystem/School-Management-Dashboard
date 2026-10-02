// Pure paging state for cursor-paginated Firestore lists (hooks/useCursorPages.ts
// is the thin React layer on top). Firestore has no offsets, so a page is
// reached by starting after the last document of the previous one:
// cursors[i] is what page i starts after (null for the first page).

export type PageState<C> = {
  // Identifies the query this state belongs to (institution, category, ...).
  // A different key means a different list, so paging starts over.
  key: string;
  pageIndex: number;
  cursors: (C | null)[];
};

export type PageAction<C> =
  | { type: 'next'; key: string; cursor: C }
  | { type: 'previous'; key: string }
  | { type: 'reset'; key: string };

export function initialPageState<C>(key: string): PageState<C> {
  return { key, pageIndex: 0, cursors: [null] };
}

export function pageReducer<C>(state: PageState<C>, action: PageAction<C>): PageState<C> {
  // An action for another list never applies to this one's pages.
  const base = state.key === action.key ? state : initialPageState<C>(action.key);
  switch (action.type) {
    case 'reset':
      return initialPageState<C>(action.key);
    case 'next': {
      const cursors = base.cursors.slice(0, base.pageIndex + 1);
      cursors[base.pageIndex + 1] = action.cursor;
      return { ...base, pageIndex: base.pageIndex + 1, cursors };
    }
    case 'previous':
      return base.pageIndex === 0 ? base : { ...base, pageIndex: base.pageIndex - 1 };
  }
}

// What the current page starts after (null for the first page).
export function currentCursor<C>(state: PageState<C>): C | null {
  return state.cursors[state.pageIndex] ?? null;
}

// A page is fetched with ONE extra document: if it comes back, there is a next
// page (so Next is never offered for an empty page), and it is not shown.
export function pageFetchLimit(pageSize: number): number {
  return pageSize + 1;
}

export function trimPage<T>(fetched: T[], pageSize: number): { items: T[]; hasMore: boolean } {
  return { items: fetched.slice(0, pageSize), hasMore: fetched.length > pageSize };
}
