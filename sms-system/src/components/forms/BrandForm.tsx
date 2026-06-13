import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { InstitutionBrand } from '@/lib/AuthContext';

// Resize and base64-encode the institution image client-side.
// PNG input → PNG output (preserves transparency for logos with transparent backgrounds).
// All other formats → JPEG at quality 0.82.
function processImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 512;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const fmt     = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = fmt === 'image/jpeg' ? 0.82 : undefined;
      resolve(canvas.toDataURL(fmt, quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image.'));
    };
    img.src = objectUrl;
  });
}

const schema = z.object({
  name:       z.string().min(1, 'Institution name is required.'),
  motto:      z.string().optional(),
  phone:      z.string().optional(),
  email:      z.string().email('Invalid email address.').optional().or(z.literal('')),
  address:    z.string().optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (e.g. #1e40af).')
    .optional()
    .or(z.literal('')),
});

type BrandFormInputs = z.infer<typeof schema>;

interface BrandFormProps {
  institutionId: string;
  initialData?: Partial<InstitutionBrand>;
  readOnlyName?: boolean;
  onSuccess?: () => void;
  onSkip?: () => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-500">{message}</p>;
}

export default function BrandForm({
  institutionId,
  initialData,
  readOnlyName = false,
  onSuccess,
  onSkip,
}: BrandFormProps) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoFileError, setLogoFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<BrandFormInputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:       initialData?.name       ?? '',
      motto:      initialData?.motto      ?? '',
      phone:      initialData?.phone      ?? '',
      email:      initialData?.email      ?? '',
      address:    initialData?.address    ?? '',
      brandColor: initialData?.brandColor ?? '',
    },
  });

  const onSubmit = handleSubmit(async (formData) => {
    setError(null);
    setSubmitting(true);
    try {
      const updates: Record<string, unknown> = { ...formData };

      // Encode the institution image as a base64 data URI and store directly in Firestore
      if (logoFile) {
        updates.logoUrl = await processImage(logoFile);
      }

      await setDoc(doc(db, 'institutions', institutionId), updates, { merge: true });
      onSuccess?.();
    } catch {
      setError('Failed to save brand data. Please try again.');
    } finally {
      setSubmitting(false);
    }
  });

  const inputClass =
    'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
  const disabledClass =
    'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-400';
  const labelClass = 'flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200';

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:p-6"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Brand &amp; Profile</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          All fields except the institution name are optional.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">

        <label className={labelClass}>
          Institution name
          <input
            {...register('name')}
            disabled={readOnlyName}
            aria-invalid={Boolean(errors.name)}
            className={readOnlyName ? disabledClass : inputClass}
          />
          <FieldError message={errors.name?.message} />
        </label>

        <label className={labelClass}>
          Motto <span className="font-normal text-gray-400">(optional)</span>
          <input {...register('motto')} className={inputClass} />
        </label>

        <label className={labelClass}>
          Phone <span className="font-normal text-gray-400">(optional)</span>
          <input {...register('phone')} type="tel" className={inputClass} />
        </label>

        <label className={labelClass}>
          Email <span className="font-normal text-gray-400">(optional)</span>
          <input {...register('email')} type="email" aria-invalid={Boolean(errors.email)} className={inputClass} />
          <FieldError message={errors.email?.message} />
        </label>

        <label className={`${labelClass} md:col-span-2`}>
          Address <span className="font-normal text-gray-400">(optional)</span>
          <textarea {...register('address')} rows={3} className={`${inputClass} resize-none`} />
        </label>

        <label className={labelClass}>
          Brand color <span className="font-normal text-gray-400">(optional)</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={watch('brandColor') || '#7CC2EC'}
              onChange={(e) => setValue('brandColor', e.target.value, { shouldValidate: true })}
              className="w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-700"
            />
            <input
              {...register('brandColor')}
              type="text"
              placeholder="#1e40af"
              aria-invalid={Boolean(errors.brandColor)}
              className={`${inputClass} w-32`}
            />
          </div>
          <FieldError message={errors.brandColor?.message} />
          <p className="text-xs text-gray-400">
            For best results, choose a mid-range or light color. Very dark colors may reduce text readability.
          </p>
        </label>

        <label className={labelClass}>
          Institution image <span className="font-normal text-gray-400">(optional — logo / crest)</span>
          <div className="flex flex-col gap-2">
            {initialData?.logoUrl && !logoFile && (
              <img
                src={initialData.logoUrl}
                alt="Current institution image"
                className="w-16 h-16 object-contain rounded border border-gray-200 dark:border-gray-700"
              />
            )}
            {logoFile && (
              <img
                src={URL.createObjectURL(logoFile)}
                alt="New image preview"
                className="w-16 h-16 object-contain rounded border border-gray-200 dark:border-gray-700"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (file && file.size > 2 * 1024 * 1024) {
                  setLogoFileError('File exceeds the 2 MB limit. Please choose a smaller image.');
                  setLogoFile(null);
                  e.target.value = '';
                } else {
                  setLogoFileError(null);
                  setLogoFile(file);
                }
              }}
              className="text-sm text-gray-600 dark:text-gray-300"
            />
            {logoFileError && (
              <p className="text-xs text-red-500">{logoFileError}</p>
            )}
            <p className="text-xs text-gray-400">PNG or JPEG recommended. Maximum file size: 2 MB — image will be compressed before saving.</p>
          </div>
        </label>

      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Skip
          </button>
        )}
      </div>
    </form>
  );
}
