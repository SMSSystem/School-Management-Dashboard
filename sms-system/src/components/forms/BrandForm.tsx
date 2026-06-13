import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { HexColorPicker } from 'react-colorful';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatPhone } from '@/lib/phone';
import type { InstitutionBrand } from '@/lib/AuthContext';

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
  /**
   * 'full'          — all fields editable (default; used by super_admin and onboarding)
   * 'contact-only'  — only motto, phone, address editable; email shown read-only from authEmail
   */
  mode?: 'full' | 'contact-only';
  /** Used in contact-only mode to pre-fill the read-only email field. */
  authEmail?: string;
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
  mode = 'full',
  authEmail,
  onSuccess,
  onSkip,
}: BrandFormProps) {
  const contactOnly = mode === 'contact-only';

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoFileError, setLogoFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Color picker open/close state with click-outside dismissal
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colorPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPickerOpen]);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<BrandFormInputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:       initialData?.name       ?? '',
      motto:      initialData?.motto      ?? '',
      phone:      formatPhone(initialData?.phone ?? ''),
      email:      contactOnly ? (authEmail ?? '') : (initialData?.email ?? ''),
      address:    initialData?.address    ?? '',
      brandColor: initialData?.brandColor ?? '',
    },
  });

  const { onChange: onPhoneChange, ...phoneReg } = register('phone');

  const onSubmit = handleSubmit(async (formData) => {
    setError(null);
    setSubmitting(true);
    try {
      let updates: Record<string, unknown>;

      if (contactOnly) {
        // institution_admin: only save the three editable fields
        updates = {
          motto:   formData.motto,
          phone:   formData.phone,
          address: formData.address,
        };
      } else {
        updates = { ...formData };
        if (logoFile) {
          updates.logoUrl = await processImage(logoFile);
        }
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
    'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none cursor-not-allowed bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400';
  const labelClass = 'flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200';

  const currentColor = watch('brandColor') || '#7CC2EC';

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:p-6"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Brand &amp; Profile</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {contactOnly
            ? 'You can update your institution\'s motto, phone number, and address.'
            : 'All fields except the institution name are optional.'}
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">

        {/* Institution name */}
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

        {/* Motto */}
        <label className={labelClass}>
          Motto
          <input {...register('motto')} className={inputClass} />
        </label>

        {/* Phone */}
        <label className={labelClass}>
          Phone
          <input
            {...phoneReg}
            type="tel"
            onChange={(e) => {
              e.target.value = formatPhone(e.target.value);
              onPhoneChange(e);
            }}
            className={inputClass}
          />
        </label>

        {/* Email */}
        <label className={labelClass}>
          Email
          <input
            {...register('email')}
            type="email"
            disabled={contactOnly}
            aria-invalid={!contactOnly && Boolean(errors.email)}
            className={contactOnly ? disabledClass : inputClass}
          />
          {!contactOnly && <FieldError message={errors.email?.message} />}
        </label>

        {/* Address */}
        <label className={`${labelClass} md:col-span-2`}>
          Address
          <textarea {...register('address')} rows={3} className={`${inputClass} resize-none`} />
        </label>

        {/* Brand color */}
        <label className={labelClass}>
          Brand color
          <div className="flex items-center gap-2">
            {contactOnly ? (
              /* Read-only swatch for institution_admin */
              <div
                className="w-10 h-10 rounded border border-gray-300 dark:border-gray-700 shrink-0"
                style={{ backgroundColor: currentColor }}
                aria-hidden
              />
            ) : (
              /* Clickable swatch opens react-colorful picker */
              <div className="relative" ref={colorPickerRef}>
                <button
                  type="button"
                  onClick={() => setColorPickerOpen((o) => !o)}
                  className="w-10 h-10 rounded border border-gray-300 dark:border-gray-700 cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  style={{ backgroundColor: currentColor }}
                  aria-label="Open colour picker"
                />
                {colorPickerOpen && (
                  <div className="absolute z-20 mt-1 shadow-lg">
                    <HexColorPicker
                      color={currentColor}
                      onChange={(color) => setValue('brandColor', color, { shouldValidate: true })}
                    />
                  </div>
                )}
              </div>
            )}
            <input
              {...register('brandColor')}
              type="text"
              placeholder="#1e40af"
              disabled={contactOnly}
              aria-invalid={Boolean(errors.brandColor)}
              className={`${contactOnly ? disabledClass : inputClass} w-32`}
            />
          </div>
          <FieldError message={errors.brandColor?.message} />
          <p className="text-xs text-gray-400">For best results, choose a mid-range or light color.</p>
          <p className="text-xs text-gray-400">Very dark colors may reduce text readability.</p>
        </label>

        {/* Institution image */}
        {!contactOnly && (
          <div className={labelClass}>
            <span>Institution image</span>
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
              <p className="text-xs text-gray-400">PNG or JPEG recommended. Maximum file size: 2 MB.</p>
              <p className="text-xs text-gray-400">Image will be compressed before saving.</p>
            </div>
          </div>
        )}

        {/* Logo preview (read-only) for institution_admin */}
        {contactOnly && (
          <div className={labelClass}>
            <span>Institution image</span>
            <div className="flex flex-col gap-2">
              {initialData?.logoUrl ? (
                <img
                  src={initialData.logoUrl}
                  alt="Institution image"
                  className="w-16 h-16 object-contain rounded border border-gray-200 dark:border-gray-700"
                />
              ) : (
                <p className="text-xs text-gray-400 italic">No logo uploaded.</p>
              )}
            </div>
          </div>
        )}

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
