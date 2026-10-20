import type { FieldValue } from "firebase/firestore";
import type { CreateUserFormValues } from "@/lib/createUserSchema";
import type { normaliseMembership } from "@/lib/studentClasses";
import type { UserStatus } from "@/types/people";

// What the Create Account form (AdminCreateUserForm.tsx) writes to users/{uid}, built from the form's
// values. Kept apart from the component so the shape each role gets can be tested.

export type UserDocumentInput = {
  uid: string;
  values: CreateUserFormValues;
  /** Lower-cased. */
  email: string;
  /** Already canonicalised by the caller. */
  phone: string;
  phone2: string | null;
  createdBy: string;
  /** serverTimestamp() when it is written. */
  createdAt: FieldValue;
  /** A student's classes, from normaliseMembership(). */
  membership: ReturnType<typeof normaliseMembership>;
  /** The institution's classes, to name a senior teacher's homeroom class. */
  classes: { id: string; name: string }[];
};

/** The institution an account belongs to: a super admin has none, which is stored as "*". */
export function accountInstitutionId(values: Pick<CreateUserFormValues, "role" | "institutionId">): string {
  return values.role === "super_admin" ? "*" : values.institutionId;
}

export function buildUserDocument({
  uid,
  values,
  email,
  phone,
  phone2,
  createdBy,
  createdAt,
  membership,
  classes,
}: UserDocumentInput) {
  const fullName = [values.firstName, values.lastName].join(" ");
  return {
    uid,
    firstName: values.firstName,
    lastName: values.lastName,
    name: fullName,
    email,
    phone,
    phone2,
    idNumber: values.idNumber || null,
    role: values.role,
    institutionId: accountInstitutionId(values),
    status: "active" satisfies UserStatus,
    // Every account created here gets a real password, but it's still
    // one the admin chose on the new account owner's behalf — forcing a
    // change on first login is what actually backs the "Temporary
    // password" label below, for every role, not just Students-import
    // accounts (Protected.tsx's gate is already role-agnostic).
    mustChangePassword: true,
    createdAt,
    createdBy,
    ...(values.role === "student" &&
      values.classId && {
        classId: membership.classId,
        classIds: membership.classIds,
        classSubjects: membership.classSubjects,
      }),
    ...(values.role === "student" && {
      dateOfBirth: values.dateOfBirth || null,
      institutionStudentId: values.institutionStudentId || null,
      gender: values.gender ?? null,
    }),
    ...(values.role === "senior_teacher" && {
      assignedClassId: values.assignedClassId || null,
      assignedClassName: values.assignedClassId
        ? (classes.find((c) => c.id === values.assignedClassId)?.name ?? null)
        : null,
      homeroomRoom: values.homeroomRoom || null,
      homeroomBuilding: values.homeroomBuilding || null,
    }),
    ...((values.role === "senior_teacher" || values.role === "regular_teacher") &&
      values.departmentId && { departmentId: values.departmentId }),
  };
}
