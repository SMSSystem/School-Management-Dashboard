import {
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
  updateProfile,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";
import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db, getRoleLabel } from "@/lib/firebase";
import { logAuditEvent } from "@/lib/auditLog";
import { buildUserDocument, accountInstitutionId, type UserDocumentInput } from "@/lib/createUserDocument";
import { getFirebaseMessage, type CreateUserFormValues } from "@/lib/createUserSchema";
import { populationDelta } from "@/lib/classPopulationDelta";
import { addPopulationDelta } from "@/lib/classPopulationWrite";

// The Create Account form's work against Firebase (AdminCreateUserForm.tsx), in the order the form
// runs it: look for a clash, create the account, then log what was done. The component keeps every
// piece of screen state (errors, the loading flag, reset) and decides what to show from the results.

export type AccountConflict =
  | { kind: "error"; message: string }
  | { kind: "field"; field: "institutionStudentId" | "idNumber"; message: string };

/** A senior teacher already holding the homeroom class, or a student ID or citizen ID already in use. */
export async function findAccountConflict(values: CreateUserFormValues): Promise<AccountConflict | null> {
  // Uniqueness check: prevent assigning the same homeroom class to two senior_teachers
  if (values.role === "senior_teacher" && values.assignedClassId) {
    const conflict = await getDocs(
      query(
        collection(db, "users"),
        where("institutionId", "==", values.institutionId),
        where("role", "==", "senior_teacher"),
        where("assignedClassId", "==", values.assignedClassId),
      ),
    );
    if (!conflict.empty) {
      return { kind: "error", message: "This class already has an assigned senior teacher." };
    }
  }

  if (values.role === "student" && values.institutionStudentId) {
    const idConflict = await getDocs(
      query(
        collection(db, "users"),
        where("institutionId", "==", values.institutionId),
        where("institutionStudentId", "==", values.institutionStudentId),
        where("role", "==", "student"),
      ),
    );
    if (!idConflict.empty) {
      return { kind: "field", field: "institutionStudentId", message: "This student ID is already in use." };
    }
  }

  // Applies to every role, so scoped by institution only (no role filter,
  // unlike institutionStudentId above) — skipped for super_admin, whose
  // institutionId is blank/"*" and has no per-institution scope to check
  // uniqueness against.
  if (values.idNumber && values.institutionId) {
    const idNumberConflict = await getDocs(
      query(
        collection(db, "users"),
        where("institutionId", "==", values.institutionId),
        where("idNumber", "==", values.idNumber),
      ),
    );
    if (!idNumberConflict.empty) {
      return { kind: "field", field: "idNumber", message: "This Citizen ID or TRN is already in use." };
    }
  }

  return null;
}

export type CreateAccountInput = {
  values: CreateUserFormValues;
  /** The throw-away Auth instance from getUserCreationAuth(), so the signed-in admin is not disturbed. */
  secondaryAuth: Auth;
  creatorUid: string;
  photoDataUrl: string | null;
  membership: UserDocumentInput["membership"];
  classes: UserDocumentInput["classes"];
  canonicalizePhone: (value: string) => string;
};

export type CreateAccountResult = { ok: true; user: FirebaseUser } | { ok: false; message: string };

/** Creates the Auth account and its Firestore profile (and photo); a failure removes the Auth account again. */
export async function createAccountRecord({
  values,
  secondaryAuth,
  creatorUid,
  photoDataUrl,
  membership,
  classes,
  canonicalizePhone,
}: CreateAccountInput): Promise<CreateAccountResult> {
  let createdUser: FirebaseUser | null = null;

  try {
    const normalizedEmail = values.email.toLowerCase();
    const credentials = await createUserWithEmailAndPassword(
      secondaryAuth,
      normalizedEmail,
      values.password,
    );
    createdUser = credentials.user;

    // Best-effort Auth photoURL sync (PHOTO_UPLOAD_SPEC.md §Firebase Auth
    // photoURL Sync) — this is the one moment updateProfile() can reach
    // this account at all, since the app is only ever transiently signed
    // in as it via secondaryAuth right here. Never blocks account
    // creation: Firestore (users/{uid}/photo/current, written below)
    // remains the sole source of truth for every display surface.
    if (photoDataUrl) {
      try {
        await updateProfile(createdUser, { photoURL: photoDataUrl });
      } catch {
        // Best-effort only — see comment above.
      }
    }

    const batch = writeBatch(db);

    batch.set(
      doc(db, "users", createdUser.uid),
      buildUserDocument({
        uid: createdUser.uid,
        values,
        email: normalizedEmail,
        phone: canonicalizePhone(values.phone),
        phone2: values.phone2 ? canonicalizePhone(values.phone2) : null,
        createdBy: creatorUid,
        createdAt: serverTimestamp(),
        membership,
        classes,
      }),
    );

    // A new student joins every class they are in: the class head-counts (lib/classPopulationDelta.ts) move in this
    // same batch, so the profile and the counts are written together or not at all.
    if (values.role === "student") {
      addPopulationDelta(
        batch,
        accountInstitutionId(values),
        populationDelta(
          null,
          { classIds: membership.classIds, gender: values.gender, status: "active" },
          new Set(classes.map((c) => c.id)),
        ),
      );
    }

    if (photoDataUrl) {
      batch.set(doc(db, "users", createdUser.uid, "photo", "current"), {
        dataUrl: photoDataUrl,
        institutionId: accountInstitutionId(values),
        updatedAt: serverTimestamp(),
        updatedBy: creatorUid,
      });
    }

    await batch.commit();
  } catch (err) {
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch {
        // If rollback fails, Firebase Auth has the account but Firestore does not.
      }
    }
    return { ok: false, message: getFirebaseMessage(err) };
  }

  try {
    await signOut(secondaryAuth);
  } catch {
    // Best effort: the secondary Auth instance is isolated from the active admin session.
  }

  return { ok: true, user: createdUser };
}

/** The audit entries for a created account (and its photo). Best effort: the account exists regardless. */
export async function logAccountCreated({
  values,
  createdName,
  uid,
  creatorUid,
  creatorName,
  photoAdded,
}: {
  values: CreateUserFormValues;
  createdName: string;
  uid: string;
  creatorUid: string;
  creatorName: string;
  photoAdded: boolean;
}): Promise<void> {
  // The creation itself is logged too (account_created), under the NEW
  // account's institution. Best-effort and after the batch, not in it: that
  // batch is paired with a rollback that deletes the Auth user, and a failed
  // log write must never undo a real account. Skipped for a super_admin
  // target, which has no institution path to log under.
  if (values.role !== "super_admin") {
    try {
      await logAuditEvent({
        institutionId: values.institutionId,
        eventType: "account_created",
        detail: `Created ${getRoleLabel(values.role)} account for ${createdName}`,
        targetUid: uid,
        targetName: createdName,
        performedBy: creatorUid,
        performedByName: creatorName,
      });
    } catch {
      // Best-effort — the account already exists regardless.
    }
  }

  // CORRECTED (PR self-review): StudentForm/TeacherForm log a photo_change
  // audit entry for edits, but account-creation-time photos never got one
  // — added for consistency. Best-effort, after everything else has
  // already succeeded, so a log-write failure never affects the account.
  if (photoAdded && values.role !== "super_admin") {
    try {
      await logAuditEvent({
        institutionId: values.institutionId,
        eventType: "photo_change",
        detail: `Added photo for ${createdName} during account creation`,
        targetUid: uid,
        targetName: createdName,
        performedBy: creatorUid,
        performedByName: creatorName,
      });
    } catch {
      // Best-effort — the account and its photo already exist regardless.
    }
  }
}
