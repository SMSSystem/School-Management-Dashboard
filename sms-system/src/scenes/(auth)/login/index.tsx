import { FormEvent, useState } from "react";
import { FirebaseError } from "firebase/app";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) return "Email is required.";
    if (!EMAIL_RE.test(value.trim())) return "Please enter a valid email address.";
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
      const code = authError instanceof FirebaseError ? authError.code : undefined;
      if (code === "auth/user-disabled") {
        setGlobalError("This account has been disabled. Contact your administrator.");
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
      navigate("/dashboard", { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 70% 30%, #8B2020 0%, #5A0A0A 45%, #2D0303 100%)",
        }}
      />
      {/* Architectural grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(255,255,255,0.5) 60px),
            repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.5) 60px)`,
        }}
      />
      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(0,0,0,0.55)_100%)]" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[440px] mx-4 animate-login-card">
        <div className="bg-white rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.45)] px-8 py-10 sm:px-10">

          {/* Logo */}
          <div className="flex justify-center mb-7">
            <div className="w-[72px] h-[72px] rounded-full bg-white shadow-md border-[3px] border-[#7B1A1A]/15 flex items-center justify-center overflow-hidden">
              <img
                src="/logo.png"
                alt="School logo"
                className="w-[58px] h-[58px] object-contain"
              />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h1 className="text-[28px] font-bold text-gray-900 leading-tight mb-1.5">
              Welcome back
            </h1>
            <p className="text-gray-500 text-[15px]">Sign in to the Portal</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {/* Email */}
            <div>
              <label
                className="block text-sm font-semibold text-gray-700 mb-1.5"
                htmlFor="email"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-[17px] h-[17px] pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  className={`w-full pl-10 pr-4 py-[11px] rounded-xl border text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 bg-gray-50/80 transition-all text-[15px] ${
                    fieldErrors.email
                      ? "border-red-400 focus:ring-red-200 focus:border-red-400"
                      : "border-gray-200 focus:border-[#7B1A1A] focus:ring-[#7B1A1A]/20"
                  }`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email)
                      setFieldErrors((p) => ({ ...p, email: undefined }));
                  }}
                  onBlur={() => {
                    const err = validateEmail(email);
                    setFieldErrors((p) => ({ ...p, email: err }));
                  }}
                  autoComplete="email"
                />
              </div>
              {fieldErrors.email && (
                <p className="mt-1.5 text-xs text-red-500">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  className="block text-sm font-semibold text-gray-700"
                  htmlFor="password"
                >
                  Password
                </label>
                <span className="text-sm font-medium text-[#7B1A1A] hover:text-[#9B2525] transition-colors cursor-default select-none">
                  Forgot password?
                </span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-[17px] h-[17px] pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className={`w-full pl-10 pr-11 py-[11px] rounded-xl border text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 bg-gray-50/80 transition-all text-[15px] ${
                    fieldErrors.password
                      ? "border-red-400 focus:ring-red-200 focus:border-red-400"
                      : "border-gray-200 focus:border-[#7B1A1A] focus:ring-[#7B1A1A]/20"
                  }`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password)
                      setFieldErrors((p) => ({ ...p, password: undefined }));
                  }}
                  onBlur={() => {
                    const err = validatePassword(password);
                    setFieldErrors((p) => ({ ...p, password: err }));
                  }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-0.5"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-[17px] h-[17px]" />
                  ) : (
                    <Eye className="w-[17px] h-[17px]" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1.5 text-xs text-red-500">{fieldErrors.password}</p>
              )}
            </div>

            {globalError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm text-red-700">{globalError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 rounded-xl font-semibold text-white text-[15px] tracking-wide transition-all duration-200 mt-1 ${
                loading
                  ? "bg-[#7B1A1A]/60 cursor-not-allowed"
                  : "bg-[#7B1A1A] hover:bg-[#6B0F0F] active:scale-[0.985] shadow-sm hover:shadow-md"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {failedAttempts >= 3 && (
            <p className="mt-5 text-sm text-center text-[#7B1A1A]">
              Forgot password? Contact your administrator.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
