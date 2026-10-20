import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { CreateUserFormValues } from "@/lib/createUserSchema";

// What the field groups of the Create Account form receive from AdminCreateUserForm.tsx.
export type CreateUserRegister = UseFormRegister<CreateUserFormValues>;
export type CreateUserErrors = FieldErrors<CreateUserFormValues>;
