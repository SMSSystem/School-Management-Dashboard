import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FirebaseError, getApp, getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { db, firebaseConfig, getRoleLabel, Role } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';

const roleOptions: Role[] = ['institution_admin', 'teacher', 'student', 'parent', 'super_admin'];
const namePattern = /^[\p{L}][\p{L}' -]*$/u;
const phonePattern = /^\+?[0-9 ()-]{7,20}$/;
const institutionIdPattern = /^[A-Za-z0-9_-]+$/;

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
    role: z.enum(['institution_admin', 'teacher', 'student', 'parent', 'super_admin']),
    institutionId: z.string().trim().max(80, 'Institution ID must be 80 characters or less.'),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }

    if (values.role !== 'super_admin') {
      if (!values.institutionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['institutionId'],
          message: 'Institution ID is required for this role.',
        });
        return;
      }

      if (!institutionIdPattern.test(values.institutionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['institutionId'],
          message: 'Use only letters, numbers, underscores, or hyphens.',
        });
      }
    }
  });

type FormValues = z.infer<typeof createUserSchema>;

const defaultValues: FormValues = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  role: 'institution_admin',
  institutionId: '',
};

function getFirebaseMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return 'Something went wrong while creating the user.';
  }

  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'That email already belongs to another account.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Password should be at least 8 characters.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'permission-denied': 'Firestore denied this write. Check your security rules for super_admin user creation.',
  };

  return messages[error.code] ?? error.message;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-500">{message}</p>;
}

export default function SuperAdminCreateUserForm() {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues,
    mode: 'onBlur',
  });

  const secondaryAuth = useMemo(() => {
    const appName = 'user-creation';
    const secondaryApp = getApps().some((app) => app.name === appName)
      ? getApp(appName)
      : initializeApp(firebaseConfig, appName);
    return getAuth(secondaryApp);
  }, []);

  const selectedRole = watch('role');
  const requiresInstitution = selectedRole !== 'super_admin';

  useEffect(() => {
    if (!requiresInstitution) {
      setValue('institutionId', '', { shouldValidate: true });
    }
  }, [requiresInstitution, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSuccess(null);

    if (role !== 'super_admin') {
      setError('Only super admins can create users from this form.');
      return;
    }

    if (!user) {
      setError('You must be signed in before creating users.');
      return;
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

      await setDoc(doc(db, 'users', createdUser.uid), {
        uid: createdUser.uid,
        firstName: values.firstName,
        lastName: values.lastName,
        name: fullName,
        email: normalizedEmail,
        phone: values.phone,
        role: values.role,
        institutionId: values.role === 'super_admin' ? '*' : values.institutionId,
        status: 'active',
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });

      await signOut(secondaryAuth);
      setSuccess(`${fullName} was created successfully.`);
      reset(defaultValues);
    } catch (err) {
      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch {
          // If rollback fails, Firebase Auth has the account but Firestore does not.
        }
      }
      setError(getFirebaseMessage(err));
    } finally {
      setLoading(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-6 bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:p-6" noValidate>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Create User</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Add a login account and matching Firestore user profile.
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
            {...register('phone')}
            aria-invalid={Boolean(errors.phone)}
            autoComplete="tel"
            type="tel"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.phone?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Role
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
          <FieldError message={errors.role?.message} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Institution ID
          <input
            {...register('institutionId')}
            aria-invalid={Boolean(errors.institutionId)}
            disabled={!requiresInstitution}
            placeholder={requiresInstitution ? 'school-id' : 'Not needed for super admin'}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800"
          />
          <FieldError message={errors.institutionId?.message} />
        </label>
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
