import type { ReactNode } from "react";

// A card on the profile page. Deliberately NOT stretched to its grid cell's
// height (it used to be `h-[stretch]`): a long list in one column made the
// sections beside it stretch to match. Cards now end where their content ends.
const ProfileSection = ({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="bg-white dark:bg-gray-800 rounded-md p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
    {children}
  </section>
);

export default ProfileSection;
