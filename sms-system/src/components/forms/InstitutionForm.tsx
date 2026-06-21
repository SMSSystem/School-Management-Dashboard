import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { FirebaseError } from 'firebase/app';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { db } from '@/lib/firebase';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must be 100 characters or less.'),
});

type FormValues = z.infer<typeof schema>;

type InstitutionFormProps = {
  onSuccess: (institutionId: string, institutionName: string) => void;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-500">{message}</p>;
}

function getFirebaseMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return 'Something went wrong while creating the institution.';
  }
  const messages: Record<string, string> = {
    'permission-denied': 'Firestore denied this write. Check your security rules.',
    'unavailable': 'Service temporarily unavailable. Try again.',
  };
  return messages[error.code] ?? error.message;
}

export default function InstitutionForm({ onSuccess }: InstitutionFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setLoading(true);

    try {
      const ref = doc(collection(db, 'institutions'));
      await setDoc(ref, {
        name: values.name,
        institutionId: ref.id,
        createdAt: serverTimestamp(),
        status: 'active',
      });
      onSuccess(ref.id, values.name);
    } catch (err) {
      setError(getFirebaseMessage(err));
      setLoading(false);
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:p-6"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Create Institution</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Register a new institution. You will create the admin account in the next step.
        </p>
      </div>

      <div className="mt-6">
        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Institution name
          <input
            {...register('name')}
            aria-invalid={Boolean(errors.name)}
            autoComplete="organization"
            placeholder="e.g. Anytown Unified School District"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 aria-invalid:border-red-400 aria-invalid:focus:ring-red-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <FieldError message={errors.name?.message} />
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
      >
        {loading ? 'Creating institution...' : 'Create institution'}
      </button>
    </form>
  );
}
