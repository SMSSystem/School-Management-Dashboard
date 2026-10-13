import type { ReactNode } from "react";

// A card on the profile page. Deliberately NOT stretched to its grid cell's
// height by default (it used to be `h-[stretch]`): a long list in one column made
// the sections beside it stretch to match. Cards end where their content ends.
// `fill` is the opt-in for a card that sits in a flex column and should grow to
// the column's end (Role-specific Details and Account Details, so the two columns
// finish together; the Activity list is no longer beside them).
const ProfileSection = ({
  title,
  subtitle,
  action,
  fill = false,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  fill?: boolean;
  children: ReactNode;
}) => (
  <section className={`bg-white dark:bg-gray-800 rounded-md p-4 shadow-sm${fill ? " flex-1" : ""}`}>
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
