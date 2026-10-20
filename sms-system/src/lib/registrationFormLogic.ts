import { z } from "@/lib/zod";
import { namePattern, phonePattern } from "@/lib/fieldPatterns";
import type { RegistrationDirectoryEntry } from "@/types/registration";

// The public registration form's rules that need no screen or database (scenes/(auth)/register/[institutionId]):
// the validation, the minimum age, how names are capitalised, whether the institution is in custom mode, which
// programme a submission is for, and the document a submission writes.

// Defense-in-depth against display-context XSS, layered on top of (not
// replacing) this app's existing JSX-escaping convention — see
// STUDENT_REGISTRATION_FORM_SPEC.md §Input validation and injection. The
// control-character range is intentional, not a typo.
// eslint-disable-next-line no-control-regex
export const noHtmlOrControlChars = /^[^<>\x00-\x1F\x7F]*$/;

export const MIN_AGE_YEARS = 10;

// Enforced client-side only — Firestore rules have no clean "N years ago"
// primitive, and a bypass here just means an underage-looking submission
// reaches the pending review queue, same as any other bad-data submission.
export function meetsMinimumAge(dateOfBirth: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  const dob = new Date(dateOfBirth + "T00:00:00");
  if (Number.isNaN(dob.getTime())) return false;
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - MIN_AGE_YEARS);
  return dob.getTime() <= cutoff.getTime();
}

// Title Case: capitalizes a letter at the start or after anything that is not
// a letter, a combining mark, a digit or an underscore (so spaces, hyphens,
// and apostrophes all trigger a capital — "mary-jane" -> "Mary-Jane",
// "o'brien" -> "O'Brien"). That is what \b means for ASCII, written for any
// script: \b treats an accented letter as a boundary, which turned "zoë"
// into "ZoË" and left "émile" as "éMile". No lookbehind, which older Safari
// cannot parse. Known, accepted gap: a name with no separator before a
// mid-word capital, e.g. "mcdonald", still becomes "Mcdonald" not
// "McDonald" — no simple rule handles that case, and this app has no
// existing convention that does either.
export function capitalizeWords(value: string): string {
  return value.replace(
    /(^|[^\p{L}\p{M}\p{N}_])(\p{L})/gu,
    (_match, before: string, letter: string) => before + letter.toUpperCase(),
  );
}

const requiredName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(100, `${label} must be 100 characters or less.`)
    .regex(namePattern, "Use letters, spaces, apostrophes, or hyphens only.");

const optionalName = (label: string) =>
  z
    .string()
    .trim()
    .max(100, `${label} must be 100 characters or less.`)
    .refine(
      (value) => value === "" || namePattern.test(value),
      "Use letters, spaces, apostrophes, or hyphens only.",
    )
    .optional()
    .or(z.literal(""));

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or less.`)
    .refine(
      (value) => noHtmlOrControlChars.test(value),
      "Contains characters that aren't allowed.",
    );

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or less.`)
    .refine(
      (value) => noHtmlOrControlChars.test(value),
      "Contains characters that aren't allowed.",
    )
    .optional()
    .or(z.literal(""));

const guardianSchema = z.object({
  lastName: requiredName("Last name"),
  firstName: requiredName("First name"),
  address: requiredText("Address", 300),
  contact: z
    .string()
    .trim()
    .min(1, "Contact number is required.")
    .max(50)
    .regex(phonePattern, "Enter a valid phone number."),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address.")
    .max(254),
  occupation: requiredText("Occupation", 100),
  work: optionalText("Employer", 100),
});

// CUSTOM_CALENDAR_MODE_SPEC.md §6 — for custom-mode institutions (signaled
// by directory.openTimeBlocks being present/non-empty; this form can't read
// institutions/{id}.calendarMode directly, since that doc isn't public),
// the guardian section becomes optional and a programme (time block) must
// be explicitly chosen instead of silently defaulting to directory's single
// activeAcademicYearId, which academic-mode institutions still have exactly
// one of.
export function buildSchema(isCustomMode: boolean) {
  return z
    .object({
      academicYearId: isCustomMode
        ? z.string().min(1, "Please select a programme.")
        : z.string().optional(),
      student: z.object({
        lastName: requiredName("Last name"),
        firstName: requiredName("First name"),
        middleName: optionalName("Middle name"),
        requestedClass: requiredText("Requested class/grade", 50),
        dateOfBirth: z
          .string()
          .min(1, "Date of birth is required.")
          .refine(
            (value) => meetsMinimumAge(value),
            `Student must be at least ${MIN_AGE_YEARS} years old.`,
          ),
        gender: z.enum(["Male", "Female"], {
          message: "Please select a gender.",
        }),
        email: z
          .string()
          .trim()
          .min(1, "Email is required.")
          .email("Enter a valid email address.")
          .max(254),
        lastSchoolAttended: optionalText("Last school attended", 200),
        phone: z
          .string()
          .trim()
          .refine(
            (value) => value === "" || phonePattern.test(value),
            "Enter a valid phone number.",
          )
          .optional()
          .or(z.literal("")),
        phone2: z
          .string()
          .trim()
          .refine(
            (value) => value === "" || phonePattern.test(value),
            "Enter a valid phone number.",
          )
          .optional()
          .or(z.literal("")),
        citizenId: optionalText("Citizen ID or TRN", 50),
      }),
      includeMother: z.boolean(),
      includeFather: z.boolean(),
      mother: guardianSchema.optional(),
      father: guardianSchema.optional(),
    })
    .superRefine((values, ctx) => {
      // Skipped entirely for custom-mode institutions — the rule change in
      // firestore.rules' institutionAllowsGuardianlessRegistration() permits
      // the resulting mother: null, father: null submission (§5.3/§6).
      if (!isCustomMode && !values.includeMother && !values.includeFather) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["includeMother"],
          message: "Provide at least one parent/guardian's information.",
        });
      }
      if (values.includeMother && !values.mother) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mother"],
          message: "Mother's information is required.",
        });
      }
      if (values.includeFather && !values.father) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["father"],
          message: "Father's information is required.",
        });
      }
    });
}

export type RegistrationFormValues = z.infer<ReturnType<typeof buildSchema>>;

/** The institution's public registration-directory entry, with its id. */
export type RegistrationDirectory = RegistrationDirectoryEntry & { id: string };

// Signals custom-mode-ness from openTimeBlocks being present/non-empty —
// this form has no other way to know (institutions/{id}.calendarMode isn't
// public; see the buildSchema comment above).
export function isCustomModeOf(directory: RegistrationDirectory | null | undefined): boolean {
  return !!(directory && directory.openTimeBlocks && directory.openTimeBlocks.length > 0);
}

/**
 * Which programme (academic year or time block) a submission is for: the one the visitor picked in custom
 * mode, otherwise the institution's single active academic year. `error` is the message to show when there is
 * none to submit against.
 */
export function resolveProgramme(
  directory: RegistrationDirectory,
  isCustomMode: boolean,
  chosenAcademicYearId: string | undefined,
): { academicYearId: string; academicYearName: string } | { error: string } {
  if (isCustomMode) {
    const block = directory.openTimeBlocks?.find((b) => b.academicYearId === chosenAcademicYearId);
    if (!block) return { error: "Please select a programme." };
    return { academicYearId: block.academicYearId, academicYearName: block.name };
  }
  if (!directory.activeAcademicYearId) {
    return {
      error: "This institution hasn't set an active academic year yet. Please contact them directly.",
    };
  }
  return {
    academicYearId: directory.activeAcademicYearId,
    academicYearName: directory.activeAcademicYearName ?? "",
  };
}

/** The registration a submission writes (without `submittedAt`, which the save adds). */
export function buildRegistrationDocument({
  institutionId,
  programme,
  values,
  photoDataUrl,
}: {
  institutionId: string;
  programme: { academicYearId: string; academicYearName: string };
  values: RegistrationFormValues;
  photoDataUrl: string | null;
}) {
  return {
    institutionId,
    academicYearId: programme.academicYearId,
    academicYearName: programme.academicYearName,
    status: "pending",
    possibleDuplicate: false, // computed by the reviewing admin's client, not here — see Phase 9
    student: {
      lastName: values.student.lastName,
      firstName: values.student.firstName,
      ...(values.student.middleName && {
        middleName: values.student.middleName,
      }),
      requestedClass: values.student.requestedClass,
      dateOfBirth: values.student.dateOfBirth,
      gender: values.student.gender,
      email: values.student.email.toLowerCase(),
      ...(values.student.lastSchoolAttended && {
        lastSchoolAttended: values.student.lastSchoolAttended,
      }),
      ...(values.student.phone && { phone: values.student.phone }),
      ...(values.student.phone2 && { phone2: values.student.phone2 }),
      ...(values.student.citizenId && { citizenId: values.student.citizenId }),
      ...(photoDataUrl && { photoDataUrl }),
    },
    mother:
      values.includeMother && values.mother
        ? { ...values.mother, email: values.mother.email.toLowerCase() }
        : null,
    father:
      values.includeFather && values.father
        ? { ...values.father, email: values.father.email.toLowerCase() }
        : null,
  };
}
