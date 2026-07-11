import { collection, doc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';

// AuthContext assigns this institutionId to super_admin, who has no single
// institution. Not a real Firestore path segment — callers must check for
// it and branch before ever reaching institutionCollection/institutionDoc,
// the same way every existing institution-scoped page already does.
export const SUPER_ADMIN_SENTINEL = '*';

export function institutionCollection(institutionId: string, name: string): CollectionReference {
  return collection(db, 'institutions', institutionId, name);
}

export function institutionDoc(institutionId: string, name: string, id: string): DocumentReference {
  return doc(db, 'institutions', institutionId, name, id);
}

// Nested subcollection, e.g. gradebooks/{gradebookId}/columns
export function institutionSubcollection(
  institutionId: string,
  parentName: string,
  parentId: string,
  childName: string,
): CollectionReference {
  return collection(db, 'institutions', institutionId, parentName, parentId, childName);
}
