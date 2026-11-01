import { buildDescription, displayVersion } from "@/lib/appVersion";

// The running version ("v2.39.0"), with the build in its tooltip. Shown in the sidebar, on the
// sign-in screens and on the error screens, so a user can quote it when reporting a problem.
const AppVersionTag = ({ className = "" }: { className?: string }) => (
  <p title={buildDescription()} className={`text-[11px] text-slate-400 dark:text-slate-500 ${className}`}>
    {displayVersion()}
  </p>
);

export default AppVersionTag;
