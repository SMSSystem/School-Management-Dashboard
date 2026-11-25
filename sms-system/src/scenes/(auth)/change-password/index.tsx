import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FirebaseError } from "firebase/app";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { createVerifier } from "@/lib/offline/unlockVerifier";
import { Eye, EyeOff, KeyRound, Lock } from "lucide-react";

// Reached only via Protected.tsx's mustChangePassword redirect — see
// docs/miscellaneous-specs/SPREADSHEET_IMPORT_STUDENTS_SPEC.md Part B.
// Deliberately narrow: no "forgot password" link (a user here already
// knows their current, shared password by definition) and not reused as a
// general settings-page "change my password" entry point.

function getFirebaseMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    return "Something went wrong while updating your password.";
  }
  const messages: Record<string, string> = {
    "auth/weak-password": "Password should be at least 8 characters.",
    "auth/wrong-password": "That current password isn't correct.",
    "auth/invalid-credential": "That current password isn't correct.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
  };
  return messages[error.code] ?? error.message;
}

// Same complexity rule as createUserSchema's password field
// (AdminCreateUserForm.tsx), kept in sync manually rather than shared —
// this scene is deliberately Firebase-form-library-free (plain state, no
// zod/react-hook-form), matching login/index.tsx's own pattern rather than
// AdminCreateUserForm.tsx's, since it lives in the same (auth) scene tier.
function validateNewPassword(value: string): string | undefined {
  if (!value) return "New password is required.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (value.length > 64) return "Password must be 64 characters or less.";
  if (!/[a-z]/.test(value)) return "Password needs at least one lowercase letter.";
  if (!/[A-Z]/.test(value)) return "Password needs at least one uppercase letter.";
  if (!/[0-9]/.test(value)) return "Password needs at least one number.";
  return undefined;
}

export default function ChangePasswordPage() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  // Only asked for if a fresh updatePassword() attempt comes back
  // auth/requires-recent-login — unlikely immediately after first sign-in,
  // but the fallback per the spec's §Flow step 3.
  const [needsReauth, setNeedsReauth] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    newPassword?: string;
    confirmPassword?: string;
    currentPassword?: string;
  }>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const newErr = validateNewPassword(newPassword);
    const confirmErr =
      newPassword !== confirmPassword ? "Passwords do not match." : undefined;
    const currentErr =
      needsReauth && !currentPassword ? "Enter your current password." : undefined;
    if (newErr || confirmErr || currentErr) {
      setFieldErrors({ newPassword: newErr, confirmPassword: confirmErr, currentPassword: currentErr });
      return;
    }
    setFieldErrors({});
    setGlobalError(null);
    setLoading(true);

    try {
      if (needsReauth) {
        if (!user.email) throw new Error("This account has no email on record.");
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
      }
      await updatePassword(user, newPassword);
      // The offline idle lock now checks the new password; the old one must no longer unlock this tab.
      void createVerifier(user.uid, newPassword);
      await updateDoc(doc(db, "users", user.uid), { mustChangePassword: false });
      await refreshProfile();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : undefined;
      if (code === "auth/requires-recent-login" && !needsReauth) {
        setNeedsReauth(true);
        setGlobalError("For your security, enter your current password to continue.");
      } else {
        setGlobalError(getFirebaseMessage(err));
      }
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      {/* Subtle dot-grid background — matches login/index.tsx */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-105 animate-login-card">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-10 sm:px-10">
          {/* Logo */}
          <div className="flex justify-center mb-7">
            <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
              <KeyRound className="w-7 h-7 text-slate-400" />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 leading-tight mb-1.5">
              Set a new password
            </h1>
            <p className="text-slate-500 text-sm">
              You're signing in for the first time. Choose a new password to continue.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {needsReauth && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="currentPassword">
                  Current Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                  <input
                    id="currentPassword"
                    type={showCurrent ? "text" : "password"}
                    className={`w-full pl-9 pr-10 py-2.5 rounded-lg border text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all bg-slate-50 ${
                      fieldErrors.currentPassword
                        ? "border-red-400 focus:ring-2 focus:ring-red-200"
                        : "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/8"
                    }`}
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      if (fieldErrors.currentPassword)
                        setFieldErrors((p) => ({ ...p, currentPassword: undefined }));
                    }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label={showCurrent ? "Hide password" : "Show password"}
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.currentPassword && (
                  <p className="mt-1.5 text-xs text-red-500">{fieldErrors.currentPassword}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="newPassword">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  className={`w-full pl-9 pr-10 py-2.5 rounded-lg border text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all bg-slate-50 ${
                    fieldErrors.newPassword
                      ? "border-red-400 focus:ring-2 focus:ring-red-200"
                      : "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/8"
                  }`}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (fieldErrors.newPassword)
                      setFieldErrors((p) => ({ ...p, newPassword: undefined }));
                  }}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showNew ? "Hide password" : "Show password"}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.newPassword ? (
                <p className="mt-1.5 text-xs text-red-500">{fieldErrors.newPassword}</p>
              ) : (
                <p className="mt-1.5 text-xs text-slate-400">
                  At least 8 characters, with an uppercase letter, a lowercase letter, and a number.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="confirmPassword">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  className={`w-full pl-9 pr-10 py-2.5 rounded-lg border text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all bg-slate-50 ${
                    fieldErrors.confirmPassword
                      ? "border-red-400 focus:ring-2 focus:ring-red-200"
                      : "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/8"
                  }`}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (fieldErrors.confirmPassword)
                      setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
                  }}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="mt-1.5 text-xs text-red-500">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {globalError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                <p className="text-sm text-red-700">{globalError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-lg font-semibold text-white text-sm tracking-wide transition-all duration-150 ${
                loading
                  ? "bg-slate-400 cursor-not-allowed"
                  : "bg-slate-900 hover:bg-slate-800 active:scale-[0.985] shadow-sm"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Updating…
                </span>
              ) : (
                "Set Password & Continue"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
