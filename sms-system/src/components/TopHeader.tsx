import { useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getRoleLabel } from "@/lib/firebase";
import { toggleTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { getContrastVariant } from "@/lib/contrast";
import { Sun, Moon, LogOut } from "lucide-react";

const FALLBACK_BG = "#1e293b";

export default function TopHeader() {
  const navigate = useNavigate();
  const { user, role, displayName, signOut, institution } = useAuth();
  const [theme, setThemeState] = useState<Theme>(getStoredTheme() ?? "light");

  const isSuperAdmin = role === "super_admin";
  const bgColor =
    !isSuperAdmin && institution?.brandColor
      ? institution.brandColor
      : FALLBACK_BG;
  const contrast = getContrastVariant(bgColor);

  const textPrimary = contrast === "light" ? "text-white" : "text-gray-900";
  const btnCls =
    contrast === "light"
      ? "text-white/80 border-white/20 hover:bg-white/10 hover:text-white"
      : "text-gray-600 border-black/15 hover:bg-black/10 hover:text-gray-900";
  const badgeCls =
    contrast === "light"
      ? "bg-white/20 text-white border border-white/25"
      : "bg-black/10 text-gray-700 border border-black/10";

  const nameLabel = displayName ?? user?.email ?? "—";
  const logoUrl = isSuperAdmin ? null : (institution?.logoUrl ?? null);
  const siteName = isSuperAdmin ? "School" : (institution?.name ?? "School");

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleThemeToggle = () => setThemeState(toggleTheme());

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-white/20 transition-colors duration-500"
      style={{ backgroundColor: bgColor }}
    >
      {/* Left: logo + institution name */}
      <Link to="/" className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-white/15 border border-white/20 shrink-0 overflow-hidden flex items-center justify-center">
          <img
            src={logoUrl ?? "/logo.png"}
            alt={siteName}
            className="w-6 h-6 object-contain"
          />
        </div>
        <span
          className={`hidden sm:block text-sm font-bold truncate max-w-xs leading-tight ${textPrimary}`}
        >
          {siteName}
        </span>
      </Link>

      {/* Right: user info + controls */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Name + role badge */}
        <div className="hidden sm:flex flex-row items-center gap-2 mr-2">
          <span className={`text-sm font-semibold ${textPrimary}`}>
            {nameLabel}
          </span>
          {role && (
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeCls}`}
            >
              {getRoleLabel(role)}
            </span>
          )}
        </div>

        {/* Photo avatar */}
        {user?.photoURL && (
          <img
            src={user.photoURL}
            alt=""
            width={30}
            height={30}
            className="rounded-full object-cover shrink-0 ring-2 ring-white/20"
          />
        )}

        {/* Theme toggle */}
        <button
          aria-label="Toggle dark mode"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={handleThemeToggle}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-200 ${btnCls}`}
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
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-200 ${btnCls}`}
          aria-label="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
