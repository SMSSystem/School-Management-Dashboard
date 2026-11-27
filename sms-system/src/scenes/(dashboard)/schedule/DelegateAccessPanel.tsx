import { useEffect, useState } from "react";
import { doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { actorName, buildAuditEntry } from "@/lib/auditLog";
import { institutionCollection } from "@/lib/paths";
import { DATA_MODE } from "@/lib/data";
import { useInstitutionUsers } from "@/hooks/useInstitutionUsers";
import { queryClient } from "@/lib/queryClient";
import { SCHEDULE_TEXT } from "./scheduleLabels";

type SeniorTeacher = {
  id: string;
  name: string;
  canGenerateSchedule: boolean;
  department?: string;
};
type ToggleFeedback = "granted" | "revoked" | "error";

// The Schedule page's "Delegate Schedule Access" panel, moved out of the page unchanged (redesign PR B): an
// institution_admin grants or revokes a senior teacher's right to create and edit timetable slots. The page mounts it
// only for an institution_admin; a spectator never sees it.
export default function DelegateAccessPanel() {
  const { user, role, institutionId, displayName } = useAuth();
  const [seniorTeachers, setSeniorTeachers] = useState<SeniorTeacher[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, ToggleFeedback>>({});

  // The admin's list of senior teachers comes from the shared cached users list (hooks/useInstitutionUsers.ts), not a
  // read of its own; a toggle below updates the row at once and refreshes that cache.
  const { data: institutionUsers } = useInstitutionUsers({
    enabled: DATA_MODE === "live" && role === "institution_admin",
  });
  useEffect(() => {
    if (!institutionUsers) return;
    setSeniorTeachers(
      institutionUsers
        .filter((u) => u.role === "senior_teacher")
        .map((u) => ({
          id: u.id,
          name: String(u.name ?? ""),
          canGenerateSchedule: u.canGenerateSchedule === true,
          department: u.department as string | undefined,
        })),
    );
  }, [institutionUsers]);

  async function handleToggle(teacher: SeniorTeacher) {
    const next = !teacher.canGenerateSchedule;
    try {
      // The change and its audit entry in ONE batch, so a grant or revoke never
      // exists without a record of who made it. The teacher is in the admin's
      // own institution (only an institution_admin sees this toggle).
      const batch = writeBatch(db);
      batch.update(doc(db, "users", teacher.id), { canGenerateSchedule: next });
      if (user && institutionId && institutionId !== "*") {
        batch.set(
          doc(institutionCollection(institutionId, "audit_log")),
          buildAuditEntry({
            institutionId,
            eventType: "permission_change",
            detail: `${next ? "Granted" : "Revoked"} schedule-generation access for ${teacher.name}`,
            targetUid: teacher.id,
            targetName: teacher.name,
            performedBy: user.uid,
            performedByName: actorName(displayName, user.email),
          }),
        );
      }
      await batch.commit();
      void queryClient.invalidateQueries({
        queryKey: ["users", institutionId],
      });
      setSeniorTeachers((prev) =>
        prev.map((t) =>
          t.id === teacher.id ? { ...t, canGenerateSchedule: next } : t,
        ),
      );
      setFeedback((prev) => ({
        ...prev,
        [teacher.id]: next ? "granted" : "revoked",
      }));
    } catch {
      setFeedback((prev) => ({ ...prev, [teacher.id]: "error" }));
    }
    setTimeout(
      () =>
        setFeedback((prev) => {
          const n = { ...prev };
          delete n[teacher.id];
          return n;
        }),
      3000,
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-md">
      <button
        type="button"
        aria-expanded={panelOpen}
        className="w-full min-h-11 flex items-center justify-between p-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-md transition-colors"
        onClick={() => setPanelOpen((o) => !o)}
      >
        <span>{SCHEDULE_TEXT.delegate}</span>
        <span className="text-xs text-gray-400" aria-hidden="true">
          {panelOpen ? "▲" : "▼"}
        </span>
      </button>
      {panelOpen && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Grant selected senior teachers the ability to create and edit
            timetable slots.
          </p>
          {seniorTeachers.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              No senior teachers found.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {seniorTeachers.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{t.name}</span>
                    {t.department && (
                      <span className="text-xs text-gray-400">
                        {t.department}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {feedback[t.id] === "granted" && (
                      <span className="text-xs text-green-500">
                        Access granted
                      </span>
                    )}
                    {feedback[t.id] === "revoked" && (
                      <span className="text-xs text-gray-400">
                        Access revoked
                      </span>
                    )}
                    {feedback[t.id] === "error" && (
                      <span className="text-xs text-red-400">
                        Failed to update
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggle(t)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        t.canGenerateSchedule
                          ? "bg-blue-500"
                          : "bg-gray-300 dark:bg-gray-600"
                      }`}
                      aria-label={`${t.canGenerateSchedule ? "Revoke" : "Grant"} schedule access for ${t.name}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          t.canGenerateSchedule
                            ? "translate-x-4"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
