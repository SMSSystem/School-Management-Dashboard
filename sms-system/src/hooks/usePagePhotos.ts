import { useEffect, useMemo, useRef, useState } from "react";
import { USE_MOCK } from "@/lib/data";
import { fetchUserPhotoUrlCached, refreshUserPhotoUrl } from "@/lib/userPhoto";
import { hasNoPhoto } from "@/lib/userPhotoKeys";

// A photo read that failed is tried again after this long, at most MAX_PHOTO_TRIES times in all: a hiccup should not
// leave a row on its initial for the rest of the session, and a read that keeps failing (a rule refusal) must not be
// repeated on every render.
const PHOTO_RETRY_AFTER_MS = 60_000;
const MAX_PHOTO_TRIES = 3;

/**
 * The profile photos for the rows on the current page of the Students or Teachers list.
 *
 * Bounded per-page photo fetch (PHOTO_UPLOAD_SPEC.md §List-Table Thumbnails): fetches at most PAGE_SIZE new ids per
 * page view, never more, regardless of institution size — the requestedPhotoUids ref (not state) tracks what's already
 * been requested so page navigation only ever adds to the cache, never re-fetches an already-resolved uid. getDoc, not
 * onSnapshot — 20 extra real-time listeners per page view would be worse than accepting the cache going stale until a
 * remount.
 *
 * `rows` is the current page, `idOf` and `institutionOf` read a row's user id and institution (module-level functions,
 * so the effect below re-runs only when the page changes), and `allUsers` is the shared users list, whose `hasPhoto`
 * flag keeps the photo of a person with none from being read at all.
 */
export function usePagePhotos<Row>(
  rows: Row[],
  idOf: (row: Row) => string,
  institutionOf: (row: Row) => string | undefined,
  allUsers: ({ id: string } & Record<string, unknown>)[] | undefined,
): {
  photoCache: Record<string, string | null>;
  /** Reads one row's photo afresh, after an upload, replacement or removal in its edit form. */
  refreshPhoto: (uid: string, rowInstitutionId: string | undefined) => void;
} {
  const [photoCache, setPhotoCache] = useState<Record<string, string | null>>({});
  const requestedPhotoUids = useRef<Set<string>>(new Set());
  const failedPhotoReads = useRef<Map<string, { tries: number; at: number }>>(new Map());

  const fetchPhoto = async (uid: string, rowInstitutionId: string | undefined, force = false) => {
    requestedPhotoUids.current.add(uid);
    // A filtered query, not getDoc: reading a photo that does not exist is denied by the rules.
    // Kept for the session (lib/userPhoto.ts), so coming back to this list does not read every photo again; an
    // upload, replacement or removal (refreshPhoto) reads the row's photo afresh.
    let url: string | null;
    try {
      url = await (force ? refreshUserPhotoUrl : fetchUserPhotoUrlCached)(uid, rowInstitutionId);
    } catch {
      // A failed read is not "this person has no photo": leave the row on its initial, and let a later render ask again
      // (after a pause, a few times) instead of remembering the failure as an answer.
      requestedPhotoUids.current.delete(uid);
      const before = failedPhotoReads.current.get(uid);
      failedPhotoReads.current.set(uid, { tries: (before?.tries ?? 0) + 1, at: Date.now() });
      return;
    }
    failedPhotoReads.current.delete(uid);
    setPhotoCache((prev) => ({ ...prev, [uid]: url }));
  };

  // Called via FormModal's onClose (the edit modal) so a photo upload/replace/remove is reflected immediately instead
  // of staying stale until the page is reloaded — bypasses the "already requested" guard deliberately, since this is a
  // targeted, on-demand refresh of one row, not the bulk per-page fetch below.
  const refreshPhoto = (uid: string, rowInstitutionId: string | undefined) => {
    void fetchPhoto(uid, rowInstitutionId, true);
  };

  // People whose document says they have no photo: their photo is not read at all.
  const noPhotoIds = useMemo(() => new Set((allUsers ?? []).filter(hasNoPhoto).map((u) => u.id)), [allUsers]);

  useEffect(() => {
    if (USE_MOCK) return;
    // Until the users list has loaded nobody is known to have no photo; wait for it instead of reading every row.
    if (allUsers === undefined) return;
    const mayRead = (id: string) => {
      const failed = failedPhotoReads.current.get(id);
      return !failed || (failed.tries < MAX_PHOTO_TRIES && Date.now() - failed.at >= PHOTO_RETRY_AFTER_MS);
    };
    const rowsToFetch = rows.filter((r) => !requestedPhotoUids.current.has(idOf(r)) && !noPhotoIds.has(idOf(r)) && mayRead(idOf(r)));
    // fetchPhoto itself marks each uid as requested (needed so refreshPhoto's targeted, guard-bypassing calls stay
    // correctly tracked too) — no need to also mark them here before calling it.
    rowsToFetch.forEach((r) => void fetchPhoto(idOf(r), institutionOf(r)));
  }, [rows, noPhotoIds, allUsers, idOf, institutionOf]);

  return { photoCache, refreshPhoto };
}
