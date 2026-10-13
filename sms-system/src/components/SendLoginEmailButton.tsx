import { useState } from "react";
import { Mail } from "lucide-react";
import { Timestamp, doc, getDoc, increment, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db, type UserDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { actorName, buildAuditEntry } from "@/lib/auditLog";
import { institutionCollection } from "@/lib/paths";
import { queryClient } from "@/lib/queryClient";
import type { InstitutionUserDoc } from "@/hooks/useInstitutionUsers";
import { loginEmailBlockReason } from "@/lib/loginEmail/eligibility";
import { buildLoginEmailParams } from "@/lib/loginEmail/payload";
import { sendEmail } from "@/lib/loginEmail/sendEmail";
import { loadEmailSettings } from "@/lib/loginEmail/settings";
import { linkRoleFor } from "@/lib/roleDefaultPasswords";

// "Send sign-in email" for one account (institution admin only): emails the
// person a link that opens the login page for this institution with the
// password box hidden (docs/miscellaneous-specs/INSTITUTION_LOGIN_EMAILS_SPEC.md,
// first-login email). Sent from the institution's own mailbox through its own
// EmailJS account, from this admin's browser. Every check runs on a FRESH read
// of the account, not the cached list row. The email never contains a password.

const EMAIL_ENABLED = import.meta.env.VITE_EMAIL_ENABLED === "true";
const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined)?.trim() ?? "";

const SendLoginEmailButton = ({
  uid,
  name,
  institutionId,
}: {
  uid: string;
  name: string;
  // The TARGET account's institution.
  institutionId?: string;
}) => {
  const { role, user, displayName } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Offered only to an institution admin, and never outside the production
  // setup (VITE_EMAIL_ENABLED is unset in dev, previews and e2e, so no real
  // email can leave those environments).
  if (role !== "institution_admin" || !EMAIL_ENABLED || !APP_URL || !institutionId) return null;

  const send = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) {
        setMessage({ text: "This account no longer exists.", ok: false });
        return;
      }
      const data = snap.data() as UserDocument & { email?: string };
      const blocked = loginEmailBlockReason(
        {
          role: data.role,
          status: data.status,
          mustChangePassword: data.mustChangePassword,
          email: data.email,
          emailedAtMs: data.credentialsEmailedAt?.toMillis() ?? null,
          emailCount: data.credentialsEmailCount ?? 0,
        },
        Date.now(),
      );
      if (blocked || !linkRoleFor(data.role) || !data.email) {
        setMessage({ text: blocked ?? "This account cannot be emailed.", ok: false });
        return;
      }
      const settings = await loadEmailSettings(institutionId);
      if (!settings) {
        setMessage({ text: "Sign-in emails are not set up for this institution.", ok: false });
        return;
      }
      const result = await sendEmail(
        settings,
        buildLoginEmailParams({
          appUrl: APP_URL,
          institutionId,
          role: data.role,
          name: data.name,
          email: data.email,
          settings,
        }),
      );
      if (!result.ok) {
        setMessage({ text: result.message, ok: false });
        return;
      }
      try {
        // The cooldown fields and the audit entry in ONE batch, so a recorded send always
        // has its Audit Log entry. The entry names the person, never the address.
        const batch = writeBatch(db);
        batch.update(doc(db, "users", uid), {
          credentialsEmailedAt: serverTimestamp(),
          credentialsEmailCount: increment(1),
        });
        batch.set(
          doc(institutionCollection(institutionId, "audit_log")),
          buildAuditEntry({
            institutionId,
            eventType: "sign_in_email_sent",
            detail: `Emailed a sign-in link to ${data.name}`,
            targetUid: uid,
            targetName: data.name,
            performedBy: user?.uid ?? "",
            performedByName: actorName(displayName, user?.email),
          }),
        );
        // If the combined write is refused (for example the rules were not deployed with
        // the audit event yet), still record the cooldown alone: the email HAS been sent,
        // and without the cooldown the same person could be emailed again and again.
        let audited = true;
        try {
          await batch.commit();
        } catch {
          audited = false;
          await updateDoc(doc(db, "users", uid), {
            credentialsEmailedAt: serverTimestamp(),
            credentialsEmailCount: increment(1),
          });
        }
        // Patch the one cached row so the list's "Link sent" badge updates at once,
        // instead of re-reading every user in the institution.
        queryClient.setQueryData<InstitutionUserDoc[]>(["users", institutionId], (rows) =>
          rows?.map((r) =>
            r.id === uid
              ? {
                  ...r,
                  credentialsEmailedAt: Timestamp.now(),
                  credentialsEmailCount: ((r.credentialsEmailCount as number | undefined) ?? 0) + 1,
                }
              : r,
          ),
        );
        setMessage({
          text: audited ? `Sent to ${data.email}.` : `Sent to ${data.email}, but it could not be added to the Audit Log.`,
          ok: true,
        });
      } catch {
        setMessage({ text: `Sent to ${data.email}, but it could not be recorded.`, ok: true });
      }
    } catch {
      setMessage({ text: "Could not send the email. Please try again.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="w-7 h-7 flex items-center justify-center rounded-full bg-sky-600 disabled:opacity-50"
        onClick={send}
        disabled={busy}
        title={`Email ${name} a sign-in link`}
        aria-label={`Email ${name} a sign-in link`}
      >
        <Mail className="w-3.5 h-3.5 text-white" />
      </button>
      {message && (
        <span
          role="status"
          className={`text-xs ${message.ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
        >
          {message.text}
        </span>
      )}
    </>
  );
};

export default SendLoginEmailButton;
