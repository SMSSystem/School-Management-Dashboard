import { formatPhone, formatPhoneForDisplay } from '@/lib/phone';
import type { GradingSystem } from '@/lib/firebase';
import type { WizardData } from '@/lib/institutionProfileLogic';
import { FieldError, inputClass, labelClass } from './FormFields';

// The seven steps of the institution profile wizard (InstitutionProfileWizard.tsx). The wizard keeps every
// value and handler; each step is the markup of one screen.

export function BasicInfoStep({
  data,
  update,
  errors,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Basic Info</h2>
      <label className={labelClass}>
        <span className="flex items-center gap-1">
          Institution name <span className="text-red-500">*</span>
        </span>
        <input
          id="tour-institution-profile-name"
          type="text"
          autoComplete="off"
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
          autoComplete="off"
          value={data.motto}
          onChange={(e) => update({ motto: e.target.value })}
          className={inputClass}
          placeholder="e.g. Excellence in all we do"
        />
        <FieldError message={errors.motto} />
        <p className="text-xs text-gray-400">Optional. Max 200 characters.</p>
      </label>
    </div>
  );
}

export function ContactStep({
  data,
  update,
  errors,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Contact Info</h2>
      <label className={labelClass}>
        Phone
        <input
          id="tour-institution-profile-phone"
          type="tel"
          autoComplete="off"
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
          autoComplete="off"
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
  );
}

export function LogoStep({
  data,
  update,
  logoFile,
  setLogoFile,
  logoFileError,
  setLogoFileError,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  logoFile: File | null;
  setLogoFile: (file: File | null) => void;
  logoFileError: string | null;
  setLogoFileError: (error: string | null) => void;
}) {
  return (
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
  );
}

export function SignatureStep({
  data,
  update,
  errors,
  setErrors,
  sigFile,
  setSigFile,
  sigFileError,
  setSigFileError,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  errors: Record<string, string>;
  setErrors: (errors: Record<string, string>) => void;
  sigFile: File | null;
  setSigFile: (file: File | null) => void;
  sigFileError: string | null;
  setSigFileError: (error: string | null) => void;
}) {
  return (
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
            autoComplete="off"
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
  );
}

export function RoleLabelsStep({
  data,
  update,
  errors,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  errors: Record<string, string>;
}) {
  return (
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
            autoComplete="off"
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
  );
}

export function GradingStep({
  data,
  update,
}: {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
}) {
  return (
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
  );
}

export function ReviewStep({
  data,
  saveError,
}: {
  data: WizardData;
  saveError: string | null;
}) {
  return (
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
            ['Phone',   formatPhoneForDisplay(data.phone) || '—'],
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
  );
}
