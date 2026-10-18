import { Mail, MapPin, Phone } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { formatPhoneForDisplay, telHref } from '@/lib/phone';

// The read-only profile card: identity, contact rows. Everyone but an institution admin sees only this.
export function InstitutionInfoDisplay() {
  const { institution } = useAuth();

  if (!institution) return null;

  const rowClass =
    'flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 min-h-14 text-sm';
  const iconWrap =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300';
  const hasContact = !!(institution.address || institution.phone || institution.email);

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-4">
      {/* Identity */}
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-linear-to-br from-sky-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800/60 border border-sky-100 dark:border-gray-700 p-6 text-center">
        {institution.logoUrl && (
          <img
            src={institution.logoUrl}
            alt={institution.name}
            className="w-24 h-24 sm:w-28 sm:h-28 object-contain rounded-xl bg-white dark:bg-gray-900 p-2 shadow-sm"
          />
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white wrap-break-word">{institution.name}</h1>
          {institution.motto && (
            <p className="mt-1 text-sm italic text-gray-500 dark:text-gray-400">{institution.motto}</p>
          )}
        </div>
      </div>

      {/* Contact: tappable rows */}
      <div className="flex flex-col gap-2">
        {institution.phone && (
          <a href={telHref(institution.phone)} className={rowClass}>
            <span className={iconWrap}>
              <Phone className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-gray-500 dark:text-gray-400">Phone</span>
              <span className="block font-medium text-gray-900 dark:text-gray-100 wrap-anywhere">{formatPhoneForDisplay(institution.phone)}</span>
            </span>
          </a>
        )}
        {institution.email && (
          <a href={`mailto:${institution.email}`} className={rowClass}>
            <span className={iconWrap}>
              <Mail className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-gray-500 dark:text-gray-400">Email</span>
              <span className="block font-medium text-sky-700 dark:text-sky-300 wrap-anywhere">{institution.email}</span>
            </span>
          </a>
        )}
        {institution.address && (
          <div className={rowClass}>
            <span className={iconWrap}>
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-gray-500 dark:text-gray-400">Address</span>
              <span className="block font-medium text-gray-900 dark:text-gray-100 whitespace-pre-line wrap-anywhere">
                {institution.address}
              </span>
            </span>
          </div>
        )}
        {!hasContact && (
          <p className="text-center text-gray-400 text-xs italic">No contact details on record.</p>
        )}
      </div>
    </div>
  );
}
