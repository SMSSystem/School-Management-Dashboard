import { Link, useNavigate } from "react-router-dom"
import { logout } from "@/lib/authService";
import { useEffect, useState } from "react";
import { getRole, setRole } from "@/lib/auth";
import type { Role } from "@/lib/auth";

const Navbar = () => {
  const navigate = useNavigate();
  const [currentRole, setCurrentRole] = useState<Role | null>(getRole());

  useEffect(() => {
    setCurrentRole(getRole());
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  }

  const handleRoleSwitch = (r: Role) => {
    setRole(r);
    setCurrentRole(r);
    // Navigate and reload to ensure static role-based UI (like Menu) updates
    navigate('/', { replace: true });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
  return (
    <div className='flex items-center justify-between p-4'>
      {/* SEARCH BAR */}
      <div className='hidden md:flex items-center gap-2 text-xs rounded-full ring-[1.5px] ring-gray-300 px-2'>
        <img src="/search.png" alt="" width={14} height={14}/>
        <input type="text" placeholder="Search..." className="w-[200px] p-2 bg-transparent outline-none"/>
      </div>
      {/* ICONS AND USER */}
      <div className='flex items-center gap-6 justify-end w-full'>
        <div className='bg-white rounded-full w-7 h-7 flex items-center justify-center cursor-pointer'>
          <img 
            src="/message.png" 
            alt="" 
            width={20} 
            height={20}
            className="hover:grayscale hover:brightness-50 hover:scale-105 transition-all"
          />
        </div>
        <div className='bg-white rounded-full w-7 h-7 flex items-center justify-center cursor-pointer relative'>
          <Link
            to={"/list/announcements"}
          >
            <img 
              src="/announcement.png" 
              alt="" width={20} 
              height={20} 
              className="hover:grayscale hover:brightness-50 hover:scale-105 transition-all"
            />
            <div className='absolute -top-3 -right-3 w-5 h-5 flex items-center justify-center bg-purple-500 text-white rounded-full text-xs'>1</div>
          </Link>
        </div>
        <div className='flex flex-col'>
          <span className="text-xs leading-3 font-medium">John Doe</span>
          <span className="text-[10px] text-gray-500 text-right">{(currentRole ?? 'admin').replace(/^./, s => s.toUpperCase())}</span>
        </div>
        <img src="/avatar.png" alt="" width={36} height={36} className="rounded-full"/>
        {import.meta.env.DEV && (
          <div className='hidden md:flex items-center gap-2 text-xs'>
            <span className='text-gray-400'>Role:</span>
            <select
              className='border border-gray-300 rounded-md px-2 py-1 outline-none'
              value={currentRole ?? 'admin'}
              onChange={(e) => handleRoleSwitch(e.target.value as Role)}
            >
              <option value="admin">Admin</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
              <option value="parent">Parent</option>
            </select>
          </div>
        )}
        <button onClick={handleLogout} className='flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900'>
          <img src="/logout.png" alt="logout" width={16} height={16} />
          Logout
        </button>
      </div>
    </div>
  )
}

export default Navbar
