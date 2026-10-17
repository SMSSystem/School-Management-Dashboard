import { getRoleLabel, type Role } from "@/types/people";
import { FieldError } from "./FieldError";
import type { CreateUserErrors, CreateUserRegister } from "./formTypes";
import { disabledInputClass, inputClass, institutionSelectClass, labelClass } from "./styles";

// The role of the new account and, where the signed-in admin can choose it, its institution.
export function RoleFields({
  register,
  errors,
  role,
  lockedRole,
  roleOptions,
  selectedRole,
  requiresInstitution,
  initialInstitutionId,
  institutionName,
  institutions,
}: {
  register: CreateUserRegister;
  errors: CreateUserErrors;
  /** The signed-in admin's role. */
  role: Role | null;
  lockedRole?: Role;
  roleOptions: Role[];
  selectedRole: Role;
  requiresInstitution: boolean;
  initialInstitutionId?: string;
  institutionName: string;
  institutions: { id: string; name: string }[];
}) {
  return (
    <>
      <label className={labelClass}>
        Role
        {lockedRole ? (
          <input
            id="tour-create-user-role"
            value={getRoleLabel(lockedRole)}
            disabled
            readOnly
            className={disabledInputClass}
          />
        ) : (
          <select
            id="tour-create-user-role"
            {...register("role")}
            aria-invalid={Boolean(errors.role)}
            className={inputClass}
          >
            {roleOptions.map((option) => (
              <option key={option} value={option}>
                {getRoleLabel(option)}
              </option>
            ))}
          </select>
        )}
        <FieldError message={errors.role?.message} />
        {selectedRole === "spectator" && (
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
            A spectator can view everything an administrator can, including personal details, but
            cannot change anything. It starts with a standard temporary password that is replaced at
            first sign-in, so share the sign-in details only with the person it is for.
          </span>
        )}
      </label>

      {requiresInstitution && !initialInstitutionId && (
        <label className={labelClass}>
          Institution
          {role === "institution_admin" ? (
            <input
              id="tour-create-user-institution"
              value={institutionName}
              disabled
              readOnly
              className={disabledInputClass}
            />
          ) : (
            <select
              id="tour-create-user-institution"
              {...register("institutionId")}
              aria-invalid={Boolean(errors.institutionId)}
              disabled={!!initialInstitutionId}
              className={institutionSelectClass}
            >
              <option value="">Select institution</option>
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          )}
          <FieldError message={errors.institutionId?.message} />
        </label>
      )}
    </>
  );
}
