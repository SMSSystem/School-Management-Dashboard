import { useAuth } from '@/lib/AuthContext';
import RegistrationDirectoryToggle from '@/components/RegistrationDirectoryToggle';
import { InstitutionInfoDisplay } from './InstitutionInfoDisplay';
import { InstitutionProfileWizard } from './InstitutionProfileWizard';

// ─── Entry point ─────────────────────────────────────────────────────────────

const InstitutionProfilePage = () => {
  const { role, institution } = useAuth();

  if (role !== 'institution_admin') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-start sm:justify-center p-3 sm:p-4">
        <InstitutionInfoDisplay />
      </div>
    );
  }

  if (institution?.profileComplete) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4 w-full">
        <h1 className="text-2xl font-semibold text-center text-gray-900 dark:text-gray-100 mb-4">
          Institution Profile
        </h1>
        <InstitutionInfoDisplay />
        <p className="mt-4 text-center text-sm text-gray-400 dark:text-gray-500">
          Please contact the service administrator to edit your institution's profile data.
        </p>
        <div className="w-full max-w-xl">
          <RegistrationDirectoryToggle />
        </div>
      </div>
    );
  }

  return <InstitutionProfileWizard />;
};

export default InstitutionProfilePage;
