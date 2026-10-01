import { isAccountInactive } from "@/lib/accountStatus";

// Small marker shown on an admin's Teachers/Students/Parents list for an
// account an admin has deactivated. Renders nothing for active accounts.
const InactiveBadge = ({ status }: { status?: string | null }) =>
  isAccountInactive(status) ? (
    <span
      className="mt-1 w-fit rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-900/30 dark:text-red-200"
      title="This account has been deactivated and cannot sign in."
    >
      Inactive
    </span>
  ) : null;

export default InactiveBadge;
