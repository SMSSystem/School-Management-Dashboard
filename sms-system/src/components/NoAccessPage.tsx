import { useAuth } from "@/lib/AuthContext";

// Shown on the dashboard route when the signed-in account's role is not one the
// app knows. This used to fall through to the admin dashboard, which would have
// handed an unknown role admin shortcuts. Redirecting to /login is not an
// option: a signed-in user is sent straight back to the dashboard.
const NoAccessPage = () => {
  const { signOut } = useAuth();
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <section className="bg-white dark:bg-gray-800 rounded-md p-6 shadow-sm max-w-md text-center flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">No access</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Your account's role isn't recognised, so there is nothing to show here. Contact your
          administrator.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="self-center px-4 py-2 rounded-md text-sm bg-sky-600 text-white hover:bg-sky-700"
        >
          Sign out
        </button>
      </section>
    </div>
  );
};

export default NoAccessPage;
