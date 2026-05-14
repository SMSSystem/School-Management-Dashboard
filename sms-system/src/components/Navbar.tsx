import { Link, useNavigate } from "react-router-dom"
import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getRoleLabel } from "@/lib/firebase";
import { toggleTheme, getStoredTheme, type Theme } from '@/lib/theme';

const Navbar = () => {
  const navigate = useNavigate();
  const { role, signOut } = useAuth();
  const [theme, setThemeState] = useState<Theme>(getStoredTheme() ?? 'light');

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleThemeToggle = () => {
    const t = toggleTheme();
    setThemeState(t);
  };

  return (
    <div className='flex items-center justify-between p-4'>
      <div className='hidden md:flex items-center gap-2 text-xs rounded-full ring-[1.5px] ring-gray-300 dark:ring-gray-700 px-2 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-200'>
        <img src="/search.png" alt="" width={14} height={14}/>
        <input type="text" placeholder="Search..." className="w-[200px] p-2 bg-transparent outline-none"/>
      </div>
      <div className='flex items-center gap-6 justify-end w-full'>
        <div className='bg-white dark:bg-gray-800 rounded-full w-7 h-7 flex items-center justify-center cursor-pointer'>
          <img src="/message.png" alt="" width={20} height={20} className="hover:grayscale hover:brightness-50 hover:scale-105 transition-all"/>
        </div>
        <div className='bg-white dark:bg-gray-800 rounded-full w-7 h-7 flex items-center justify-center cursor-pointer relative'>
          <Link to={"/list/announcements"}>
            <img src="/announcement.png" alt="" width={20} height={20} className="hover:grayscale hover:brightness-50 hover:scale-105 transition-all"/>
            <div className='absolute -top-3 -right-3 w-5 h-5 flex items-center justify-center bg-purple-500 text-white rounded-full text-xs'>1</div>
          </Link>
        </div>
        <div className='flex flex-col'>
          <span className="text-xs leading-3 font-medium">John Doe</span>
          <span className="text-[10px] text-gray-500 text-right">{role ? getRoleLabel(role) : ''}</span>
        </div>
        <img src="/avatar.png" alt="" width={36} height={36} className="rounded-full"/>
        <button
          aria-label="Toggle dark mode"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={handleThemeToggle}
          className='hidden md:inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 transition-colors'
        >
          {theme === 'dark' ? (
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='w-4 h-4'>
              <path d='M12 3.1a9 9 0 1 0 8.9 10.49.75.75 0 0 0-1.23-.77 7.5 7.5 0 1 1-7.27-12 .75.75 0 0 0-.4 1.28z'/>
            </svg>
          ) : (
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='w-4 h-4'>
              <path d='M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0 3.75a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 1-.75.75zm0-18a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5A.75.75 0 0 1 12 3.75zM3.75 12a.75.75 0 0 1-.75-.75h-1.5a.75.75 0 0 1 0 1.5h1.5A.75.75 0 0 1 3.75 12zm18 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75zM5.28 5.28a.75.75 0 0 1-1.06-1.06L4.28 3.28a.75.75 0 0 1 1.06 1.06L5.28 5.28zm13.44 13.44a.75.75 0 0 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 1.06l-1.06 1.06zm0-14.5 1.06-1.06a.75.75 0 0 1 1.06 1.06L19.78 5.28a.75.75 0 1 1-1.06-1.06zM4.22 19.78 3.16 20.84a.75.75 0 1 1-1.06-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06z'/>
            </svg>
          )}
        </button>
        <button onClick={handleLogout} className='flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'>
          <img src="/logout.png" alt="logout" width={16} height={16} />
          Logout
        </button>
      </div>
    </div>
  );
};

export default Navbar;
