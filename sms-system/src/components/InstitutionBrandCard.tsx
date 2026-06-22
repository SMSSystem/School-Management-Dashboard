import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export function InstitutionBrandCard() {
  const { institution } = useAuth();

  if (!institution) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Institution Profile</h2>
        {!institution.profileComplete && (
          <Link to="/dashboard/brand-settings" className="text-xs text-sky-600 hover:underline dark:text-sky-400">
            Edit →
          </Link>
        )}
      </div>

      {institution.logoUrl && (
        <div className="flex justify-center py-2">
          <img
            src={institution.logoUrl}
            alt={institution.name}
            className="w-24 h-24 object-contain rounded-lg"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5 text-sm">
        <p className="font-semibold text-gray-900 dark:text-white">{institution.name}</p>
        {institution.motto && (
          <p className="text-xs italic text-gray-500 dark:text-gray-400">{institution.motto}</p>
        )}
        {institution.phone && (
          <p className="text-xs text-gray-600 dark:text-gray-400">{institution.phone}</p>
        )}
        {institution.email && (
          <a
            href={`mailto:${institution.email}`}
            className="text-xs text-sky-600 hover:underline dark:text-sky-400"
          >
            {institution.email}
          </a>
        )}
        {institution.address && (
          <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-line">
            {institution.address}
          </p>
        )}
        {!institution.logoUrl && !institution.motto && !institution.phone && !institution.email && !institution.address && (
          <p className="text-xs text-gray-400 italic">
            No brand data set.{' '}
            <Link to="/dashboard/brand-settings" className="text-sky-600 hover:underline">Add it now →</Link>
          </p>
        )}
      </div>
    </div>
  );
}
