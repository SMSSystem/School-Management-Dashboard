import { useLocation } from "react-router-dom";
import AdminCreateUserForm, { type CreateUserLocationState } from "@/components/forms/AdminCreateUserForm";

const SuperAdminCreateUserPage = () => {
  const location = useLocation();
  const { initialRole } = (location.state as CreateUserLocationState | null) ?? {};

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Create User
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Create a login account and assign the correct role for platform access.
      </p>
      <AdminCreateUserForm initialRole={initialRole} />
    </div>
  );
};

export default SuperAdminCreateUserPage;
