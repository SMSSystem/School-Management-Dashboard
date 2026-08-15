import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { RegistrationDirectoryEntry } from "@/lib/firebase";
import { institutionCollection } from "@/lib/paths";

const guardianSchema = z.object({
  lastName: z.string().min(1, "Last name is required.").max(100),
  firstName: z.string().min(1, "First name is required.").max(100),
  address: z.string().min(1, "Address is required.").max(300),
  contact: z.string().min(1, "Contact number is required.").max(50),
  email: z.string().min(1, "Email is required.").email("Enter a valid email address.").max(254),
  occupation: z.string().max(100).optional().or(z.literal("")),
  work: z.string().max(100).optional().or(z.literal("")),
});

const schema = z
  .object({
    student: z.object({
      lastName: z.string().min(1, "Last name is required.").max(100),
      firstName: z.string().min(1, "First name is required.").max(100),
      middleName: z.string().max(100).optional().or(z.literal("")),
      requestedClass: z.string().min(1, "Requested class/grade is required.").max(50),
      dateOfBirth: z.string().min(1, "Date of birth is required."),
      gender: z.enum(["Male", "Female"], { message: "Please select a gender." }),
      email: z.string().email("Enter a valid email address.").max(254).optional().or(z.literal("")),
      lastSchoolAttended: z.string().max(200).optional().or(z.literal("")),
    }),
    includeMother: z.boolean(),
    includeFather: z.boolean(),
    mother: guardianSchema.optional(),
    father: guardianSchema.optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.includeMother && !values.includeFather) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["includeMother"],
        message: "Provide at least one parent/guardian's information.",
      });
    }
    if (values.includeMother && !values.mother) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mother"], message: "Mother's information is required." });
    }
    if (values.includeFather && !values.father) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["father"], message: "Father's information is required." });
    }
  });

type FormValues = z.infer<typeof schema>;

// Deliberately light-only, matching the register picker and login pages —
// this whole public auth/register flow has no dark-mode treatment, so these
// must not inherit dark: variants from the authenticated app's shared
// styling conventions even if a visitor's browser has .dark set globally
// from a prior dashboard session (see STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md
// Phase 7 QA notes).
const inputClass =
  "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400";
const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-gray-700";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-500">{message}</p>;
}

function GuardianFields({
  prefix,
  register,
  errors,
}: {
  prefix: "mother" | "father";
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
}) {
  const err = errors[prefix];
  return (
    <div className="grid gap-4 sm:grid-cols-2 mt-3 pl-4 border-l-2 border-sky-100">
      <label className={labelClass}>
        Last name
        <input {...register(`${prefix}.lastName`)} className={inputClass} />
        <FieldError message={err?.lastName?.message} />
      </label>
      <label className={labelClass}>
        First name
        <input {...register(`${prefix}.firstName`)} className={inputClass} />
        <FieldError message={err?.firstName?.message} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Address
        <input {...register(`${prefix}.address`)} className={inputClass} />
        <FieldError message={err?.address?.message} />
      </label>
      <label className={labelClass}>
        Contact number
        <input {...register(`${prefix}.contact`)} className={inputClass} />
        <FieldError message={err?.contact?.message} />
      </label>
      <label className={labelClass}>
        Email
        <input type="email" {...register(`${prefix}.email`)} className={inputClass} />
        <FieldError message={err?.email?.message} />
      </label>
      <label className={labelClass}>
        <span>
          Occupation <span className="font-normal text-gray-400">(optional)</span>
        </span>
        <input {...register(`${prefix}.occupation`)} className={inputClass} />
      </label>
      <label className={labelClass}>
        <span>
          Employer <span className="font-normal text-gray-400">(optional)</span>
        </span>
        <input {...register(`${prefix}.work`)} className={inputClass} />
      </label>
    </div>
  );
}

export default function StudentRegistrationFormPage() {
  const { institutionId } = useParams<{ institutionId: string }>();
  const navigate = useNavigate();
  const [directory, setDirectory] = useState<(RegistrationDirectoryEntry & { id: string }) | null | undefined>(
    undefined,
  );
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!institutionId) return;
    getDoc(doc(db, "registration_directory", institutionId)).then((snap) => {
      if (!snap.exists() || !(snap.data() as RegistrationDirectoryEntry).acceptingRegistrations) {
        setDirectory(null);
        return;
      }
      setDirectory({ id: institutionId, ...(snap.data() as RegistrationDirectoryEntry) });
    });
  }, [institutionId]);

  useEffect(() => {
    if (directory === null) {
      navigate("/register", {
        replace: true,
        state: { message: "That institution isn't accepting registrations right now." },
      });
    }
  }, [directory, navigate]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      student: {
        lastName: "",
        firstName: "",
        middleName: "",
        requestedClass: "",
        dateOfBirth: "",
        gender: undefined,
        email: "",
        lastSchoolAttended: "",
      },
      includeMother: false,
      includeFather: false,
    },
  });

  const includeMother = watch("includeMother");
  const includeFather = watch("includeFather");

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    if (!directory?.activeAcademicYearId || !institutionId) {
      setSubmitError("This institution hasn't set an active academic year yet. Please contact them directly.");
      return;
    }
    try {
      await addDoc(institutionCollection(institutionId, "enrollmentRegistrations"), {
        institutionId,
        academicYearId: directory.activeAcademicYearId,
        academicYearName: directory.activeAcademicYearName ?? "",
        status: "pending",
        submittedAt: serverTimestamp(),
        possibleDuplicate: false, // computed by the reviewing admin's client, not here — see Phase 9
        student: {
          lastName: values.student.lastName,
          firstName: values.student.firstName,
          ...(values.student.middleName && { middleName: values.student.middleName }),
          requestedClass: values.student.requestedClass,
          dateOfBirth: values.student.dateOfBirth,
          gender: values.student.gender,
          ...(values.student.email && { email: values.student.email }),
          ...(values.student.lastSchoolAttended && { lastSchoolAttended: values.student.lastSchoolAttended }),
        },
        mother: values.includeMother && values.mother ? values.mother : null,
        father: values.includeFather && values.father ? values.father : null,
      });
      setSubmitted(true);
    } catch {
      setSubmitError("Something went wrong submitting your registration. Please try again.");
    }
  });

  if (directory === undefined) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }
  if (!directory) return null; // redirect effect above handles navigation

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-10 max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Registration received</h1>
          <p className="text-base leading-relaxed text-slate-600">
            Thank you — {directory.name} has received your registration and will be in touch.
          </p>
          <Link
            to="/login"
            className="mt-6 block w-full bg-sky-500 text-white py-2.5 rounded-lg text-base font-semibold hover:bg-sky-600"
          >
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
            <img src={directory.logoUrl || "/logo.png"} alt="" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{directory.name}</h1>
            <p className="text-xs text-slate-500">Student Registration — {directory.activeAcademicYearName}</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Student Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Last name
                <input {...register("student.lastName")} className={inputClass} />
                <FieldError message={errors.student?.lastName?.message} />
              </label>
              <label className={labelClass}>
                First name
                <input {...register("student.firstName")} className={inputClass} />
                <FieldError message={errors.student?.firstName?.message} />
              </label>
              <label className={labelClass}>
                <span>
                  Middle name <span className="font-normal text-gray-400">(optional)</span>
                </span>
                <input {...register("student.middleName")} className={inputClass} />
              </label>
              <label className={labelClass}>
                Requested class/grade
                <input {...register("student.requestedClass")} className={inputClass} />
                <FieldError message={errors.student?.requestedClass?.message} />
              </label>
              <label className={labelClass}>
                Date of birth
                <input type="date" {...register("student.dateOfBirth")} className={inputClass} />
                <FieldError message={errors.student?.dateOfBirth?.message} />
              </label>
              <label className={labelClass}>
                Gender
                <select {...register("student.gender")} className={inputClass}>
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <FieldError message={errors.student?.gender?.message} />
              </label>
              <label className={labelClass}>
                <span>
                  Email <span className="font-normal text-gray-400">(optional)</span>
                </span>
                <input type="email" {...register("student.email")} className={inputClass} />
                <FieldError message={errors.student?.email?.message} />
              </label>
              <label className={labelClass}>
                <span>
                  Last school attended <span className="font-normal text-gray-400">(optional)</span>
                </span>
                <input {...register("student.lastSchoolAttended")} className={inputClass} />
              </label>
            </div>
          </section>

          <section>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register("includeMother")} className="accent-sky-500 w-4 h-4" />
              <span className="text-sm font-semibold text-gray-900">Add mother's information</span>
            </label>
            {includeMother && <GuardianFields prefix="mother" register={register} errors={errors} />}
          </section>

          <section>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register("includeFather")} className="accent-sky-500 w-4 h-4" />
              <span className="text-sm font-semibold text-gray-900">Add father's information</span>
            </label>
            {includeFather && <GuardianFields prefix="father" register={register} errors={errors} />}
          </section>

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
