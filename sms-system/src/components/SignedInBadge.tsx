// A small badge under a spectator's name: "Signed in" once they have signed in and chosen their own password
// (mustChangePassword false), "Not signed in yet" while they are still on the password they were given. Spectators
// are never emailed a sign-in link (security report S-01), so unlike LoginLinkBadge this says nothing about email.
// An older account with no first-sign-in record shows nothing.
const SignedInBadge = ({
  mustChangePassword,
}: {
  mustChangePassword?: boolean;
}) => {
  if (mustChangePassword === undefined) return null;
  const signedIn = mustChangePassword === false;
  return (
    <span
      className={`mt-1 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        signedIn
          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
          : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
      }`}
      title={
        signedIn
          ? "This spectator has signed in and chosen their own password."
          : "This spectator has not signed in yet. Give them their password in person."
      }
    >
      {signedIn ? "Signed in" : "Not signed in yet"}
    </span>
  );
};

export default SignedInBadge;
