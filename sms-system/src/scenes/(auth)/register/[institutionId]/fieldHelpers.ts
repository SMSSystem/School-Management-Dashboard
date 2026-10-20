import type { ChangeEvent } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { formatPhone } from "@/lib/phone";
import { capitalizeWords } from "@/lib/registrationFormLogic";

// What the registration form's field groups share: the light-only styling and the two wrappers that transform
// what is typed.

// Deliberately light-only, matching the register picker and login pages —
// this whole public auth/register flow has no dark-mode treatment, so these
// must not inherit dark: variants from the authenticated app's shared
// styling conventions even if a visitor's browser has .dark set globally
// from a prior dashboard session (see STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md
// Phase 7 QA notes).
export const inputClass =
  "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400";
export const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-gray-700";

// Wraps a react-hook-form registration so the field's value is auto-
// capitalized live as the visitor types — the same live-transform pattern
// AdminCreateUserForm.tsx already uses for its phone field (formatPhone).
export function withAutoCapitalize(reg: UseFormRegisterReturn) {
  const { onChange, ...rest } = reg;
  return {
    ...rest,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      event.target.value = capitalizeWords(event.target.value);
      return onChange(event);
    },
  };
}

// Same live-transform pattern for phone fields: the visitor's number is masked
// as they type, so what is stored matches what the dashboard forms produce.
// (No blur canonicalisation here: a public visitor has no institution context
// to corroborate a bare number against.)
export function withPhoneFormat(reg: UseFormRegisterReturn) {
  const { onChange, ...rest } = reg;
  return {
    ...rest,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      event.target.value = formatPhone(event.target.value);
      return onChange(event);
    },
  };
}
