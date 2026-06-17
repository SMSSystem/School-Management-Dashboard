import { FormEvent, useState } from "react";
import { FirebaseError } from "firebase/app";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) return "Email is required.";
    if (!EMAIL_RE.test(value.trim()))
      return "Please enter a valid email address.";
    return undefined;
  };

  const validatePassword = (value: string): string | undefined => {
    if (!value) return "Password is required.";
    return undefined;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const emailErr = validateEmail(email);
    const passErr = validatePassword(password);
    if (emailErr || passErr) {
      setFieldErrors({ email: emailErr, password: passErr });
      return;
    }
    setFieldErrors({});
    setGlobalError(null);
    setLoading(true);
    const { error: authError } = await signIn(email, password);
    if (authError) {
      const code =
        authError instanceof FirebaseError ? authError.code : undefined;
      if (code === "auth/user-disabled") {
        setGlobalError(
          "This account has been disabled. Contact your administrator.",
        );
      } else if (code === "auth/network-request-failed") {
        setGlobalError("Network error. Check your connection and try again.");
      } else if (code === "auth/invalid-email") {
        setFieldErrors({ email: "Please enter a valid email address." });
        setFailedAttempts((n) => n + 1);
      } else {
        setFieldErrors({ password: "Incorrect password. Please try again." });
        setFailedAttempts((n) => n + 1);
      }
      setLoading(false);
    } else {
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-1/2 bg-[#0ea5e9] items-center justify-center p-12 text-white">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo.png" alt="logo" width={40} height={40} />
            <h1 className="text-2xl font-bold">School Management</h1>
          </div>
          <p className="text-lg opacity-90">
            Welcome! Sign in to access your dashboard.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white rounded-xl border border-sky-500 shadow-[0_4px_24px_rgba(14,165,233,0.18)] p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo.png" alt="logo" width={32} height={32} />
            <h2 className="text-xl font-semibold text-sky-500">Sign in</h2>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-1"
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                className={`w-full rounded-md border px-3 py-2 text-slate-900 placeholder-gray-400 outline-none focus:ring-2 bg-white ${
                  fieldErrors.email
                    ? "border-red-400 focus:ring-red-400"
                    : "border-gray-300 focus:ring-sky-400"
                }`}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                onBlur={() => {
                  const err = validateEmail(email);
                  setFieldErrors((prev) => ({ ...prev, email: err }));
                }}
                autoComplete="email"
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-1"
                htmlFor="password"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                className={`w-full rounded-md border px-3 py-2 text-slate-900 placeholder-gray-400 outline-none focus:ring-2 bg-white ${
                  fieldErrors.password
                    ? "border-red-400 focus:ring-red-400"
                    : "border-gray-300 focus:ring-sky-400"
                }`}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      password: undefined,
                    }));
                  }
                }}
                onBlur={() => {
                  const err = validatePassword(password);
                  setFieldErrors((prev) => ({ ...prev, password: err }));
                }}
                autoComplete="current-password"
              />
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-500">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {globalError && (
              <p className="text-sm text-red-600">{globalError}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full text-white font-medium py-2.5 rounded-md transition ${loading ? "bg-sky-400 cursor-not-allowed" : "bg-sky-500 hover:bg-sky-600"}`}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        {failedAttempts >= 3 && (
          <p className="mt-4 text-sm text-sky-500">
            Forgot password? Contact your administrator.
          </p>
        )}
      </div>
    </div>
  );
}
