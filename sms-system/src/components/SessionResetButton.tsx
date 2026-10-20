import { useState } from "react";
import { LogOut } from "lucide-react";
import { AccountDialog, AccountDialogActions } from "@/components/AccountDialog";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { actorName, buildAuditEntry } from "@/lib/auditLog";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection } from "@/lib/paths";

// Clears a stuck "already signed in" lock on a teacher, student or parent
// account (admin only). Accounts normally free themselves the moment their tab
// closes; this is for the rare case where one doesn't (see lib/sessionLock.ts).
// It stamps users/{uid}.sessionResetAt: a sign-in is allowed to take over any
// session that started before that moment, and a live session that is taken
// over signs itself out. The stamp and its audit entry are written in ONE batch,
// so there is never a reset with no record of who did it.
const SessionResetButton = ({
  uid,
  name,
  institutionId,
}: {
  uid: string;
  name: string;
  // The TARGET account's institution — a super_admin's own is the '*' sentinel.
  institutionId?: string;
}) => {
  const { user, role, displayName } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Never offered to anyone else, and never on yourself.
  if ((role !== "institution_admin" && role !== "super_admin") || !user || user.uid === uid) {
    return null;
  }

  const confirm = async () => {
    if (!institutionId) return;
    setSaving(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", uid), { sessionResetAt: serverTimestamp() });
      batch.set(
        doc(institutionCollection(institutionId, "audit_log")),
        buildAuditEntry({
          institutionId,
          eventType: "session_reset",
          detail: `Cleared the sign-in session of ${name}`,
          targetUid: uid,
          targetName: name,
          performedBy: user.uid,
          performedByName: actorName(displayName, user.email),
        }),
      );
      await batch.commit();
      setOpen(false);
    } catch {
      setError("Failed to clear this session. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-500"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        title={`Clear ${name}'s sign-in session`}
        aria-label={`Clear ${name}'s sign-in session`}
      >
        <LogOut className="w-3.5 h-3.5 text-white" />
      </button>

      {open && (
        <AccountDialog title={<>Clear {name}&apos;s session?</>} onClose={() => setOpen(false)}>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Use this if {name} is told their account is already signed in but they are not. The next sign-in will
            work, and if they really are signed in somewhere, that session is signed out. Their records are kept.
          </p>
          <AccountDialogActions error={error} onCancel={() => setOpen(false)}>
            <button
              type="button"
              disabled={saving}
              className="py-2 px-4 rounded-md text-sm text-white bg-slate-600 disabled:opacity-50"
              onClick={confirm}
            >
              {saving ? "Saving…" : "Yes, clear session"}
            </button>
          </AccountDialogActions>
        </AccountDialog>
      )}
    </>
  );
};

export default SessionResetButton;
