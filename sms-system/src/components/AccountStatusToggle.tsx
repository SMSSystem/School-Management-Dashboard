import { useState } from "react";
import { UserCheck, UserX, X } from "lucide-react";
import { doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { actorName, buildAuditEntry } from "@/lib/auditLog";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection } from "@/lib/paths";
import { queryClient } from "@/lib/queryClient";
import type { InstitutionUserDoc } from "@/hooks/useInstitutionUsers";
import { isAccountInactive, nextStatus, statusAuditEvent } from "@/lib/accountStatus";
import { classIdsOf } from "@/lib/studentClasses";
import { populationDelta } from "@/lib/classPopulationDelta";
import { addPopulationDelta } from "@/lib/classPopulationWrite";
import { fetchInstitutionClasses } from "@/hooks/useInstitutionClasses";

// Deactivate / reactivate a teacher, student or parent account (admin only).
// An inactive account can no longer use the app: firestore.rules stop matching
// it for every role and institution check, and it is signed out with a clear
// message the next time it loads. The status change and its audit entry are
// written in ONE batch so there is never a deactivation with no record of who
// did it.
const AccountStatusToggle = ({
  uid,
  name,
  status,
  institutionId,
  student = false,
}: {
  uid: string;
  name: string;
  status?: string;
  // A student's status decides whether they count in their classes' head-counts (lib/classPopulationDelta.ts), so
  // the same batch moves them. Set by the Students list.
  student?: boolean;
  // The TARGET account's institution — a super_admin's own is the '*' sentinel.
  institutionId?: string;
}) => {
  const { user, role, displayName } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inactive = isAccountInactive(status);
  const next = nextStatus(status);
  const verb = inactive ? "Reactivate" : "Deactivate";

  // Never offered to anyone else, and never on yourself (you'd lock yourself out).
  if ((role !== "institution_admin" && role !== "super_admin") || !user || user.uid === uid) {
    return null;
  }

  const confirm = async () => {
    if (!institutionId) return;
    setSaving(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", uid), { status: next });
      if (student && institutionId !== "*") {
        // The student as stored right now (the list row can be minutes old), so the counts move only if the status
        // really changes.
        const stored = (await getDoc(doc(db, "users", uid))).data();
        if (stored) {
          const classIds = new Set((await fetchInstitutionClasses(institutionId)).map((c) => c.id));
          addPopulationDelta(
            batch,
            institutionId,
            populationDelta(
              { classIds: classIdsOf(stored), gender: stored.gender, status: stored.status },
              { classIds: classIdsOf(stored), gender: stored.gender, status: next },
              classIds,
            ),
          );
        }
      }
      batch.set(
        doc(institutionCollection(institutionId, "audit_log")),
        buildAuditEntry({
          institutionId,
          eventType: statusAuditEvent(next),
          detail: inactive ? `Reactivated the account of ${name}` : `Deactivated the account of ${name}`,
          targetUid: uid,
          targetName: name,
          performedBy: user.uid,
          performedByName: actorName(displayName, user.email),
        }),
      );
      await batch.commit();
      // Patch the one cached row instead of invalidating: a refetch would
      // re-read every user in the institution for a single status change.
      queryClient.setQueryData<InstitutionUserDoc[]>(["users", institutionId], (rows) =>
        rows?.map((r) => (r.id === uid ? { ...r, status: next } : r)),
      );
      setOpen(false);
    } catch {
      setError(`Failed to ${verb.toLowerCase()} this account. Please try again.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="w-7 h-7 flex items-center justify-center rounded-full"
        style={{ backgroundColor: inactive ? "#16a34a" : "#b45309" }}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        title={`${verb} ${name}`}
        aria-label={`${verb} ${name}`}
      >
        {inactive ? <UserCheck className="w-3.5 h-3.5 text-white" /> : <UserX className="w-3.5 h-3.5 text-white" />}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-md relative w-full max-w-md flex flex-col gap-4">
            <button
              type="button"
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
              onClick={() => setOpen(false)}
              title="Close"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold pr-8">
              {verb} {name}?
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {inactive
                ? "They will be able to sign in and use the app again."
                : "They will be signed out and will not be able to sign in or use the app until you reactivate the account. Their records are kept."}
            </p>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="py-2 px-4 rounded-md text-sm text-white disabled:opacity-50"
                style={{ backgroundColor: inactive ? "#16a34a" : "#b45309" }}
                onClick={confirm}
              >
                {saving ? "Saving…" : `Yes, ${verb.toLowerCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AccountStatusToggle;
