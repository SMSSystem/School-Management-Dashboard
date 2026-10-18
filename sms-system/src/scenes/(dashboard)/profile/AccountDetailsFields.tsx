import type { ProfileData } from "@/lib/profileLogic";
import Field from "./Field";

// What goes inside the Account Details card: the account's metadata, read-only.
const AccountDetailsFields = ({ profile, roleLabel }: { profile: ProfileData; roleLabel: string }) => (
  <div className="grid grid-cols-1 gap-4">
    <Field label="Role" value={roleLabel} />
    <Field label="Status" value={profile.status} />
    <Field label="User ID" value={profile.userId} />
    <Field label="Created date" value={profile.createdAt} />
    <Field label="Last login" value={profile.lastLogin} />
    <Field label="Linked accounts" value={profile.linkedAccounts} />
  </div>
);

export default AccountDetailsFields;
