import { useState } from "react";
import { useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRegistrationDirectory } from "@/hooks/useRegistrationDirectory";
import {
  buildRegistrationDocument,
  buildSchema,
  resolveProgramme,
  type RegistrationFormValues,
} from "@/lib/registrationFormLogic";
import { submitRegistration } from "@/lib/registrationFormSave";
import FieldError from "./FieldError";
import GuardianSection from "./GuardianSection";
import ProgrammeField from "./ProgrammeField";
import RegistrationHeader from "./RegistrationHeader";
import RegistrationReceived from "./RegistrationReceived";
import StudentFields from "./StudentFields";

export default function StudentRegistrationFormPage() {
  const { institutionId } = useParams<{ institutionId: string }>();
  const { directory, isCustomMode } = useRegistrationDirectory(institutionId);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Optional student photo — student step only (PHOTO_UPLOAD_SPEC.md §Design
  // Decisions), carried over to the created account on conversion by
  // ConvertToAccountsPanel.tsx. Kept as local state rather than a
  // zod-validated form field, same pattern as the other 3 photo-upload
  // surfaces built so far.
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationFormValues>({
    resolver: zodResolver(buildSchema(isCustomMode)),
    defaultValues: {
      academicYearId: "",
      student: {
        lastName: "",
        firstName: "",
        middleName: "",
        requestedClass: "",
        dateOfBirth: "",
        gender: undefined,
        email: "",
        lastSchoolAttended: "",
        phone: "",
        phone2: "",
        citizenId: "",
      },
      includeMother: false,
      includeFather: false,
    },
  });

  const includeMother = watch("includeMother");
  const includeFather = watch("includeFather");

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    if (!institutionId || !directory) return;

    const programme = resolveProgramme(directory, isCustomMode, values.academicYearId);
    if ("error" in programme) {
      setSubmitError(programme.error);
      return;
    }

    try {
      await submitRegistration(
        institutionId,
        buildRegistrationDocument({ institutionId, programme, values, photoDataUrl }),
      );
      setSubmitted(true);
    } catch {
      setSubmitError(
        "Something went wrong submitting your registration. Please try again.",
      );
    }
  });

  if (directory === undefined) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }
  if (!directory) return null; // redirect effect in useRegistrationDirectory handles navigation

  if (submitted) return <RegistrationReceived directory={directory} />;

  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-10">
        <RegistrationHeader directory={directory} isCustomMode={isCustomMode} />

        <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
          {isCustomMode && (
            <ProgrammeField directory={directory} register={register} errors={errors} />
          )}

          <StudentFields
            register={register}
            errors={errors}
            photoDataUrl={photoDataUrl}
            onPhotoChange={setPhotoDataUrl}
          />

          <GuardianSection
            prefix="mother"
            title="Add mother's information"
            included={includeMother}
            register={register}
            errors={errors}
          />
          <GuardianSection
            prefix="father"
            title="Add father's information"
            included={includeFather}
            register={register}
            errors={errors}
          />

          <FieldError message={errors.includeMother?.message} />

          {submitError && <p className="text-sm text-red-500">{submitError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-sky-500 text-white py-2.5 rounded-lg text-base font-semibold disabled:opacity-50 hover:bg-sky-600"
          >
            {isSubmitting ? "Submitting…" : "Submit Registration"}
          </button>
        </form>
      </div>
    </div>
  );
}
