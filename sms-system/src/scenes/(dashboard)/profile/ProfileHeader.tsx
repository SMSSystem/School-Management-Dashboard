import { useAuth } from "@/lib/AuthContext";
import type { ProfileData } from "@/lib/profileLogic";

// The card at the top of the page: avatar, name, role and status, and the institution's logo.
const ProfileHeader = ({
  profile,
  roleLabel,
  institution,
}: {
  profile: ProfileData;
  roleLabel: string;
  institution: ReturnType<typeof useAuth>["institution"];
}) => (
  <section className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-md p-4 sm:p-6 shadow-sm">
    <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:text-left sm:gap-4">
      <img
        src={profile.photo}
        alt={`${profile.name} avatar`}
        className="w-20 h-20 rounded-full object-cover ring-4 ring-sky-100 dark:ring-gray-700 shrink-0"
      />

      <div className="flex-1 min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 wrap-break-word">
          {profile.name}
        </h1>
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1">
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
            {roleLabel}
          </span>
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
            {profile.status}
          </span>
        </div>
      </div>
      {institution?.logoUrl && (
        <img
          src={institution.logoUrl}
          alt={institution.name}
          // Not shown on phones (below md): the header already carries the logo.
          className="hidden md:block w-16 h-16 object-contain rounded shrink-0 self-center"
        />
      )}
    </div>
  </section>
);

export default ProfileHeader;
