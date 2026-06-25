import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { formatPhone } from '@/lib/phone';
import type { AuthorizedSignature, GradingSystem } from '@/lib/firebase';

// ─── Image processing ─────────────────────────────────────────────────────────

function processImage(file: File, maxPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const fmt = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(fmt, fmt === 'image/jpeg' ? 0.82 : undefined));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image.')); };
    img.src = objectUrl;
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type WizardData = {
  name: string;
  motto: string;
  phone: string;
  email: string;
  address: string;
  logoDataUrl: string | null;
  signatureMode: 'image' | 'text';
  signatureDataUrl: string | null;
  signatureText: string;
  classSupervisorLabel: string;
  gradeSupervisorLabel: string;
  principalLabel: string;
  vicePrincipalLabel: string;
  gradingSystem: GradingSystem;
};

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const step1Schema = z.object({
  name:  z.string().min(1, 'Institution name is required.'),
  motto: z.string().max(200, 'Motto must be 200 characters or fewer.').optional(),
});

const step2Schema = z.object({
  phone:   z.string().optional(),
  email:   z.string().email('Invalid email address.').optional().or(z.literal('')),
  address: z.string().max(300, 'Address must be 300 characters or fewer.').optional(),
});

const step5Schema = z.object({
  classSupervisorLabel: z.string().max(50, 'Max 50 characters.').optional(),
  gradeSupervisorLabel: z.string().max(50, 'Max 50 characters.').optional(),
  principalLabel:       z.string().max(50, 'Max 50 characters.').optional(),
  vicePrincipalLabel:   z.string().max(50, 'Max 50 characters.').optional(),
});

// ─── Shared UI ────────────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-500">{message}</p>;
}

const inputClass =
  'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200';

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEP_LABELS = ['Basic Info', 'Contact', 'Logo', 'Signature', 'Role Labels', 'Grading System', 'Review'];

function StepIndicator({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center gap-1 mb-6 flex-wrap">
      {STEP_LABELS.map((label, i) => {
        const num = i + 1;
        const active = num === step;
        const done = num < step;
        return (
          <div key={num} className="flex items-center gap-1">
            <div
              className={[
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                done
                  ? 'bg-sky-500 text-white'
                  : active
                  ? 'bg-sky-100 text-sky-700 ring-2 ring-sky-500 dark:bg-sky-900/40 dark:text-sky-300'
                  : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
              ].join(' ')}
            >
              {done ? '✓' : num}
            </div>
            <span
              className={[
                'hidden sm:block text-xs',
                active
                  ? 'text-sky-700 font-semibold dark:text-sky-400'
                  : done
                  ? 'text-gray-500 dark:text-gray-400'
                  : 'text-gray-400 dark:text-gray-500',
              ].join(' ')}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={[
                  'mx-1 h-px w-4 shrink-0',
                  done ? 'bg-sky-400' : 'bg-gray-200 dark:bg-gray-700',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

function InstitutionProfileWizard() {
  const { institutionId, institution, refreshProfile } = useAuth();

  const [step, setStep] = useState<WizardStep>(1);
  const [data, setData] = useState<WizardData>({
    name:                institution?.name   ?? '',
    motto:               institution?.motto  ?? '',
    phone:               formatPhone(institution?.phone ?? ''),
    email:               institution?.email  ?? '',
    address:             institution?.address ?? '',
    logoDataUrl:         institution?.logoUrl ?? null,
    signatureMode:       'text',
    signatureDataUrl:    null,
    signatureText:       '',
    classSupervisorLabel: '',
    gradeSupervisorLabel: '',
    principalLabel:      '',
    vicePrincipalLabel:  '',
    gradingSystem:       'flat',
  });

  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!institutionId) return;
    getDoc(doc(db, 'institutions', institutionId))
      .then((snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const sig = d.authorizedSignature as AuthorizedSignature | undefined;
        setData((prev) => ({
          ...prev,
          signatureMode:        sig?.mode    ?? 'text',
          signatureDataUrl:     sig?.imageUrl ?? null,
          signatureText:        sig?.text     ?? '',
          classSupervisorLabel: (d.classSupervisorLabel as string | undefined) ?? '',
          gradeSupervisorLabel: (d.gradeSupervisorLabel as string | undefined) ?? '',
          principalLabel:       (d.principalLabel       as string | undefined) ?? '',
          vicePrincipalLabel:   (d.vicePrincipalLabel   as string | undefined) ?? '',
          gradingSystem:        ((d.gradingSystem as string | undefined) === 'weighted' ? 'weighted' : 'flat') as GradingSystem,
        }));
      })
      .catch(() => setFetchError(true));
  }, [institutionId]);

  const update = (patch: Partial<WizardData>) => setData((d) => ({ ...d, ...patch }));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoFileError, setLogoFileError] = useState<string | null>(null);
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [sigFileError, setSigFileError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const parseErrors = (err: z.ZodError): Record<string, string> => {
    const out: Record<string, string> = {};
    err.issues.forEach((e) => { if (e.path[0]) out[String(e.path[0])] = e.message; });
    return out;
  };

  const goNext = async () => {
    setErrors({});

    if (step === 1) {
      const result = step1Schema.safeParse({ name: data.name, motto: data.motto || undefined });
      if (!result.success) { setErrors(parseErrors(result.error)); return; }
    }

    if (step === 2) {
      const result = step2Schema.safeParse({
        phone:   data.phone   || undefined,
        email:   data.email   || undefined,
        address: data.address || undefined,
      });
      if (!result.success) { setErrors(parseErrors(result.error)); return; }
    }

    if (step === 3 && logoFile) {
      setProcessing(true);
      setLogoFileError(null);
      try {
        const dataUrl = await processImage(logoFile, 512);
        update({ logoDataUrl: dataUrl });
        setLogoFile(null);
      } catch {
        setLogoFileError('Failed to process image. Please try another file.');
        setProcessing(false);
        return;
      }
      setProcessing(false);
    }

    if (step === 4) {
      if (data.signatureMode === 'image' && sigFile) {
        setProcessing(true);
        setSigFileError(null);
        try {
          const dataUrl = await processImage(sigFile, 300);
          update({ signatureDataUrl: dataUrl });
          setSigFile(null);
        } catch {
          setSigFileError('Failed to process image. Please try another file.');
          setProcessing(false);
          return;
        }
        setProcessing(false);
      }
      if (data.signatureMode === 'text' && data.signatureText.length > 30) {
        setErrors({ signatureText: 'Signature text must be 30 characters or fewer.' });
        return;
      }
    }

    if (step === 5) {
      const result = step5Schema.safeParse({
        classSupervisorLabel: data.classSupervisorLabel || undefined,
        gradeSupervisorLabel: data.gradeSupervisorLabel || undefined,
        principalLabel:       data.principalLabel       || undefined,
        vicePrincipalLabel:   data.vicePrincipalLabel   || undefined,
      });
      if (!result.success) { setErrors(parseErrors(result.error)); return; }
    }

    setStep((s) => Math.min(s + 1, 7) as WizardStep);
  };

  const goBack = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 1) as WizardStep);
  };

  const saveProfile = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateDoc(doc(db, 'institutions', institutionId!), {
        name:    data.name,
        motto:   data.motto   || null,
        phone:   data.phone   || null,
        email:   data.email   || null,
        address: data.address || null,
        logoUrl: data.logoDataUrl || null,
        authorizedSignature:
          data.signatureMode === 'image'
            ? { mode: 'image', imageUrl: data.signatureDataUrl }
            : { mode: 'text',  text: data.signatureText || null },
        classSupervisorLabel: data.classSupervisorLabel || 'Class Supervisor',
        gradeSupervisorLabel: data.gradeSupervisorLabel || 'Grade Supervisor',
        principalLabel:       data.principalLabel       || 'Principal',
        vicePrincipalLabel:   data.vicePrincipalLabel   || 'Vice Principal',
        gradingSystem:        data.gradingSystem,
        profileComplete: true,
      });
      await refreshProfile();
      // Stay on the institution-profile page — the completed profile view renders automatically.
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (fetchError) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">Failed to load institution data. Please refresh and try again.</p>
      </div>
    );
  }

  return (
    <div className="w-full p-4 sm:p-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
        Institution Profile
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Complete your institution profile to enable report card generation.
      </p>

      <StepIndicator step={step} />

      <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:p-6">

        {/* ── Step 1: Basic Info ── */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Basic Info</h2>
            <label className={labelClass}>
              <span className="flex items-center gap-1">
                Institution name <span className="text-red-500">*</span>
              </span>
              <input
                id="tour-institution-profile-name"
                type="text"
                value={data.name}
                onChange={(e) => update({ name: e.target.value })}
                className={inputClass}
                autoFocus
              />
              <FieldError message={errors.name} />
            </label>
            <label className={labelClass}>
              Motto
              <input
                id="tour-institution-profile-motto"
                type="text"
                value={data.motto}
                onChange={(e) => update({ motto: e.target.value })}
                className={inputClass}
                placeholder="e.g. Excellence in all we do"
              />
              <FieldError message={errors.motto} />
              <p className="text-xs text-gray-400">Optional. Max 200 characters.</p>
            </label>
          </div>
        )}

        {/* ── Step 2: Contact ── */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Contact Info</h2>
            <label className={labelClass}>
              Phone
              <input
                id="tour-institution-profile-phone"
                type="tel"
                value={data.phone}
                onChange={(e) => update({ phone: formatPhone(e.target.value) })}
                className={inputClass}
              />
              <FieldError message={errors.phone} />
            </label>
            <label className={labelClass}>
              Email
              <input
                id="tour-institution-profile-email"
                type="email"
                value={data.email}
                onChange={(e) => update({ email: e.target.value })}
                className={inputClass}
              />
              <FieldError message={errors.email} />
            </label>
            <label className={labelClass}>
              Address
              <textarea
                id="tour-institution-profile-address"
                value={data.address}
                onChange={(e) => update({ address: e.target.value })}
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <FieldError message={errors.address} />
            </label>
          </div>
        )}

        {/* ── Step 3: Logo ── */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Institution Logo</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The logo appears on the report card cover. PNG or JPEG recommended.
            </p>

            {data.logoDataUrl && !logoFile && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">Current logo</span>
                <img
                  src={data.logoDataUrl}
                  alt="Current logo"
                  className="w-24 h-24 object-contain rounded border border-gray-200 dark:border-gray-700"
                />
              </div>
            )}
            {logoFile && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">New logo preview</span>
                <img
                  src={URL.createObjectURL(logoFile)}
                  alt="Logo preview"
                  className="w-24 h-24 object-contain rounded border border-gray-200 dark:border-gray-700"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <input
                id="tour-institution-profile-logo-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="text-sm text-gray-600 dark:text-gray-300"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && file.size > 2 * 1024 * 1024) {
                    setLogoFileError('File exceeds the 2 MB limit.');
                    setLogoFile(null);
                    e.target.value = '';
                  } else {
                    setLogoFileError(null);
                    setLogoFile(file);
                  }
                }}
              />
              {logoFileError && <p className="text-xs text-red-500">{logoFileError}</p>}
              <p className="text-xs text-gray-400">Max 2 MB. Will be resized to max 512 px before saving.</p>
            </div>

            {data.logoDataUrl && (
              <button
                id="tour-institution-profile-logo-remove"
                type="button"
                onClick={() => { update({ logoDataUrl: null }); setLogoFile(null); }}
                className="self-start text-xs text-red-500 hover:underline"
              >
                Remove logo
              </button>
            )}
          </div>
        )}

        {/* ── Step 4: Signature ── */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Authorized Signature</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Appears at the bottom of the report card. Choose a signature image or enter a name as text.
            </p>

            <div className="flex gap-2">
              {(['text', 'image'] as const).map((mode) => (
                <button
                  key={mode}
                  id={`tour-institution-profile-sig-mode-${mode}`}
                  type="button"
                  onClick={() => { update({ signatureMode: mode }); setErrors({}); }}
                  className={[
                    'px-3 py-1.5 rounded-md text-sm font-medium border transition',
                    data.signatureMode === mode
                      ? 'bg-sky-500 text-white border-sky-500'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800',
                  ].join(' ')}
                >
                  {mode === 'text' ? 'Text' : 'Image'}
                </button>
              ))}
            </div>

            {data.signatureMode === 'text' && (
              <label className={labelClass}>
                Signature text
                <input
                  id="tour-institution-profile-sig-text"
                  type="text"
                  value={data.signatureText}
                  maxLength={30}
                  onChange={(e) => update({ signatureText: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Dr. Jane Smith"
                />
                <FieldError message={errors.signatureText} />
                <p className="text-xs text-gray-400">{data.signatureText.length}/30 characters.</p>
              </label>
            )}

            {data.signatureMode === 'image' && (
              <div className="flex flex-col gap-3">
                {data.signatureDataUrl && !sigFile && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Current signature</span>
                    <img
                      src={data.signatureDataUrl}
                      alt="Current signature"
                      className="h-16 object-contain rounded border border-gray-200 dark:border-gray-700 self-start"
                    />
                  </div>
                )}
                {sigFile && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">New signature preview</span>
                    <img
                      src={URL.createObjectURL(sigFile)}
                      alt="Signature preview"
                      className="h-16 object-contain rounded border border-gray-200 dark:border-gray-700 self-start"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <input
                    id="tour-institution-profile-sig-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="text-sm text-gray-600 dark:text-gray-300"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file && file.size > 1 * 1024 * 1024) {
                        setSigFileError('File exceeds the 1 MB limit.');
                        setSigFile(null);
                        e.target.value = '';
                      } else {
                        setSigFileError(null);
                        setSigFile(file);
                      }
                    }}
                  />
                  {sigFileError && <p className="text-xs text-red-500">{sigFileError}</p>}
                  <p className="text-xs text-gray-400">Max 1 MB. Will be resized to max 300 px before saving.</p>
                </div>
                {data.signatureDataUrl && (
                  <button
                    id="tour-institution-profile-sig-remove"
                    type="button"
                    onClick={() => { update({ signatureDataUrl: null }); setSigFile(null); }}
                    className="self-start text-xs text-red-500 hover:underline"
                  >
                    Remove signature image
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 5: Role Labels ── */}
        {step === 5 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Role Labels</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Customize how staff roles are labeled on report cards. Leave blank to use the default.
            </p>
            {(
              [
                ['classSupervisorLabel', 'Class Supervisor', 'Class Supervisor label'],
                ['gradeSupervisorLabel', 'Grade Supervisor', 'Grade Supervisor label'],
                ['principalLabel',       'Principal',        'Principal label'],
                ['vicePrincipalLabel',   'Vice Principal',   'Vice Principal label'],
              ] as [keyof WizardData, string, string][]
            ).map(([key, placeholder, label]) => (
              <label key={String(key)} className={labelClass}>
                {label}
                <input
                  id={`tour-institution-profile-${String(key).replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`}
                  type="text"
                  value={data[key] as string}
                  onChange={(e) => update({ [key]: e.target.value })}
                  className={inputClass}
                  placeholder={`Default: "${placeholder}"`}
                  maxLength={50}
                />
                <FieldError message={errors[String(key)]} />
              </label>
            ))}
          </div>
        )}

        {/* ── Step 6: Grading System ── */}
        {step === 6 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Grading System</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Choose how results are graded on report cards.
            </p>
            <div className="flex flex-col gap-3">
              {([
                ['flat', 'Flat (A, B, C, F)', 'Grades use standard letter grades without plus or minus modifiers.'],
                ['weighted', 'Weighted (A+, A, A−, B+ …)', 'Grades include plus and minus modifiers for finer distinctions.'],
              ] as [GradingSystem, string, string][]).map(([value, label, description]) => (
                <label
                  key={value}
                  className={[
                    'flex items-start gap-3 rounded-md border p-4 cursor-pointer transition',
                    data.gradingSystem === value
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-sky-300',
                  ].join(' ')}
                >
                  <input
                    id={`tour-institution-profile-grading-${value}`}
                    type="radio"
                    name="gradingSystem"
                    value={value}
                    checked={data.gradingSystem === value}
                    onChange={() => update({ gradingSystem: value })}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 7: Review ── */}
        {step === 7 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Review & Save</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Check the details below, then save your institution profile.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2 text-sm">
              {/* Left column: Name, Motto, Address, Phone, Email, Logo */}
              <div className="flex flex-col gap-2">
                {([
                  ['Name',    data.name    ],
                  ['Motto',   data.motto   || '—'],
                  ['Address', data.address || '—'],
                  ['Phone',   data.phone   || '—'],
                  ['Email',   data.email   || '—'],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <dt className="w-20 shrink-0 text-gray-500">{label}</dt>
                    <dd className="text-gray-800 dark:text-gray-200 whitespace-pre-line">{value}</dd>
                  </div>
                ))}
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-gray-500">Logo</dt>
                  <dd>
                    {data.logoDataUrl ? (
                      <img
                        src={data.logoDataUrl}
                        alt="Logo"
                        className="w-14 h-14 object-contain rounded border border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <span className="text-gray-400 italic">None</span>
                    )}
                  </dd>
                </div>
              </div>

              {/* Right column: Grading System, Signature, Principal, Vice Principal, Grade Supervisor, Class Supervisor */}
              <div className="flex flex-col gap-2 mt-4 sm:mt-0">
                <div className="flex gap-2">
                  <dt className="w-36 shrink-0 text-gray-500">Grading System</dt>
                  <dd className="text-gray-800 dark:text-gray-200">
                    {data.gradingSystem === 'weighted' ? 'Weighted (A+, A, A−…)' : 'Flat (A, B, C, F)'}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-36 shrink-0 text-gray-500">Signature</dt>
                  <dd>
                    {data.signatureMode === 'text' ? (
                      data.signatureText || <span className="text-gray-400 italic">None</span>
                    ) : data.signatureDataUrl ? (
                      <img
                        src={data.signatureDataUrl}
                        alt="Signature"
                        className="h-12 object-contain rounded border border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <span className="text-gray-400 italic">None</span>
                    )}
                  </dd>
                </div>
                {([
                  ['Principal',       data.principalLabel       || 'Principal'],
                  ['Vice Principal',  data.vicePrincipalLabel   || 'Vice Principal'],
                  ['Grade Supervisor',data.gradeSupervisorLabel || 'Grade Supervisor'],
                  ['Class Supervisor',data.classSupervisorLabel || 'Class Supervisor'],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <dt className="w-36 shrink-0 text-gray-500">{label}</dt>
                    <dd className="text-gray-800 dark:text-gray-200">{value}</dd>
                  </div>
                ))}
              </div>
            </div>

            {saveError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
                {saveError}
              </p>
            )}
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="mt-6 flex items-center justify-between">
          <button
            id="tour-institution-profile-wizard-back"
            type="button"
            onClick={goBack}
            disabled={step === 1}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Back
          </button>

          {step < 7 ? (
            <button
              id="tour-institution-profile-wizard-next"
              type="button"
              onClick={goNext}
              disabled={processing}
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
            >
              {processing ? 'Processing…' : 'Next'}
            </button>
          ) : (
            <button
              id="tour-institution-profile-wizard-save"
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
            >
              {saving ? 'Saving…' : 'Save Institution Profile'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Read-only display ────────────────────────────────────────────────────────

function InstitutionInfoDisplay() {
  const { institution } = useAuth();

  if (!institution) return null;

  return (
    <div className="max-w-xl mx-auto p-4 flex flex-col items-center gap-3">
      {institution.logoUrl && (
        <img
          src={institution.logoUrl}
          alt={institution.name}
          className="w-28 h-28 object-contain rounded-lg shadow-sm"
        />
      )}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{institution.name}</h1>
        {institution.motto && (
          <p className="mt-1 text-sm italic text-gray-500 dark:text-gray-400">{institution.motto}</p>
        )}
      </div>
      <div className="w-full bg-white dark:bg-gray-800 rounded-md p-4 flex flex-col gap-2 text-sm">
        {institution.address && (
          <div className="flex items-start gap-2">
            <span className="text-gray-500 w-20 shrink-0">Address</span>
            <span className="text-gray-800 dark:text-gray-200 whitespace-pre-line">{institution.address}</span>
          </div>
        )}
        {institution.phone && (
          <div className="flex items-start gap-2">
            <span className="text-gray-500 w-20 shrink-0">Phone</span>
            <span className="text-gray-800 dark:text-gray-200">{institution.phone}</span>
          </div>
        )}
        {institution.email && (
          <div className="flex items-start gap-2">
            <span className="text-gray-500 w-20 shrink-0">Email</span>
            <a href={`mailto:${institution.email}`} className="text-sky-600 hover:underline">
              {institution.email}
            </a>
          </div>
        )}
        {!institution.address && !institution.phone && !institution.email && (
          <p className="text-gray-400 text-xs italic">No contact details on record.</p>
        )}
      </div>
    </div>
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const InstitutionProfilePage = () => {
  const { role, institution } = useAuth();

  if (role !== 'institution_admin') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <InstitutionInfoDisplay />
      </div>
    );
  }

  if (institution?.profileComplete) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-semibold text-center text-gray-900 dark:text-gray-100 mb-4">
          Institution Profile
        </h1>
        <InstitutionInfoDisplay />
        <p className="mt-4 text-center text-sm text-gray-400 dark:text-gray-500">
          Please contact the service administrator to edit your institution's profile data.
        </p>
      </div>
    );
  }

  return <InstitutionProfileWizard />;
};

export default InstitutionProfilePage;
