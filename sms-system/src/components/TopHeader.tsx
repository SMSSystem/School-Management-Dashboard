import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getRoleLabel } from '@/lib/firebase';
import { toggleTheme, getStoredTheme, type Theme } from '@/lib/theme';
import { getContrastVariant } from '@/lib/contrast';

const FALLBACK_BG = '#1e293b';

export default function TopHeader() {
  const navigate = useNavigate();
  const { user, role, displayName, signOut, institution } = useAuth();
  const [theme, setThemeState] = useState<Theme>(getStoredTheme() ?? 'light');

  const isSuperAdmin = role === 'super_admin';
  const bgColor = !isSuperAdmin && institution?.brandColor ? institution.brandColor : FALLBACK_BG;
  const contrast = getContrastVariant(bgColor);

  const textPrimary = contrast === 'light' ? 'text-white' : 'text-gray-900';
  const btnCls = contrast === 'light'
    ? 'text-white border-white/30 hover:bg-white/10'
    : 'text-gray-700 border-black/20 hover:bg-black/10';
  const badgeCls = contrast === 'light'
    ? 'bg-white/20 text-white border border-white/30'
    : 'bg-black/10 text-gray-700 border border-black/10';
  const logoutStyle = contrast === 'light'
    ? { backgroundColor: '#ffffff', color: bgColor }
    : { backgroundColor: '#1f2937', color: '#ffffff' };
  const logoutIconCls = contrast === 'dark' ? 'invert' : '';

  const nameLabel = displayName ?? user?.email ?? '—';
  const logoUrl = isSuperAdmin ? null : (institution?.logoUrl ?? null);
  const siteName = isSuperAdmin ? 'School' : (institution?.name ?? 'School');

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleThemeToggle = () => setThemeState(toggleTheme());

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 shrink-0"
      style={{ backgroundColor: bgColor }}
    >
      {/* Left: logo in white circle + institution name */}
      <Link to="/" className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-white p-1 shrink-0 overflow-hidden flex items-center justify-center">
          <img
            src={logoUrl ?? '/logo.png'}
            alt={siteName}
            className="w-full h-full object-contain"
          />
        </div>
        <span className={`hidden sm:block text-sm font-semibold truncate max-w-xs ${textPrimary}`}>
          {siteName}
        </span>
      </Link>

      {/* Right: user name + role, avatar, theme toggle, logout */}
      <div className="flex items-center gap-6 shrink-0">
        <div className="hidden sm:flex flex-col items-center gap-0.5 min-w-[9rem]">
          <span className={`text-xs leading-none font-medium ${textPrimary}`}>{nameLabel}</span>
          {role && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeCls}`}>
              {getRoleLabel(role)}
            </span>
          )}
        </div>
        {user?.photoURL && (
          <img
            src={user.photoURL}
            alt=""
            width={32}
            height={32}
            className="rounded-full object-cover shrink-0"
          />
        )}
        <button
          aria-label="Toggle dark mode"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={handleThemeToggle}
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${btnCls}`}
        >
          {theme === 'dark' ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M12 3.1a9 9 0 1 0 8.9 10.49.75.75 0 0 0-1.23-.77 7.5 7.5 0 1 1-7.27-12 .75.75 0 0 0-.4 1.28z"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0 3.75a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 1-.75.75zm0-18a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5A.75.75 0 0 1 12 3.75zM3.75 12a.75.75 0 0 1-.75-.75h-1.5a.75.75 0 0 1 0 1.5h1.5A.75.75 0 0 1 3.75 12zm18 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75zM5.28 5.28a.75.75 0 0 1-1.06-1.06L4.28 3.28a.75.75 0 0 1 1.06 1.06L5.28 5.28zm13.44 13.44a.75.75 0 0 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 1.06l-1.06 1.06zm0-14.5 1.06-1.06a.75.75 0 0 1 1.06 1.06L19.78 5.28a.75.75 0 1 1-1.06-1.06zM4.22 19.78 3.16 20.84a.75.75 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06z"/>
            </svg>
          )}
        </button>
        <button
          onClick={handleLogout}
          style={logoutStyle}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-opacity hover:opacity-90"
        >
          <img src="/logout.png" alt="" width={14} height={14} className={logoutIconCls} />
          Logout
        </button>
      </div>
    </header>
  );
}
