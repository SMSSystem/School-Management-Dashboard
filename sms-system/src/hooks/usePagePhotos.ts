import { useEffect, useMemo, useRef, useState } from "react";
import { USE_MOCK } from "@/lib/data";
import { fetchUserPhotoUrlCached, refreshUserPhotoUrl } from "@/lib/userPhoto";
import { hasNoPhoto } from "@/lib/userPhotoKeys";

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

  const fetchPhoto = async (uid: string, rowInstitutionId: string | undefined, force = false) => {
    requestedPhotoUids.current.add(uid);
    // A filtered query, not getDoc: reading a photo that does not exist is denied by the rules.
    // Kept for the session (lib/userPhoto.ts), so coming back to this list does not read every photo again; an
    // upload, replacement or removal (refreshPhoto) reads the row's photo afresh.
    const url = await (force ? refreshUserPhotoUrl : fetchUserPhotoUrlCached)(uid, rowInstitutionId).catch(() => null);
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
    const rowsToFetch = rows.filter((r) => !requestedPhotoUids.current.has(idOf(r)) && !noPhotoIds.has(idOf(r)));
    // fetchPhoto itself marks each uid as requested (needed so refreshPhoto's targeted, guard-bypassing calls stay
    // correctly tracked too) — no need to also mark them here before calling it.
    rowsToFetch.forEach((r) => void fetchPhoto(idOf(r), institutionOf(r)));
  }, [rows, noPhotoIds, idOf, institutionOf]);

  return { photoCache, refreshPhoto };
}
