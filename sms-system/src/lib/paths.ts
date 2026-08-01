import { collection, doc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';

// AuthContext assigns this institutionId to super_admin, who has no single
// institution. Not a real Firestore path segment — callers must check for
// it and branch before ever reaching institutionCollection/institutionDoc,
// the same way every existing institution-scoped page already does.
export const SUPER_ADMIN_SENTINEL = '*';

export function institutionCollection(institutionId: string, name: string): CollectionReference {
  if (!institutionId || institutionId === SUPER_ADMIN_SENTINEL) {
    throw new Error(`institutionCollection: invalid institutionId "${institutionId}" for collection "${name}"`);
  }
  return collection(db, 'institutions', institutionId, name);
}

export function institutionDoc(institutionId: string, name: string, id: string): DocumentReference {
  if (!institutionId || institutionId === SUPER_ADMIN_SENTINEL) {
    throw new Error(`institutionDoc: invalid institutionId "${institutionId}" for ${name}/${id}`);
  }
  return doc(db, 'institutions', institutionId, name, id);
}

// Document within a nested subcollection, e.g. gradebooks/{gradebookId}/columns/{columnId}
export function institutionSubdoc(
  institutionId: string,
  parentName: string,
  parentId: string,
  childName: string,
  childId: string,
): DocumentReference {
  if (!institutionId || institutionId === SUPER_ADMIN_SENTINEL) {
    throw new Error(`institutionSubdoc: invalid institutionId "${institutionId}" for ${parentName}/${parentId}/${childName}/${childId}`);
  }
  return doc(db, 'institutions', institutionId, parentName, parentId, childName, childId);
}

// Nested subcollection, e.g. gradebooks/{gradebookId}/columns
export function institutionSubcollection(
  institutionId: string,
  parentName: string,
  parentId: string,
  childName: string,
): CollectionReference {
  if (!institutionId || institutionId === SUPER_ADMIN_SENTINEL) {
    throw new Error(`institutionSubcollection: invalid institutionId "${institutionId}" for ${parentName}/${parentId}/${childName}`);
  }
  return collection(db, 'institutions', institutionId, parentName, parentId, childName);
}
