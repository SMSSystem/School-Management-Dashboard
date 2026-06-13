import { useAuth } from '@/lib/AuthContext';

const InstitutionProfilePage = () => {
  const { institution } = useAuth();

  if (!institution) return null;

  return (
    <div className="max-w-xl mx-auto p-6 flex flex-col items-center gap-6">

      {institution.logoUrl && (
        <img
          src={institution.logoUrl}
          alt={institution.name}
          className="w-40 h-40 object-contain rounded-lg shadow-sm"
        />
      )}

      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{institution.name}</h1>
        {institution.motto && (
          <p className="mt-1 text-sm italic text-gray-500 dark:text-gray-400">{institution.motto}</p>
        )}
      </div>

      <div className="w-full bg-white dark:bg-gray-800 rounded-md p-4 flex flex-col gap-2 text-sm">
        {institution.phone && (
          <div className="flex items-start gap-2">
            <span className="text-gray-500 w-20 shrink-0">Phone</span>
            <span className="text-gray-800 dark:text-gray-200">{institution.phone}</span>
          </div>
        )}
        {institution.email && (
          <div className="flex items-start gap-2">
            <span className="text-gray-500 w-20 shrink-0">Email</span>
            <a href={`mailto:${institution.email}`} className="text-sky-600 hover:underline">
              {institution.email}
            </a>
          </div>
        )}
        {institution.address && (
          <div className="flex items-start gap-2">
            <span className="text-gray-500 w-20 shrink-0">Address</span>
            <span className="text-gray-800 dark:text-gray-200 whitespace-pre-line">{institution.address}</span>
          </div>
        )}
        {!institution.phone && !institution.email && !institution.address && (
          <p className="text-gray-400 text-xs italic">No contact details on record.</p>
        )}
      </div>

    </div>
  );
};

export default InstitutionProfilePage;
