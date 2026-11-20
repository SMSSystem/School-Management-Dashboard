// Firestore reads with a working copy (workingCopy.ts): the shared shape of the reference lists the register pages
// use (classes, subjects, the calendar), read once from the server and kept for when the device is offline.

import {
  getDocs,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { readThrough } from "./workingCopy";

const withId = (d: QueryDocumentSnapshot<DocumentData>) => ({
  id: d.id,
  ...d.data(),
});

/** Every document a query returns, as `{ id, ...data }`, with a working copy under `name`. */
export async function docsThrough<T>(
  name: string,
  ref: Query<DocumentData>,
): Promise<T[]> {
  const read = await readThrough(name, async () => {
    const snap = await getDocs(ref);
    return {
      value: snap.docs.map(withId) as T[],
      fromCache: snap.metadata.fromCache,
    };
  });
  return read.value;
}
