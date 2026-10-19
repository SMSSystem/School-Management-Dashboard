import { useReducer } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import {
  currentCursor,
  initialPageState,
  pageFetchLimit,
  pageReducer,
  trimPage,
  type PageAction,
  type PageState,
} from '@/lib/cursorPaging';
import { LIST_STALE_MS } from '@/lib/queryPolicies';

// Previous / Next paging over a Firestore query, one cached React Query entry
// per page. Going back to a page that is still fresh costs no reads; going
// forward reads it once. Pages hold Firestore snapshots (the cursor for the page
// after them), which can't be serialised, so they are marked meta.persist=false
// and kept out of the sessionStorage cache (lib/queryClient.ts): after a reload
// paging starts again at page 1.
//
// fetchPage receives the cursor to start after (null for the first page) and
// how many documents to ask for (one more than a page, see cursorPaging.ts); it
// should build `query(..., orderBy(...), startAfter(cursor), limit(n))`.

type Cursor = QueryDocumentSnapshot;

type PageData<T> = {
  rows: T[];
  hasMore: boolean;
  // The last SHOWN document: the next page starts after it.
  lastSnapshot: Cursor | null;
};

export type UseCursorPagesOptions<T> = {
  // Everything the query depends on (institution, filter, user). A change starts
  // paging over from page 1.
  queryKey: readonly unknown[];
  enabled?: boolean;
  pageSize: number;
  fetchPage: (cursor: Cursor | null, fetchLimit: number) => Promise<Cursor[]>;
  mapDoc: (snap: Cursor) => T;
  staleTime?: number;
};

function reducer(state: PageState<Cursor>, action: PageAction<Cursor>): PageState<Cursor> {
  return pageReducer(state, action);
}

export function useCursorPages<T>({
  queryKey,
  enabled = true,
  pageSize,
  fetchPage,
  mapDoc,
  staleTime = LIST_STALE_MS,
}: UseCursorPagesOptions<T>) {
  const queryClient = useQueryClient();
  const key = JSON.stringify(queryKey);
  const [state, dispatch] = useReducer(reducer, key, initialPageState<Cursor>);
  // State left over from a different list (the key changed) is simply not used.
  const view = state.key === key ? state : initialPageState<Cursor>(key);

  const query = useQuery<PageData<T>>({
    queryKey: [...queryKey, 'page', view.pageIndex],
    enabled,
    staleTime,
    meta: { persist: false },
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const snaps = await fetchPage(currentCursor(view), pageFetchLimit(pageSize));
      const { items, hasMore } = trimPage(snaps, pageSize);
      return { rows: items.map(mapDoc), hasMore, lastSnapshot: items[items.length - 1] ?? null };
    },
  });

  const data = query.data;
  // While the next page loads, `data` is still the previous page (placeholder).
  const settled = !!data && !query.isPlaceholderData;

  return {
    items: data?.rows ?? [],
    pageIndex: view.pageIndex,
    hasPrevious: view.pageIndex > 0,
    hasNext: settled && data.hasMore && data.lastSnapshot !== null,
    isLoading: query.isPending && enabled,
    isFetching: query.isFetching,
    isError: query.isError,
    // Re-reads the page on screen. Only for an error state, where there are no
    // other pages to disagree with it; use refresh() to bring fresh data in.
    refetch: () => void query.refetch(),
    // Starts the list over: drops EVERY cached page and returns to page 1. A page
    // is cached by its number, not its cursor, so re-reading just the current page
    // would leave later cached pages built on the old cursor (repeated or skipped
    // rows once new entries have arrived).
    // Removed (not reset): resetting would first re-read the page on screen, which
    // is about to be replaced by page 1.
    refresh: () => {
      queryClient.removeQueries({ queryKey });
      dispatch({ type: 'reset', key });
    },
    goNext: () => {
      if (settled && data.hasMore && data.lastSnapshot) {
        dispatch({ type: 'next', key, cursor: data.lastSnapshot });
      }
    },
    goPrevious: () => dispatch({ type: 'previous', key }),
    reset: () => dispatch({ type: 'reset', key }),
  };
}
