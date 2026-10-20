import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AccountDialog, AccountDialogActions } from "@/components/AccountDialog";
import { actorName } from "@/lib/auditLog";
import { useAuth } from "@/lib/AuthContext";
import {
  KEPT_STUDENT_NOTES,
  canConfirmDeletion,
  confirmationMatches,
  deleteBlockReason,
} from "@/lib/deleteUserData";
import { executeUserDeletion, planUserDeletion, type DeletionPlan } from "@/lib/deleteUserExecutor";

// " (code permission-denied)" for a Firestore error, so a failure names its cause.
const errorCode = (err: unknown): string => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? ` (code ${code})` : "";
};

// Permanently delete a student or teacher account (institution admin only). It
// removes the person's own records and their profile, writes one audit entry, and
// leaves the sign-in (Firebase Authentication) account for the owner's clean-up
// script: a browser cannot delete another person's sign-in. Deactivate is the
// reversible option; this one cannot be undone.
const DeleteUserButton = ({
  uid,
  name,
  role: targetRole,
  institutionId,
}: {
  uid: string;
  name: string;
  role: string;
  // The TARGET account's institution.
  institutionId?: string;
}) => {
  const { user, role, displayName } = useAuth();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<DeletionPlan | null>(null);
  const [typed, setTyped] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Institution admins only (a super admin manages institutions, not their people),
  // never on yourself, never on a role that cannot be deleted.
  if (role !== "institution_admin" || !user || !institutionId) return null;
  if (deleteBlockReason({ uid, role: targetRole }, user.uid)) return null;

  const total = plan?.ops.length ?? 0;
  const ready = canConfirmDeletion({
    planLoaded: plan !== null,
    typedOk: confirmationMatches(typed, name),
    acknowledged: ack,
    busy,
  });

  const openDialog = async () => {
    setOpen(true);
    setPlan(null);
    setTyped("");
    setAck(false);
    setError(null);
    try {
      setPlan(await planUserDeletion(institutionId, uid, targetRole));
    } catch (err) {
      console.warn("Delete user: could not check the records", err);
      setError(`Could not check this person's records. Please try again.${errorCode(err)}`);
    }
  };

  const confirm = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      await executeUserDeletion({
        institutionId,
        uid,
        name,
        role: targetRole,
        plan,
        actorUid: user.uid,
        actorName: actorName(displayName, user.email),
      });
      setOpen(false);
    } catch (err) {
      console.warn("Delete user: deletion did not finish", err);
      setError(`Deletion did not finish. Some records may already be removed: close this and press the delete button again to finish.${errorCode(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="w-7 h-7 flex items-center justify-center rounded-full"
        style={{ backgroundColor: "#b91c1c" }}
        onClick={openDialog}
        title={`Delete ${name}`}
        aria-label={`Delete ${name}`}
      >
        <Trash2 className="w-3.5 h-3.5 text-white" />
      </button>

      {open && (
        <AccountDialog title={<>Delete {name}?</>} onClose={() => !busy && setOpen(false)}>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            This permanently removes the account and cannot be undone. To stop someone using the app without losing
            anything, deactivate them instead.
          </p>

          {!plan && !error && <p className="text-sm text-gray-500">Checking what will be removed…</p>}
          {plan && (
            <div className="text-sm text-gray-700 dark:text-gray-300">
              <p className="font-medium">
                The profile and {total} related record{total === 1 ? "" : "s"} will be deleted
                {plan.summary.length > 0 ? ":" : "."}
              </p>
              <ul className="list-disc pl-5 mt-1">
                {plan.summary.map((s) => (
                  <li key={s.label}>
                    {s.count} × {s.label}
                  </li>
                ))}
              </ul>
              {targetRole === "student" ? (
                <p className="mt-2 text-gray-500 dark:text-gray-400">
                  Not removed: {KEPT_STUDENT_NOTES.join("; ")}, assignment submissions, and the activity and audit
                  logs.
                </p>
              ) : (
                <p className="mt-2 text-gray-500 dark:text-gray-400">
                  What this teacher created (assignments, exams, lessons, notes and graded results) is kept, and so
                  are the activity and audit logs.
                </p>
              )}
              <p className="mt-2 text-gray-500 dark:text-gray-400">
                Their sign-in is removed afterwards by the owner's clean-up script.
              </p>
            </div>
          )}

          <label className="text-sm text-gray-700 dark:text-gray-300 flex flex-col gap-1">
            Type <strong>{name}</strong> to confirm
            <input
              type="text"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5"
            />
            I understand this cannot be undone.
          </label>
          <AccountDialogActions error={error} onCancel={() => setOpen(false)} cancelDisabled={busy}>
            <button
              type="button"
              disabled={!ready}
              className="py-2 px-4 rounded-md text-sm text-white disabled:opacity-50"
              style={{ backgroundColor: "#b91c1c" }}
              onClick={confirm}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </AccountDialogActions>
        </AccountDialog>
      )}
    </>
  );
};

export default DeleteUserButton;
