import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { usePhoneCanonicalizer } from "@/hooks/usePhoneCanonicalizer";
import { FirebaseError, getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  db,
  firebaseConfig,
  ClassDocument,
  getRoleLabel,
  Role,
  UserStatus,
} from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { actorName, logAuditEvent } from "@/lib/auditLog";
import { fetchInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { fetchInstitutionDepartments } from "@/hooks/useInstitutionDepartments";
import { departmentRequired, DEPARTMENT_REQUIRED_MESSAGE } from "@/lib/departmentRequirement";
import { namePattern, phonePattern } from "@/lib/fieldPatterns";
import {
  homeroomRoomField,
  homeroomBuildingField,
  addHomeroomRoomRequiredIssue,
} from "@/lib/homeroomFields";
import PhotoUploadField from "@/components/PhotoUploadField";

// Pre-filled (not locked) default "temporary password" per role — every
// account created here already gets mustChangePassword: true, so a
// well-known default is an acceptable starting point the admin can still
// override. institution_admin/super_admin are deliberately excluded: they're
// the highest-privilege roles this form can create (only ever by a
// super_admin), so they keep a blank, fully admin-chosen password same as
// before this change.
//
// The student value must stay identical to SHARED_STUDENT_IMPORT_PASSWORD
// (src/scenes/(dashboard)/import/index.tsx) — kept as a separate literal
// rather than a shared import (same "kept in sync manually rather than
// shared" precedent as change-password/index.tsx's validateNewPassword) so
// this form doesn't take on a dependency on a scene-level page module.
const ROLE_DEFAULT_PASSWORDS: Partial<Record<Role, string>> = {
  student: "Student01234567890",
  parent: "Parent0123456789",
  regular_teacher: "Teacher0123456789",
  senior_teacher: "Teacher0123456789",
};

const createUserSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, "First name must be at least 2 characters.")
      .max(50, "First name must be 50 characters or less.")
      .regex(namePattern, "Use letters, spaces, apostrophes, or hyphens only."),
    lastName: z
      .string()
      .trim()
      .min(2, "Last name must be at least 2 characters.")
      .max(50, "Last name must be 50 characters or less.")
      .regex(namePattern, "Use letters, spaces, apostrophes, or hyphens only."),
    email: z
      .string()
      .trim()
      .min(1, "Email is required.")
      .email("Enter a valid email address.")
      .max(254, "Email must be 254 characters or less."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(64, "Password must be 64 characters or less.")
      .regex(/[a-z]/, "Password needs at least one lowercase letter.")
      .regex(/[A-Z]/, "Password needs at least one uppercase letter.")
      .regex(/[0-9]/, "Password needs at least one number."),
    confirmPassword: z.string().min(1, "Confirm the temporary password."),
    phone: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || phonePattern.test(value),
        "Enter a valid phone number.",
      ),
    phone2: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || phonePattern.test(value),
        "Enter a valid phone number.",
      ),
    idNumber: z
      .string()
      .trim()
      .max(50, "Citizen ID or TRN must be 50 characters or less.")
      .optional(),
    role: z.enum([
      "institution_admin",
      "senior_teacher",
      "regular_teacher",
      "student",
      "parent",
      "super_admin",
    ]),
    institutionId: z.string(),
    departmentId: z.string().optional(),
    classId: z.string().optional(),
    assignedClassId: z.string().optional(),
    homeroomRoom: homeroomRoomField,
    homeroomBuilding: homeroomBuildingField,
    dateOfBirth: z.string().optional(),
    institutionStudentId: z
      .string()
      .max(50, "Student ID must be 50 characters or less.")
      .optional(),
    gender: z
      .enum(["Male", "Female"] as const, { message: "Please select a gender." })
      .optional(),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }

    if (values.role !== "super_admin" && !values.institutionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["institutionId"],
        message: "Institution is required for this role.",
      });
    }

    if (
      values.role === "senior_teacher" &&
      values.assignedClassId &&
      !values.homeroomRoom?.trim()
    ) {
      addHomeroomRoomRequiredIssue(ctx);
    }

    if (values.role === "student") {
      const dob = values.dateOfBirth ?? "";
      const dobValid =
        Boolean(dob) &&
        /^\d{4}-\d{2}-\d{2}$/.test(dob) &&
        !isNaN(Date.parse(dob));
      if (!dobValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateOfBirth"],
          message: "Date of birth is required.",
        });
      } else {
        // Parsed at noon UTC (matching the noon-UTC convention used elsewhere for
        // date-only strings, e.g. utils.ts's isSubjectSessionDay) so a same-day
        // birthday isn't flipped to "too young" by a timezone offset.
        const dobDate = new Date(`${dob}T12:00:00Z`);
        const minBirthDate = new Date();
        minBirthDate.setUTCHours(12, 0, 0, 0);
        minBirthDate.setUTCFullYear(minBirthDate.getUTCFullYear() - 3);
        if (dobDate > minBirthDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dateOfBirth"],
            message: "Student must be at least 3 years old.",
          });
        }
      }
      if (!values.gender) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["gender"],
          message: "Gender is required.",
        });
      }
    }
  });

type FormValues = z.infer<typeof createUserSchema>;

function getFirebaseMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return "Something went wrong while creating the user.";
  }

  const messages: Record<string, string> = {
    "auth/email-already-in-use":
      "That email already belongs to another account.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Password should be at least 8 characters.",
    "auth/network-request-failed":
      "Network error. Check your connection and try again.",
    "permission-denied":
      "Firestore denied this write. Check your security rules for admin user creation.",
  };

  return messages[error.code] ?? error.message;
}

function FieldError({ message }: { message?: string }) {
  // Always rendered (even with no message) so its line-height reserves a
  // constant min-h-4 slot under every field — otherwise a field's row in
  // the surrounding grid grows the moment an error appears, pushing every
  // row below it down.
  return <p className="min-h-4 text-xs font-medium text-red-500">{message}</p>;
}

// Shape of the router `state` passed via <Link state={...}> from the Teachers/
// Students/Parents list pages' "+" buttons, so the Role dropdown starts
// pre-selected (but still editable) to the relevant role.
export type CreateUserLocationState = {
  initialRole?: Role;
};

type AdminCreateUserFormProps = {
  initialInstitutionId?: string;
  lockedRole?: Role;
  initialRole?: Role;
  // Additive prefill for the registration-conversion flow (Phase 10 of
  // STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md) — seeds defaultValues
  // the same way initialInstitutionId/lockedRole/initialRole already do.
  // Every other field keeps its normal blank default when omitted.
  initialValues?: Partial<
    Pick<
      FormValues,
      | "firstName"
      | "lastName"
      | "email"
      | "phone"
      | "dateOfBirth"
      | "gender"
      | "institutionStudentId"
    >
  >;
  // Carry-over for the registration-conversion flow (PHOTO_UPLOAD_SPEC.md
  // §UI/UX Changes Per Surface "Public Registration form") — the registrant's
  // photo, if any, pre-fills this form's own photo field exactly as if an
  // admin had picked the same file, so the existing photo write/Auth-sync
  // logic in onSubmit applies unchanged. Kept separate from initialValues
  // since photo isn't a FormValues/zod field.
  initialPhotoDataUrl?: string;
  // Widened from (userName: string) => void — the conversion flow needs the
  // created Firebase Auth uid to link student_parents afterward.
  onSuccess?: (userName: string, uid: string) => void;
};

export default function AdminCreateUserForm({
  initialInstitutionId,
  lockedRole,
  initialRole,
  initialValues,
  initialPhotoDataUrl,
  onSuccess,
}: AdminCreateUserFormProps = {}) {
  const { user, role, displayName, institutionId: callerInstitutionId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [classes, setClasses] = useState<(ClassDocument & { id: string })[]>(
    [],
  );
  const [departments, setDepartments] = useState<
    { id: string; name: string }[]
  >([]);
  const [institutions, setInstitutions] = useState<
    { id: string; name: string }[]
  >([]);
  const [institutionName, setInstitutionName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const roleOptions: Role[] =
    role === "super_admin"
      ? [
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
          "super_admin",
        ]
      : ["senior_teacher", "regular_teacher", "student", "parent"];

  const initialFormRole: Role =
    lockedRole ??
    initialRole ??
    (role === "super_admin" ? "institution_admin" : "senior_teacher");

  const defaultValues: FormValues = {
    firstName: initialValues?.firstName ?? "",
    lastName: initialValues?.lastName ?? "",
    email: initialValues?.email ?? "",
    password: ROLE_DEFAULT_PASSWORDS[initialFormRole] ?? "",
    confirmPassword: ROLE_DEFAULT_PASSWORDS[initialFormRole] ?? "",
    phone: initialValues?.phone ?? "",
    phone2: "",
    idNumber: "",
    role: initialFormRole,
    institutionId: initialInstitutionId ?? "",
    departmentId: "",
    classId: "",
    assignedClassId: "",
    homeroomRoom: "",
    homeroomBuilding: "",
    dateOfBirth: initialValues?.dateOfBirth ?? "",
    institutionStudentId: initialValues?.institutionStudentId ?? "",
    gender: initialValues?.gender,
  };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    setError: setFieldError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues,
    mode: "onBlur",
  });

  const canonicalizePhone = usePhoneCanonicalizer();
  const { onChange: onPhoneChange, onBlur: onPhoneBlur, ...phoneReg } = register("phone");
  const { onChange: onPhone2Change, onBlur: onPhone2Blur, ...phone2Reg } = register("phone2");

  const secondaryAuth = useMemo(() => {
    const appName = "user-creation";
    const secondaryApp = getApps().some((app) => app.name === appName)
      ? getApp(appName)
      : initializeApp(firebaseConfig, appName);
    return getAuth(secondaryApp);
  }, []);

  // Optional photo — available for any role (PHOTO_UPLOAD_SPEC.md §Design
  // Decisions: this form isn't role-specialized). No existing photo to load
  // (this is account creation, not an edit), so state is simpler than the
  // Student/Teacher edit modals' equivalent.
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(initialPhotoDataUrl ?? null);

  const selectedRole = watch("role");
  const institutionIdValue = watch("institutionId");
  const requiresInstitution = selectedRole !== "super_admin";

  // Keyed by the form's selected institution, not the acting admin's own
  // (super_admin can create users in any institution) — useInstitutionClasses()
  // is tied to useAuth().institutionId, so it doesn't fit here; the imperative
  // fetchInstitutionClasses() shares the same cache under the correct key
  // without that assumption (Phase 3a, FIRESTORE_READ_CACHING_SPEC.md §5.1).
  useEffect(() => {
    if (!institutionIdValue) {
      setClasses([]);
      return;
    }
    let cancelled = false;
    fetchInstitutionClasses(institutionIdValue)
      .then((data) => {
        if (!cancelled) setClasses(data);
      })
      .catch(() => {
        if (!cancelled) setClasses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [institutionIdValue]);

  // Keyed by the form's selected institution, not the acting admin's own —
  // same reasoning as the classes fetch above (Phase 3a,
  // FIRESTORE_READ_CACHING_SPEC.md §5.1).
  useEffect(() => {
    if (!institutionIdValue) {
      setDepartments([]);
      return;
    }
    let cancelled = false;
    fetchInstitutionDepartments(institutionIdValue)
      .then((data) => {
        if (!cancelled) setDepartments(data);
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [institutionIdValue]);

  // Clear institutionId when switching to super_admin role
  useEffect(() => {
    if (!requiresInstitution) {
      setValue("institutionId", "", { shouldValidate: true });
    }
  }, [requiresInstitution, setValue]);

  // Pre-fill the role's default temporary password on every role change —
  // a no-op for institution_admin/super_admin, which have no entry in
  // ROLE_DEFAULT_PASSWORDS and so keep whatever the admin already typed.
  useEffect(() => {
    const defaultPassword = ROLE_DEFAULT_PASSWORDS[selectedRole];
    if (defaultPassword) {
      setValue("password", defaultPassword, { shouldValidate: true });
      setValue("confirmPassword", defaultPassword, { shouldValidate: true });
    }
  }, [selectedRole, setValue]);

  // Set institutionId for institution_admin callers on every role change (prevents stale validation)
  useEffect(() => {
    if (role === "institution_admin" && callerInstitutionId) {
      setValue("institutionId", callerInstitutionId, { shouldValidate: true });
    }
  }, [role, callerInstitutionId, setValue, selectedRole]);

  useEffect(() => {
    if (role !== "super_admin") return;
    getDocs(collection(db, "institutions")).then((snap) => {
      setInstitutions(
        snap.docs.map((d) => ({
          id: d.id,
          name: (d.data().name as string) ?? d.id,
        })),
      );
    });
  }, [role]);

  useEffect(() => {
    if (role !== "institution_admin" || !callerInstitutionId) return;
    getDoc(doc(db, "institutions", callerInstitutionId)).then((snap) => {
      setInstitutionName(
        snap.exists()
          ? ((snap.data().name as string) ?? callerInstitutionId)
          : callerInstitutionId,
      );
    });
  }, [role, callerInstitutionId]);

  useEffect(() => {
    if (lockedRole) {
      setValue("role", lockedRole, { shouldValidate: true });
    }
  }, [lockedRole, setValue]);

  useEffect(() => {
    if (initialRole && !lockedRole) {
      setValue("role", initialRole, { shouldValidate: true });
    }
  }, [initialRole, lockedRole, setValue]);

  useEffect(() => {
    if (initialInstitutionId) {
      setValue("institutionId", initialInstitutionId, { shouldValidate: true });
    }
  }, [initialInstitutionId, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSuccess(null);

    if (role !== "super_admin" && role !== "institution_admin") {
      setError("Only admins can create users from this form.");
      return;
    }

    if (!user) {
      setError("You must be signed in before creating users.");
      return;
    }

    // A teacher's department decides whether a senior_teacher can see their
    // notes and assignments (firestore.rules matches departmentId), so one is
    // required wherever the institution has departments to choose from. This
    // can't live in the zod schema above: whether departments exist is only
    // known at runtime, from the selected institution's loaded list.
    if (departmentRequired(values.role, departments.length > 0) && !values.departmentId) {
      setFieldError("departmentId", { type: "required", message: DEPARTMENT_REQUIRED_MESSAGE });
      return;
    }

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
        setError("This class already has an assigned senior teacher.");
        return;
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
        setFieldError("institutionStudentId", {
          message: "This student ID is already in use.",
        });
        return;
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
        setFieldError("idNumber", {
          message: "This Citizen ID or TRN is already in use.",
        });
        return;
      }
    }

    setLoading(true);
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

      const fullName = [values.firstName, values.lastName].join(" ");
      const batch = writeBatch(db);

      batch.set(doc(db, "users", createdUser.uid), {
        uid: createdUser.uid,
        firstName: values.firstName,
        lastName: values.lastName,
        name: fullName,
        email: normalizedEmail,
        phone: canonicalizePhone(values.phone),
        phone2: values.phone2 ? canonicalizePhone(values.phone2) : null,
        idNumber: values.idNumber || null,
        role: values.role,
        institutionId:
          values.role === "super_admin" ? "*" : values.institutionId,
        status: "active" satisfies UserStatus,
        // Every account created here gets a real password, but it's still
        // one the admin chose on the new account owner's behalf — forcing a
        // change on first login is what actually backs the "Temporary
        // password" label below, for every role, not just Students-import
        // accounts (Protected.tsx's gate is already role-agnostic).
        mustChangePassword: true,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        ...(values.role === "student" &&
          values.classId && { classId: values.classId }),
        ...(values.role === "student" && {
          dateOfBirth: values.dateOfBirth || null,
          institutionStudentId: values.institutionStudentId || null,
          gender: values.gender ?? null,
        }),
        ...(values.role === "senior_teacher" && {
          assignedClassId: values.assignedClassId || null,
          assignedClassName: values.assignedClassId
            ? (classes.find((c) => c.id === values.assignedClassId)?.name ??
              null)
            : null,
          homeroomRoom: values.homeroomRoom || null,
          homeroomBuilding: values.homeroomBuilding || null,
        }),
        ...((values.role === "senior_teacher" ||
          values.role === "regular_teacher") &&
          values.departmentId && { departmentId: values.departmentId }),
      });

      if (photoDataUrl) {
        batch.set(doc(db, "users", createdUser.uid, "photo", "current"), {
          dataUrl: photoDataUrl,
          institutionId:
            values.role === "super_admin" ? "*" : values.institutionId,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
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
      setError(getFirebaseMessage(err));
      setLoading(false);
      return;
    }

    try {
      await signOut(secondaryAuth);
    } catch {
      // Best effort: the secondary Auth instance is isolated from the active admin session.
    } finally {
      setLoading(false);
    }

    const createdName = [values.firstName, values.lastName].join(" ");

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
          targetUid: createdUser.uid,
          targetName: createdName,
          performedBy: user.uid,
          performedByName: actorName(displayName, user.email),
        });
      } catch {
        // Best-effort — the account already exists regardless.
      }
    }

    // CORRECTED (PR self-review): StudentForm/TeacherForm log a photo_change
    // audit entry for edits, but account-creation-time photos never got one
    // — added for consistency. Best-effort, after everything else has
    // already succeeded, so a log-write failure never affects the account.
    if (photoDataUrl && values.role !== "super_admin") {
      try {
        await logAuditEvent({
          institutionId: values.institutionId,
          eventType: "photo_change",
          detail: `Added photo for ${createdName} during account creation`,
          targetUid: createdUser.uid,
          targetName: createdName,
          performedBy: user.uid,
          performedByName: actorName(displayName, user.email),
        });
      } catch {
        // Best-effort — the account and its photo already exist regardless.
      }
    }

    setPhotoDataUrl(null);

    if (onSuccess) {
      onSuccess(createdName, createdUser.uid);
    } else {
      setSuccess(`${createdName} was created successfully.`);
      reset(defaultValues);
      // reset(defaultValues) clears institutionId back to "" even for an
      // institution_admin caller — the disabled Institution input above
      // keeps displaying the correct name (it reads institutionName state,
      // never cleared), which is why this went unnoticed: the field looks
      // pre-filled but its real form value is blank, so a second submit for
      // the same role fails "Institution is required" since the repopulate
      // effect only reruns when selectedRole changes, which it doesn't
      // across two same-role submissions in a row.
      if (role === "institution_admin" && callerInstitutionId) {
        setValue("institutionId", callerInstitutionId, { shouldValidate: true });
      }
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      autoComplete="off"
      className="mt-6 bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:p-6"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Create Account
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {lockedRole === "institution_admin"
            ? "Create the administrator account for this institution. They will use these credentials to log in and manage their institution's data."
            : "Add a login account and matching Firestore user profile."}
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          First name
          <input
            id="tour-create-user-first-name"
            {...register("firstName")}
            aria-invalid={Boolean(errors.firstName)}
            autoComplete="off"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.firstName?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Last name
          <input
            id="tour-create-user-last-name"
            {...register("lastName")}
            aria-invalid={Boolean(errors.lastName)}
            autoComplete="off"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.lastName?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Email
          <input
            id="tour-create-user-email"
            {...register("email")}
            aria-invalid={Boolean(errors.email)}
            autoComplete="off"
            type="email"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.email?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Temporary password
          <div className="relative">
            <input
              id="tour-create-user-password"
              {...register("password")}
              aria-invalid={Boolean(errors.password)}
              autoComplete="new-password"
              type={showPassword ? "text" : "password"}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <FieldError message={errors.password?.message} />
          <p className="text-xs text-gray-400 dark:text-gray-500">
            The user will be required to set their own password the first
            time they sign in.
          </p>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Confirm password
          <div className="relative">
            <input
              id="tour-create-user-confirm-password"
              {...register("confirmPassword")}
              aria-invalid={Boolean(errors.confirmPassword)}
              autoComplete="new-password"
              type={showConfirmPassword ? "text" : "password"}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <FieldError message={errors.confirmPassword?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Phone
          <input
            id="tour-create-user-phone"
            {...phoneReg}
            aria-invalid={Boolean(errors.phone)}
            autoComplete="off"
            type="tel"
            onChange={(e) => {
              e.target.value = formatPhone(e.target.value);
              onPhoneChange(e);
            }}
            onBlur={(e) => {
              e.target.value = canonicalizePhone(e.target.value);
              onPhoneBlur(e);
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.phone?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          <span>
            Second phone{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            id="tour-create-user-phone2"
            {...phone2Reg}
            aria-invalid={Boolean(errors.phone2)}
            autoComplete="off"
            type="tel"
            onChange={(e) => {
              e.target.value = formatPhone(e.target.value);
              onPhone2Change(e);
            }}
            onBlur={(e) => {
              e.target.value = canonicalizePhone(e.target.value);
              onPhone2Blur(e);
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.phone2?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          <span>
            Citizen ID or TRN{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            id="tour-create-user-id-number"
            {...register("idNumber")}
            aria-invalid={Boolean(errors.idNumber)}
            autoComplete="off"
            maxLength={50}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.idNumber?.message} />
        </label>

        <PhotoUploadField
          photoUrl={photoDataUrl}
          onChange={setPhotoDataUrl}
          size="sm"
          chooseLabel="Choose file"
          replaceLabel="Replace"
          removeLabel="Clear"
          fieldLabel="Photo"
        />

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Role
          {lockedRole ? (
            <input
              id="tour-create-user-role"
              value={getRoleLabel(lockedRole)}
              disabled
              readOnly
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
            />
          ) : (
            <select
              id="tour-create-user-role"
              {...register("role")}
              aria-invalid={Boolean(errors.role)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {getRoleLabel(option)}
                </option>
              ))}
            </select>
          )}
          <FieldError message={errors.role?.message} />
        </label>

        {requiresInstitution && !initialInstitutionId && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            Institution
            {role === "institution_admin" ? (
              <input
                id="tour-create-user-institution"
                value={institutionName}
                disabled
                readOnly
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
              />
            ) : (
              <select
                id="tour-create-user-institution"
                {...register("institutionId")}
                aria-invalid={Boolean(errors.institutionId)}
                disabled={!!initialInstitutionId}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
              >
                <option value="">Select institution</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            )}
            <FieldError message={errors.institutionId?.message} />
          </label>
        )}

        {(selectedRole === "senior_teacher" ||
          selectedRole === "regular_teacher") &&
          departments.length > 0 && (
            <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <span className="flex items-center gap-1">
                Department{" "}
                <span className="font-normal text-gray-400">(required)</span>
              </span>
              <select
                id="tour-create-user-department"
                {...register("departmentId")}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">Select a department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <FieldError message={errors.departmentId?.message} />
            </label>
          )}

        {selectedRole === "senior_teacher" && classes.length > 0 && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <span className="flex items-center gap-1">
              Homeroom Class{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </span>
            <select
              id="tour-create-user-assigned-class"
              {...register("assignedClassId")}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">No class assigned</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError message={errors.assignedClassId?.message} />
          </label>
        )}

        {selectedRole === "senior_teacher" && classes.length > 0 && (
          <>
            <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              Homeroom Room
              <input
                id="tour-create-user-homeroom-room"
                {...register("homeroomRoom")}
                aria-invalid={Boolean(errors.homeroomRoom)}
                autoComplete="off"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
              <FieldError message={errors.homeroomRoom?.message} />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <span>
                Homeroom Building{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </span>
              <input
                id="tour-create-user-homeroom-building"
                {...register("homeroomBuilding")}
                aria-invalid={Boolean(errors.homeroomBuilding)}
                autoComplete="off"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
              <FieldError message={errors.homeroomBuilding?.message} />
            </label>
          </>
        )}

        {selectedRole === "student" && classes.length > 0 && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <span className="flex items-center gap-1">
              Class{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </span>
            <select
              id="tour-create-user-class"
              {...register("classId")}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">No class assigned</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError message={errors.classId?.message} />
          </label>
        )}

        {selectedRole === "student" && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            Date of birth
            <input
              id="tour-create-user-dob"
              {...register("dateOfBirth")}
              aria-invalid={Boolean(errors.dateOfBirth)}
              type="date"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <FieldError message={errors.dateOfBirth?.message} />
          </label>
        )}

        {selectedRole === "student" && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <span>
              Student ID{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </span>
            <input
              id="tour-create-user-student-id"
              {...register("institutionStudentId")}
              aria-invalid={Boolean(errors.institutionStudentId)}
              autoComplete="off"
              maxLength={50}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <FieldError message={errors.institutionStudentId?.message} />
          </label>
        )}

        {selectedRole === "student" && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            Gender
            <select
              id="tour-create-user-gender"
              {...register("gender")}
              aria-invalid={Boolean(errors.gender)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            <FieldError message={errors.gender?.message} />
          </label>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
          {success}
        </p>
      )}

      <button
        id="tour-create-user-submit"
        type="submit"
        disabled={loading}
        className="mt-6 rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
      >
        {loading ? "Creating account..." : "Create Account"}
      </button>
    </form>
  );
}
