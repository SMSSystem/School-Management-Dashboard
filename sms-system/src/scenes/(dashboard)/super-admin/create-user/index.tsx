import SuperAdminCreateUserForm from "@/components/forms/SuperAdminCreateUserForm";

const SuperAdminCreateUserPage = () => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Create User
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Create a login account and assign the correct role for platform access.
      </p>
      <SuperAdminCreateUserForm />
    </div>
  );
};

export default SuperAdminCreateUserPage;
