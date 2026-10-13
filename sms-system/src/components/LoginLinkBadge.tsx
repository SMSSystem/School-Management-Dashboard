import type { LoginLinkState } from "@/lib/loginLinkStatus";

// A small badge under a person's name: "Signed in", "Link sent 12 Oct" or "Link not sent".
// Shown in the Students, Teachers and Spectators lists for an admin or spectator.
const LoginLinkBadge = ({
  state,
  emailedAtMs,
}: {
  state?: LoginLinkState;
  emailedAtMs?: number | null;
}) => {
  if (!state) return null;

  const cls =
    state === "signed_in"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
      : state === "sent"
        ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
        : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  const text =
    state === "signed_in"
      ? "Signed in"
      : state === "sent"
        ? `Link sent ${new Date(emailedAtMs as number).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
        : "Link not sent";

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
      title={
        state === "signed_in"
          ? "This person has signed in and chosen their own password."
          : state === "sent"
            ? "A sign-in link was emailed; they have not signed in yet."
            : "No sign-in link has been emailed yet."
      }
    >
      {text}
    </span>
  );
};

export default LoginLinkBadge;
