import { collection, getDocs, query, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db, type UserPhotoDocument } from './firebase';
import { queryClient } from './queryClient';
import { LIST_STALE_MS } from './queryPolicies';
import { userPhotoKey } from './userPhotoKeys';

// Reading users/{uid}/photo/current with getDoc fails for an admin when no photo
// exists: firestore.rules reads resource.data.institutionId, and a document that does
// not exist has no data, so Firestore answers "Missing or insufficient permissions"
// instead of "not found". A query filtered on the institution is allowed by the same
// rule and simply returns nothing, so use these helpers wherever a person may have no
// photo (the Students and Teachers lists, their detail pages and edit forms, and the
// Delete user dialog). userPhotoReads.test.ts fails if a plain getDoc of someone else's
// photo comes back.

/** The person's photo documents (none, or the one fixed-id document), or [] if there is no institution to filter on. */
export async function findUserPhotoDocs(uid: string, institutionId: string | null | undefined): Promise<QueryDocumentSnapshot[]> {
  if (!institutionId || institutionId === '*') return [];
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'photo'), where('institutionId', '==', institutionId)),
  );
  return snap.docs;
}

/** The photo's data URL, or null when the person has none. */
export async function fetchUserPhotoUrl(uid: string, institutionId: string | null | undefined): Promise<string | null> {
  const docs = await findUserPhotoDocs(uid, institutionId);
  return docs.length > 0 ? ((docs[0].data() as UserPhotoDocument).dataUrl ?? null) : null;
}

/**
 * The photo shown on a list row: the same answer as fetchUserPhotoUrl, kept for LIST_STALE_MS, so leaving a list and
 * coming back (or opening another list with the same person) does not read each photo again.
 */
export function fetchUserPhotoUrlCached(uid: string, institutionId: string | null | undefined): Promise<string | null> {
  return queryClient.fetchQuery({
    queryKey: userPhotoKey(institutionId, uid),
    queryFn: () => fetchUserPhotoUrl(uid, institutionId),
    staleTime: LIST_STALE_MS,
  });
}

/** After an upload, replacement or removal: reads the photo afresh and keeps it for the lists. */
export async function refreshUserPhotoUrl(uid: string, institutionId: string | null | undefined): Promise<string | null> {
  const url = await fetchUserPhotoUrl(uid, institutionId);
  queryClient.setQueryData(userPhotoKey(institutionId, uid), url);
  return url;
}
