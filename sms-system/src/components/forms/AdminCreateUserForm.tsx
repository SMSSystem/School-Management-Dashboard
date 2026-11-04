import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePhoneCanonicalizer } from "@/hooks/usePhoneCanonicalizer";
import {
  invalidateUserCounts,
  invalidateUserLists,
} from "@/lib/invalidateUserCounts";
import { useForm } from "react-hook-form";
import { getUserCreationAuth, Role } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { actorName } from "@/lib/auditLog";
import { useCreateUserOptions } from "@/hooks/useCreateUserOptions";
import { type ExtraClassesValue } from "@/components/forms/ExtraClassesField";
import { membershipError, normaliseMembership } from "@/lib/studentClasses";
import {
  departmentRequired,
  DEPARTMENT_REQUIRED_MESSAGE,
} from "@/lib/departmentRequirement";
import { ROLE_DEFAULT_PASSWORDS } from "@/lib/roleDefaultPasswords";
import {
  createUserSchema,
  type CreateUserFormValues,
} from "@/lib/createUserSchema";
import {
  createAccountRecord,
  findAccountConflict,
  logAccountCreated,
} from "@/lib/createUserAccount";
import { AccountFields } from "@/components/forms/createUser/AccountFields";
import { RoleFields } from "@/components/forms/createUser/RoleFields";
import { StudentFields } from "@/components/forms/createUser/StudentFields";
import { TeacherFields } from "@/components/forms/createUser/TeacherFields";

type FormValues = CreateUserFormValues;

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
  const {
    user,
    role,
    displayName,
    institutionId: callerInstitutionId,
  } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // A student's additional classes (see lib/studentClasses.ts), validated on submit.
  const [extras, setExtras] = useState<ExtraClassesValue>({
    extraClassIds: [],
    classSubjects: {},
  });

  const roleOptions: Role[] =
    role === "super_admin"
      ? [
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
          "spectator",
          "super_admin",
        ]
      : ["senior_teacher", "regular_teacher", "student", "parent", "spectator"];

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
    getValues,
    watch,
    setError: setFieldError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues,
    mode: "onBlur",
  });

  const canonicalizePhone = usePhoneCanonicalizer();

  const secondaryAuth = useMemo(() => getUserCreationAuth(), []);

  // Optional photo — available for any role (PHOTO_UPLOAD_SPEC.md §Design
  // Decisions: this form isn't role-specialized). No existing photo to load
  // (this is account creation, not an edit), so state is simpler than the
  // Student/Teacher edit modals' equivalent.
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(
    initialPhotoDataUrl ?? null,
  );

  const selectedRole = watch("role");
  const institutionIdValue = watch("institutionId");
  const homeClassIdValue = watch("classId") ?? "";
  const requiresInstitution = selectedRole !== "super_admin";

  const { classes, departments, institutions, institutionName } =
    useCreateUserOptions({
      role,
      callerInstitutionId,
      institutionIdValue,
    });

  // Clear institutionId when switching to super_admin role
  useEffect(() => {
    if (!requiresInstitution) {
      setValue("institutionId", "", { shouldValidate: true });
    }
  }, [requiresInstitution, setValue]);

  // Pre-fill the role's default temporary password on every role change
  // (src/lib/roleDefaultPasswords.ts). A role with no default (institution_admin,
  // super_admin) keeps whatever
  // the admin typed, EXCEPT another role's well-known default left over from an
  // earlier selection: that is cleared, so these privileged accounts can never
  // be created with a public password by switching roles.
  useEffect(() => {
    const defaultPassword = ROLE_DEFAULT_PASSWORDS[selectedRole];
    if (defaultPassword) {
      setValue("password", defaultPassword, { shouldValidate: true });
      setValue("confirmPassword", defaultPassword, { shouldValidate: true });
      return;
    }
    const knownDefaults = Object.values(ROLE_DEFAULT_PASSWORDS);
    if (knownDefaults.includes(getValues("password"))) setValue("password", "");
    if (knownDefaults.includes(getValues("confirmPassword")))
      setValue("confirmPassword", "");
  }, [selectedRole, setValue, getValues]);

  // Set institutionId for institution_admin callers on every role change (prevents stale validation)
  useEffect(() => {
    if (role === "institution_admin" && callerInstitutionId) {
      setValue("institutionId", callerInstitutionId, { shouldValidate: true });
    }
  }, [role, callerInstitutionId, setValue, selectedRole]);

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

    const picked = {
      classId: values.classId,
      extraClassIds: extras.extraClassIds.filter((id) => id !== values.classId),
      classSubjects: extras.classSubjects,
    };
    const membershipProblem =
      values.role === "student" ? membershipError(picked) : "";
    if (membershipProblem) {
      setError(membershipProblem);
      return;
    }
    const membership = normaliseMembership(
      picked,
      classes.length > 0 ? new Set(classes.map((c) => c.id)) : undefined,
    );

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
    if (
      departmentRequired(values.role, departments.length > 0) &&
      !values.departmentId
    ) {
      setFieldError("departmentId", {
        type: "required",
        message: DEPARTMENT_REQUIRED_MESSAGE,
      });
      return;
    }

    const conflict = await findAccountConflict(values);
    if (conflict) {
      if (conflict.kind === "field") {
        setFieldError(conflict.field, { message: conflict.message });
      } else {
        setError(conflict.message);
      }
      return;
    }

    setLoading(true);
    const created = await createAccountRecord({
      values,
      secondaryAuth,
      creatorUid: user.uid,
      photoDataUrl,
      membership,
      classes,
      canonicalizePhone,
    });
    if (!created.ok) {
      setError(created.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    const createdUser = created.user;

    const createdName = [values.firstName, values.lastName].join(" ");
    await logAccountCreated({
      values,
      createdName,
      uid: createdUser.uid,
      creatorUid: user.uid,
      creatorName: actorName(displayName, user.email),
      photoAdded: Boolean(photoDataUrl),
    });

    setPhotoDataUrl(null);
    // A new person changes the dashboard counts, a class's population and the lists of people.
    invalidateUserCounts();
    invalidateUserLists();

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
        setValue("institutionId", callerInstitutionId, {
          shouldValidate: true,
        });
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
        <AccountFields
          register={register}
          errors={errors}
          canonicalizePhone={canonicalizePhone}
          photoDataUrl={photoDataUrl}
          onPhotoChange={setPhotoDataUrl}
        />

        <RoleFields
          register={register}
          errors={errors}
          role={role}
          lockedRole={lockedRole}
          roleOptions={roleOptions}
          selectedRole={selectedRole}
          requiresInstitution={requiresInstitution}
          initialInstitutionId={initialInstitutionId}
          institutionName={institutionName}
          institutions={institutions}
        />

        <TeacherFields
          register={register}
          errors={errors}
          selectedRole={selectedRole}
          departments={departments}
          classes={classes}
        />

        <StudentFields
          register={register}
          errors={errors}
          selectedRole={selectedRole}
          classes={classes}
          institutionIdValue={institutionIdValue}
          homeClassIdValue={homeClassIdValue}
          extras={extras}
          onExtrasChange={setExtras}
        />
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
