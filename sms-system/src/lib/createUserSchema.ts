import { FirebaseError } from "firebase/app";
import { z } from "@/lib/zod";
import { namePattern, phonePattern } from "@/lib/fieldPatterns";
import {
  homeroomRoomField,
  homeroomBuildingField,
  addHomeroomRoomRequiredIssue,
} from "@/lib/homeroomFields";

// The Create Account form's validation (AdminCreateUserForm.tsx) and its Firebase error wording,
// kept apart from the component so they can be tested without rendering anything.

export const createUserSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, "First name must be at least 2 characters.")
      .max(50, "First name must be 50 characters or less.")
      .regex(namePattern, "Use letters, spaces, apostrophes, or hyphens only."),
    lastName: z
      .string()
      .trim()
      .min(2, "Last name must be at least 2 characters.")
      .max(50, "Last name must be 50 characters or less.")
      .regex(namePattern, "Use letters, spaces, apostrophes, or hyphens only."),
    email: z
      .string()
      .trim()
      .min(1, "Email is required.")
      .email("Enter a valid email address.")
      .max(254, "Email must be 254 characters or less."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(64, "Password must be 64 characters or less.")
      .regex(/[a-z]/, "Password needs at least one lowercase letter.")
      .regex(/[A-Z]/, "Password needs at least one uppercase letter.")
      .regex(/[0-9]/, "Password needs at least one number."),
    confirmPassword: z.string().min(1, "Confirm the temporary password."),
    phone: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || phonePattern.test(value),
        "Enter a valid phone number.",
      ),
    phone2: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || phonePattern.test(value),
        "Enter a valid phone number.",
      ),
    idNumber: z
      .string()
      .trim()
      .max(50, "Citizen ID or TRN must be 50 characters or less.")
      .optional(),
    role: z.enum([
      "institution_admin",
      "senior_teacher",
      "regular_teacher",
      "student",
      "parent",
      "super_admin",
      "spectator",
    ]),
    institutionId: z.string(),
    departmentId: z.string().optional(),
    classId: z.string().optional(),
    assignedClassId: z.string().optional(),
    homeroomRoom: homeroomRoomField,
    homeroomBuilding: homeroomBuildingField,
    dateOfBirth: z.string().optional(),
    institutionStudentId: z
      .string()
      .max(50, "Student ID must be 50 characters or less.")
      .optional(),
    gender: z
      .enum(["Male", "Female"] as const, { message: "Please select a gender." })
      .optional(),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }

    if (values.role !== "super_admin" && !values.institutionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["institutionId"],
        message: "Institution is required for this role.",
      });
    }

    if (
      values.role === "senior_teacher" &&
      values.assignedClassId &&
      !values.homeroomRoom?.trim()
    ) {
      addHomeroomRoomRequiredIssue(ctx);
    }

    if (values.role === "student") {
      const dob = values.dateOfBirth ?? "";
      const dobValid =
        Boolean(dob) &&
        /^\d{4}-\d{2}-\d{2}$/.test(dob) &&
        !isNaN(Date.parse(dob));
      if (!dobValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateOfBirth"],
          message: "Date of birth is required.",
        });
      } else {
        // Parsed at noon UTC (matching the noon-UTC convention used elsewhere for
        // date-only strings, e.g. utils.ts's isSubjectSessionDay) so a same-day
        // birthday isn't flipped to "too young" by a timezone offset.
        const dobDate = new Date(`${dob}T12:00:00Z`);
        const minBirthDate = new Date();
        minBirthDate.setUTCHours(12, 0, 0, 0);
        minBirthDate.setUTCFullYear(minBirthDate.getUTCFullYear() - 3);
        if (dobDate > minBirthDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dateOfBirth"],
            message: "Student must be at least 3 years old.",
          });
        }
      }
      if (!values.gender) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["gender"],
          message: "Gender is required.",
        });
      }
    }
  });

export type CreateUserFormValues = z.infer<typeof createUserSchema>;

export function getFirebaseMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return "Something went wrong while creating the user.";
  }

  const messages: Record<string, string> = {
    "auth/email-already-in-use":
      "That email already belongs to another account.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Password should be at least 8 characters.",
    "auth/network-request-failed":
      "Network error. Check your connection and try again.",
    "permission-denied":
      "Firestore denied this write. Check your security rules for admin user creation.",
  };

  return messages[error.code] ?? error.message;
}
