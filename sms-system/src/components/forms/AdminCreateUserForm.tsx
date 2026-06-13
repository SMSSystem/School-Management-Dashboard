import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { formatPhone } from '@/lib/phone';
import { FirebaseError, getApp, getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { db, firebaseConfig, ClassDocument, getRoleLabel, Role, UserStatus } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { departmentsData } from '@/lib/data';

const namePattern = /^[\p{L}][\p{L}' -]*$/u;
const phonePattern = /^\+?[0-9 ()-]{7,20}$/;

const createUserSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, 'First name must be at least 2 characters.')
      .max(50, 'First name must be 50 characters or less.')
      .regex(namePattern, 'Use letters, spaces, apostrophes, or hyphens only.'),
    lastName: z
      .string()
      .trim()
      .min(2, 'Last name must be at least 2 characters.')
      .max(50, 'Last name must be 50 characters or less.')
      .regex(namePattern, 'Use letters, spaces, apostrophes, or hyphens only.'),
    email: z
      .string()
      .trim()
      .min(1, 'Email is required.')
      .email('Enter a valid email address.')
      .max(254, 'Email must be 254 characters or less.'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(64, 'Password must be 64 characters or less.')
      .regex(/[a-z]/, 'Password needs at least one lowercase letter.')
      .regex(/[A-Z]/, 'Password needs at least one uppercase letter.')
      .regex(/[0-9]/, 'Password needs at least one number.'),
    confirmPassword: z.string().min(1, 'Confirm the temporary password.'),
    phone: z
      .string()
      .trim()
      .refine((value) => value === '' || phonePattern.test(value), 'Enter a valid phone number.'),
    role: z.enum(['institution_admin', 'senior_teacher', 'regular_teacher', 'student', 'parent', 'super_admin']),
    institutionId: z.string(),
    departmentId: z.string().optional(),
    classId: z.string().optional(),
    assignedClassId: z.string().optional(),
    dateOfBirth: z.string().optional(),
    institutionStudentId: z.string().max(50, 'Student ID must be 50 characters or less.').optional(),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }

    if (values.role !== 'super_admin' && !values.institutionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['institutionId'],
        message: 'Institution is required for this role.',
      });
    }

    if (values.role === 'student') {
      const dob = values.dateOfBirth ?? '';
      if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(Date.parse(dob))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dateOfBirth'],
          message: 'Date of birth is required.',
        });
      }
    }
  });

type FormValues = z.infer<typeof createUserSchema>;

function getFirebaseMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return 'Something went wrong while creating the user.';
  }

  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'That email already belongs to another account.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Password should be at least 8 characters.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'permission-denied': 'Firestore denied this write. Check your security rules for admin user creation.',
  };

  return messages[error.code] ?? error.message;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-500">{message}</p>;
}

type AdminCreateUserFormProps = {
  initialInstitutionId?: string;
  lockedRole?: Role;
  onSuccess?: (userName: string) => void;
};

export default function AdminCreateUserForm({
  initialInstitutionId,
  lockedRole,
  onSuccess,
}: AdminCreateUserFormProps = {}) {
  const { user, role, institutionId: callerInstitutionId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [classes, setClasses] = useState<(ClassDocument & { id: string })[]>([]);
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [institutionName, setInstitutionName] = useState('');

  const roleOptions: Role[] = role === 'super_admin'
    ? ['institution_admin', 'senior_teacher', 'regular_teacher', 'student', 'parent', 'super_admin']
    : ['senior_teacher', 'regular_teacher', 'student', 'parent'];

  const defaultValues: FormValues = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    role: lockedRole ?? (role === 'super_admin' ? 'institution_admin' : 'senior_teacher'),
    institutionId: initialInstitutionId ?? '',
    departmentId: '',
    classId: '',
    assignedClassId: '',
    dateOfBirth: '',
    institutionStudentId: '',
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
    mode: 'onBlur',
  });

  const { onChange: onPhoneChange, ...phoneReg } = register('phone');

  const secondaryAuth = useMemo(() => {
    const appName = 'user-creation';
    const secondaryApp = getApps().some((app) => app.name === appName)
      ? getApp(appName)
      : initializeApp(firebaseConfig, appName);
    return getAuth(secondaryApp);
  }, []);

  const selectedRole = watch('role');
  const institutionIdValue = watch('institutionId');
  const requiresInstitution = selectedRole !== 'super_admin';

  useEffect(() => {
    if (!institutionIdValue) { setClasses([]); return; }
    getDocs(query(collection(db, 'classes'), where('institutionId', '==', institutionIdValue)))
      .then((snap) =>
        setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassDocument & { id: string })))
      )
      .catch(() => setClasses([]));
  }, [institutionIdValue]);

  useEffect(() => {
    if (!requiresInstitution) {
      setValue('institutionId', '', { shouldValidate: true });
    }
  }, [requiresInstitution, setValue]);

  useEffect(() => {
    if (role === 'institution_admin' && callerInstitutionId) {
      setValue('institutionId', callerInstitutionId, { shouldValidate: true });
    }
  }, [role, callerInstitutionId, setValue]);

  useEffect(() => {
    if (role !== 'super_admin') return;
    getDocs(collection(db, 'institutions')).then((snap) => {
      setInstitutions(
        snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? d.id }))
      );
    });
  }, [role]);

  useEffect(() => {
    if (role !== 'institution_admin' || !callerInstitutionId) return;
    getDoc(doc(db, 'institutions', callerInstitutionId)).then((snap) => {
      setInstitutionName(snap.exists() ? ((snap.data().name as string) ?? callerInstitutionId) : callerInstitutionId);
    });
  }, [role, callerInstitutionId]);

  useEffect(() => {
    if (lockedRole) {
      setValue('role', lockedRole, { shouldValidate: true });
    }
  }, [lockedRole, setValue]);

  useEffect(() => {
    if (initialInstitutionId) {
      setValue('institutionId', initialInstitutionId, { shouldValidate: true });
    }
  }, [initialInstitutionId, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSuccess(null);

    if (role !== 'super_admin' && role !== 'institution_admin') {
      setError('Only admins can create users from this form.');
      return;
    }

    if (!user) {
      setError('You must be signed in before creating users.');
      return;
    }

    // Uniqueness check: prevent assigning the same homeroom class to two senior_teachers
    if (values.role === 'senior_teacher' && values.assignedClassId) {
      const conflict = await getDocs(
        query(
          collection(db, 'users'),
          where('institutionId', '==', values.institutionId),
          where('role', '==', 'senior_teacher'),
          where('assignedClassId', '==', values.assignedClassId),
        )
      );
      if (!conflict.empty) {
        setError('This class already has an assigned senior teacher.');
        return;
      }
    }

    if (values.role === 'student' && values.institutionStudentId) {
      const idConflict = await getDocs(
        query(
          collection(db, 'users'),
          where('institutionId', '==', values.institutionId),
          where('institutionStudentId', '==', values.institutionStudentId),
          where('role', '==', 'student'),
        )
      );
      if (!idConflict.empty) {
        setFieldError('institutionStudentId', { message: 'This student ID is already in use.' });
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
        values.password
      );
      createdUser = credentials.user;

      const fullName = [values.firstName, values.lastName].join(' ');
      const batch = writeBatch(db);

      batch.set(doc(db, 'users', createdUser.uid), {
        uid: createdUser.uid,
        firstName: values.firstName,
        lastName: values.lastName,
        name: fullName,
        email: normalizedEmail,
        phone: values.phone,
        role: values.role,
        institutionId: values.role === 'super_admin' ? '*' : values.institutionId,
        status: 'active' satisfies UserStatus,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        ...(values.role === 'student' && values.classId && { classId: values.classId }),
        ...(values.role === 'student' && {
          dateOfBirth: values.dateOfBirth || null,
          institutionStudentId: values.institutionStudentId || null,
        }),
        ...(values.role === 'senior_teacher' && {
          assignedClassId: values.assignedClassId || null,
          assignedClassName: values.assignedClassId
            ? (classes.find((c) => c.id === values.assignedClassId)?.name ?? null)
            : null,
        }),
      });

      if (values.role === 'senior_teacher' || values.role === 'regular_teacher') {
        batch.set(doc(db, 'teachers', createdUser.uid), {
          uid: createdUser.uid,
          institutionId: values.institutionId,
          teacherType: values.role === 'senior_teacher' ? 'senior' : 'regular',
          ...(values.role === 'senior_teacher' && values.departmentId && { departmentId: values.departmentId }),
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
      }

      if (values.role === 'student') {
        batch.set(doc(db, 'students', createdUser.uid), {
          uid: createdUser.uid,
          institutionId: values.institutionId,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
      }

      await batch.commit();
    } catch (err) {
      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch {
          // If rollback fails, Firebase Auth has the account but Firestore does not.
          // The batch guarantees no partial Firestore state between the two documents.
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

    const createdName = [values.firstName, values.lastName].join(' ');
    if (onSuccess) {
      onSuccess(createdName);
    } else {
      setSuccess(`${createdName} was created successfully.`);
      reset(defaultValues);
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-6 bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:p-6" noValidate>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Create User</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {lockedRole === 'institution_admin'
            ? 'Create the administrator account for this institution. They will use these credentials to log in and manage their institution\'s data.'
            : 'Add a login account and matching Firestore user profile.'}
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          First name
          <input
            {...register('firstName')}
            aria-invalid={Boolean(errors.firstName)}
            autoComplete="given-name"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.firstName?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Last name
          <input
            {...register('lastName')}
            aria-invalid={Boolean(errors.lastName)}
            autoComplete="family-name"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.lastName?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Email
          <input
            {...register('email')}
            aria-invalid={Boolean(errors.email)}
            autoComplete="email"
            type="email"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.email?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Temporary password
          <input
            {...register('password')}
            aria-invalid={Boolean(errors.password)}
            autoComplete="new-password"
            type="password"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.password?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Confirm password
          <input
            {...register('confirmPassword')}
            aria-invalid={Boolean(errors.confirmPassword)}
            autoComplete="new-password"
            type="password"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.confirmPassword?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Phone
          <input
            {...phoneReg}
            aria-invalid={Boolean(errors.phone)}
            autoComplete="tel"
            type="tel"
            onChange={(e) => {
              e.target.value = formatPhone(e.target.value);
              onPhoneChange(e);
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.phone?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Role
          {lockedRole ? (
            <input
              value={getRoleLabel(lockedRole)}
              disabled
              readOnly
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
            />
          ) : (
            <select
              {...register('role')}
              aria-invalid={Boolean(errors.role)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
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
            {role === 'institution_admin' ? (
              <input
                value={institutionName}
                disabled
                readOnly
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
              />
            ) : (
              <select
                {...register('institutionId')}
                aria-invalid={Boolean(errors.institutionId)}
                disabled={!!initialInstitutionId}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
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

        {selectedRole === 'senior_teacher' && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            Department
            <select
              {...register('departmentId')}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">No department</option>
              {departmentsData.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <FieldError message={errors.departmentId?.message} />
          </label>
        )}

        {selectedRole === 'senior_teacher' && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <span>Homeroom Class <span className="font-normal text-gray-400">(optional)</span></span>
            <select
              {...register('assignedClassId')}
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

        {selectedRole === 'student' && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <span>Class <span className="font-normal text-gray-400">(optional)</span></span>
            <select
              {...register('classId')}
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

        {selectedRole === 'student' && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            Date of birth
            <input
              {...register('dateOfBirth')}
              aria-invalid={Boolean(errors.dateOfBirth)}
              type="date"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <FieldError message={errors.dateOfBirth?.message} />
          </label>
        )}

        {selectedRole === 'student' && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <span>Student ID <span className="font-normal text-gray-400">(optional)</span></span>
            <input
              {...register('institutionStudentId')}
              aria-invalid={Boolean(errors.institutionStudentId)}
              maxLength={50}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <FieldError message={errors.institutionStudentId?.message} />
          </label>
        )}

      </div>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {success && <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{success}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
      >
        {loading ? 'Creating user...' : 'Create user'}
      </button>
    </form>
  );
}
