import { NavLink } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const PendingInstitutionProfileCard = () => {
  const { institution } = useAuth();
  if (institution?.profileComplete) return null;

  return (
    <div id="tour-home-pending-profile-card" className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 flex flex-col gap-2">
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
        Institution profile incomplete
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-400">
        Complete your institution profile to enable report card generation.
      </p>
      <NavLink
        id="tour-home-pending-profile-cta"
        to="/dashboard/institution-profile"
        className="self-start text-xs font-medium text-amber-800 dark:text-amber-300 underline"
      >
        Complete profile →
      </NavLink>
    </div>
  );
};

export default PendingInstitutionProfileCard;
