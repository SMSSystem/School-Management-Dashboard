import { useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getRoleLabel } from "@/lib/firebase";
import { toggleTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { Sun, Moon, LogOut } from "lucide-react";

export default function TopHeader() {
  const navigate = useNavigate();
  const { user, role, displayName, signOut, institution } = useAuth();
  const [theme, setThemeState] = useState<Theme>(getStoredTheme() ?? "light");

  const isSuperAdmin = role === "super_admin";
  const logoUrl = isSuperAdmin ? null : (institution?.logoUrl ?? null);
  const siteName = isSuperAdmin ? "School Management" : (institution?.name ?? "School Management");
  const nameLabel = displayName ?? user?.email ?? "—";

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleThemeToggle = () => setThemeState(toggleTheme());

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 shrink-0 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
      {/* Left: logo + name */}
      <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 shrink-0 overflow-hidden flex items-center justify-center">
          <img
            src={logoUrl ?? "/logo.png"}
            alt={siteName}
            className="w-full h-full object-contain"
          />
        </div>
        <span className="hidden sm:block text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-50">
          {siteName}
        </span>
      </Link>

      {/* Right: user info + controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Name + role */}
        <div className="hidden sm:flex items-center gap-2 mr-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {nameLabel}
          </span>
          {role && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              {getRoleLabel(role)}
            </span>
          )}
        </div>

        {/* Avatar */}
        {user?.photoURL && (
          <img
            src={user.photoURL}
            alt=""
            width={28}
            height={28}
            className="rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700 shrink-0"
          />
        )}

        {/* Theme toggle */}
        <button
          aria-label="Toggle dark mode"
          onClick={handleThemeToggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-all duration-150"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-150"
          aria-label="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
