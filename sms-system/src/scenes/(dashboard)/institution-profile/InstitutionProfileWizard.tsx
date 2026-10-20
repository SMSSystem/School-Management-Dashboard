import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { processImage } from '@/lib/institutionProfileImage';
import { applyInstitutionDoc, initialWizardData, validateBasicInfo, validateContact, validateRoleLabels, validateSignatureText, type WizardData, type WizardStep } from '@/lib/institutionProfileLogic';
import { fetchInstitutionDoc, saveInstitutionProfile } from '@/lib/institutionProfileSave';
import { CalendarModeInterstitial } from './CalendarModeInterstitial';
import { StepIndicator } from './StepIndicator';
import { BasicInfoStep, ContactStep, LogoStep, SignatureStep, RoleLabelsStep, GradingStep, ReviewStep } from './WizardSteps';

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function InstitutionProfileWizard() {
  const { user, institutionId, institution, refreshProfile } = useAuth();
  // §4.1 fallback path: institution is non-null (a real, already-loaded
  // document — Protected already waited out the auth-load race) but its
  // calendarMode was never set by the onboarding step. The actual early
  // return using this lives below, after every hook in this component (same
  // spot as the existing fetchError check) — Rules of Hooks means it can't
  // short-circuit any earlier than that. institution === null (doc
  // genuinely missing/failed to load) falls through to the wizard's own
  // existing tolerance for that, rather than blocking behind a gate that
  // could never resolve.
  const needsCalendarModeChoice = !!institution && institution.calendarMode === undefined;

  const [step, setStep] = useState<WizardStep>(1);
  const [data, setData] = useState<WizardData>(initialWizardData(institution));

  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!institutionId) return;
    fetchInstitutionDoc(institutionId)
      .then((d) => {
        if (!d) return;
        setData((prev) => applyInstitutionDoc(prev, d));
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

  const goNext = async () => {
    setErrors({});

    if (step === 1) {
      const invalid = validateBasicInfo(data);
      if (invalid) { setErrors(invalid); return; }
    }

    if (step === 2) {
      const invalid = validateContact(data);
      if (invalid) { setErrors(invalid); return; }
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
      const invalidSignature = validateSignatureText(data);
      if (invalidSignature) {
        setErrors(invalidSignature);
        return;
      }
    }

    if (step === 5) {
      const invalid = validateRoleLabels(data);
      if (invalid) { setErrors(invalid); return; }
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
      await saveInstitutionProfile({
        institutionId: institutionId!,
        uid: user?.uid ?? null,
        currentName: institution?.name,
        data,
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

  if (needsCalendarModeChoice) {
    return <CalendarModeInterstitial institutionId={institutionId!} onChosen={refreshProfile} />;
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

        {/* ── Step 1 ── */}
        {step === 1 && (
          <BasicInfoStep
            data={data}
            update={update}
            errors={errors}
          />
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <ContactStep
            data={data}
            update={update}
            errors={errors}
          />
        )}

        {/* ── Step 3 ── */}
        {step === 3 && (
          <LogoStep
            data={data}
            update={update}
            logoFile={logoFile}
            setLogoFile={setLogoFile}
            logoFileError={logoFileError}
            setLogoFileError={setLogoFileError}
          />
        )}

        {/* ── Step 4 ── */}
        {step === 4 && (
          <SignatureStep
            data={data}
            update={update}
            errors={errors}
            setErrors={setErrors}
            sigFile={sigFile}
            setSigFile={setSigFile}
            sigFileError={sigFileError}
            setSigFileError={setSigFileError}
          />
        )}

        {/* ── Step 5 ── */}
        {step === 5 && (
          <RoleLabelsStep
            data={data}
            update={update}
            errors={errors}
          />
        )}

        {/* ── Step 6 ── */}
        {step === 6 && (
          <GradingStep
            data={data}
            update={update}
          />
        )}

        {/* ── Step 7 ── */}
        {step === 7 && (
          <ReviewStep
            data={data}
            saveError={saveError}
          />
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
