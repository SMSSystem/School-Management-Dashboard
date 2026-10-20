import { arrayUnion, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";
import { db } from "@/lib/firebase";
import type { UserStatus } from "@/types/people";
import { institutionDoc } from "@/lib/paths";
import { normaliseMembership } from "@/lib/studentClasses";
import { populationDelta } from "@/lib/classPopulationDelta";
import { addPopulationDelta } from "@/lib/classPopulationWrite";
import type { CommitProgress } from "@/lib/spreadsheetImport";
import type { ResolvedStudentImportRow } from "@/lib/importStudents";
import { SHARED_STUDENT_IMPORT_PASSWORD, getImportAccountMessage, type Row } from "@/lib/importConfig";

// Creates the accounts of a Students import (scenes/(dashboard)/import): one Auth account and one batch per
// row, on the secondary Auth instance so the importing admin's own session is never disturbed.

/**
 * Students-only commit path — sequential, not chunked, per
 * SPREADSHEET_IMPORT_STUDENTS_SPEC.md Part C. Unlike chunkedBatchWrite
 * (a 450-op Firestore batch mechanism), createUserWithEmailAndPassword
 * has no bulk endpoint and must run once per row, over the network, so
 * progress updates after every row rather than every chunk. A row's
 * failure never aborts the loop; a Firestore-write failure after a
 * successful Auth create triggers immediate rollback of that one
 * account, mirroring AdminCreateUserForm.tsx's own single-account flow.
 */
export async function createImportedStudents({
  rows,
  houseCandidates,
  classCandidates,
  institutionId_,
  creatorUid,
  secondaryAuth,
  canonicalizePhone,
  onProgress,
}: {
  rows: ResolvedStudentImportRow[];
  houseCandidates: { id: string; name: string }[];
  /** The institution's classes, so the class head-counts only move for classes that exist. */
  classCandidates: { id: string; name: string }[];
  institutionId_: string;
  creatorUid: string;
  secondaryAuth: Auth;
  canonicalizePhone: (value: string) => string;
  onProgress: (progress: CommitProgress) => void;
}): Promise<{ progress: CommitProgress; failed: (Row & { __error: string })[] }> {
  const progress: CommitProgress = { done: 0, total: rows.length, errors: [] };
  const failed: (Row & { __error: string })[] = [];
  onProgress({ ...progress });

  for (const row of rows) {
    let createdUser: FirebaseUser | null = null;
    try {
      const credentials = await createUserWithEmailAndPassword(
        secondaryAuth,
        row.email.toLowerCase(),
        SHARED_STUDENT_IMPORT_PASSWORD,
      );
      createdUser = credentials.user;

      // Matches StudentForm.tsx's own write shape exactly, including the
      // houseName denormalization and the studentIds arrayUnion side
      // effect on the assigned house — both batched with the profile
      // write itself so they commit atomically, same as StudentForm.tsx.
      const selectedHouse = row.houseId ? houseCandidates.find((h) => h.id === row.houseId) : undefined;
      const membership = normaliseMembership({ classId: row.classId, extraClassIds: row.extraClassIds });
      const batch = writeBatch(db);
      batch.set(doc(db, "users", createdUser.uid), {
        uid: createdUser.uid,
        role: "student",
        institutionId: institutionId_,
        firstName: row.firstName,
        lastName: row.lastName,
        name: `${row.firstName} ${row.lastName}`,
        email: row.email.toLowerCase(),
        ...(row.phone !== undefined && { phone: canonicalizePhone(row.phone) }),
        phone2: row.phone2 ? canonicalizePhone(row.phone2) : null,
        idNumber: row.idNumber || null,
        institutionStudentId: row.institutionStudentId || null,
        dateOfBirth: row.dateOfBirth || null,
        gender: row.gender ?? null,
        classId: membership.classId,
        classIds: membership.classIds,
        classSubjects: membership.classSubjects,
        houseId: row.houseId || null,
        houseName: selectedHouse?.name ?? null,
        status: "active" satisfies UserStatus,
        mustChangePassword: true,
        // An import has no photos; the list rows skip the photo read for a person whose hasPhoto is false.
        hasPhoto: false,
        createdAt: serverTimestamp(),
        createdBy: creatorUid,
      });
      if (row.houseId) {
        batch.update(institutionDoc(institutionId_, "houses", row.houseId), { studentIds: arrayUnion(createdUser.uid) });
      }
      // The new student joins every class they are in: the class head-counts move in the same batch.
      addPopulationDelta(
        batch,
        institutionId_,
        populationDelta(
          null,
          { classIds: membership.classIds, gender: row.gender, status: "active" },
          new Set(classCandidates.map((c) => c.id)),
        ),
      );
      await batch.commit();

      await signOut(secondaryAuth);
      progress.done += 1;
    } catch (err) {
      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch {
          // Best-effort rollback: if this also fails, Firebase Auth has
          // the account but Firestore does not — same residual failure
          // mode AdminCreateUserForm.tsx's own single-account flow
          // already accepts.
        }
      }
      const message = getImportAccountMessage(err);
      progress.errors.push(message);
      failed.push({ ...(row as unknown as Row), __error: message });
    }
    onProgress({ ...progress });
  }

  return { progress, failed };
}
