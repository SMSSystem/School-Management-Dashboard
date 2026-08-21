import { useState } from "react";
import { doc, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { EnrollmentRegistrationDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionDoc } from "@/lib/paths";
import AdminCreateUserForm from "@/components/forms/AdminCreateUserForm";
import { logRegistrationAudit } from "./registrationAudit";

type Registration = EnrollmentRegistrationDocument & { id: string };
type StepKind = "student" | "mother" | "father";

const CONVERTED_FIELD: Record<StepKind, "convertedStudentUid" | "convertedMotherUid" | "convertedFatherUid"> = {
  student: "convertedStudentUid",
  mother: "convertedMotherUid",
  father: "convertedFatherUid",
};

export default function ConvertToAccountsPanel({
  registration,
  institutionId,
  onClose,
  onConverted,
}: {
  registration: Registration;
  institutionId: string;
  onClose: () => void;
  onConverted: () => void;
}) {
  const { user, displayName } = useAuth();
  const [checked, setChecked] = useState<Record<StepKind, boolean>>({
    student: !registration.convertedStudentUid,
    mother: !!registration.mother && !registration.convertedMotherUid,
    father: !!registration.father && !registration.convertedFatherUid,
  });
  const [started, setStarted] = useState(false);
  const [uids, setUids] = useState<Partial<Record<StepKind, string>>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Kept so "Retry" can re-attempt the exact same step without going back
  // through AdminCreateUserForm — the Firebase Auth account for this step
  // was already created successfully by the time persistStep runs; retrying
  // AdminCreateUserForm itself would just fail with "email already in use."
  const [lastAttempt, setLastAttempt] = useState<{
    kind: StepKind;
    uid: string;
    nextUids: Partial<Record<StepKind, string>>;
  } | null>(null);

  const steps: StepKind[] = (["student", "mother", "father"] as StepKind[]).filter((k) => checked[k]);
  const currentStep = steps[stepIndex];
  const studentName = `${registration.student.firstName} ${registration.student.lastName}`;

  // Persists each step immediately, rather than batching every checked step
  // into a single write at the very end — so that cancelling partway through
  // a multi-account conversion doesn't strand an already-created Firebase
  // Auth/Firestore account with no record of it on the registration
  // document (which would otherwise make the checklist re-offer "Create
  // student account" on reopen, and fail with "email already in use").
  //
  // Every write here is safe to retry from scratch: setDoc uses a
  // deterministic doc ID (overwrite, not append), updateDoc sets fixed
  // values from closure state (not incrementing anything), and the audit
  // log write is last, so it's only ever attempted once the writes before
  // it have actually succeeded.
  const persistStep = async (kind: StepKind, uid: string, nextUids: Partial<Record<StepKind, string>>) => {
    const studentUid = kind === "student" ? uid : (nextUids.student ?? registration.convertedStudentUid);

    if (kind !== "student" && studentUid) {
      await setDoc(doc(db, "student_parents", `${uid}_${studentUid}`), {
        parentId: uid,
        studentId: studentUid,
        institutionId,
        relationship: kind,
        createdAt: serverTimestamp(),
        createdBy: user?.uid ?? "",
      });
    }

    await updateDoc(institutionDoc(institutionId, "enrollmentRegistrations", registration.id), {
      [CONVERTED_FIELD[kind]]: uid,
      ...(studentUid && { status: "converted" }),
    });

    if (user) {
      const detail =
        kind === "student"
          ? "Created student account during registration conversion"
          : `Created ${kind}'s account during registration conversion${studentUid ? " and linked as parent" : ""}`;
      await logRegistrationAudit(institutionId, registration.id, studentName, detail, user.uid, displayName ?? "");
    }
  };

  const attemptStep = async (kind: StepKind, uid: string, nextUids: Partial<Record<StepKind, string>>) => {
    setSaving(true);
    setSaveError(null);
    try {
      await persistStep(kind, uid, nextUids);
      if (stepIndex + 1 < steps.length) {
        setStepIndex((i) => i + 1);
      } else {
        onConverted();
      }
    } catch {
      setSaveError(
        "Something went wrong saving this step. The account was already created — retrying will not create it again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStepSuccess = (kind: StepKind) => (_name: string, uid: string) => {
    const nextUids = { ...uids, [kind]: uid };
    setUids(nextUids);
    setLastAttempt({ kind, uid, nextUids });
    void attemptStep(kind, uid, nextUids);
  };

  const retry = () => {
    if (!lastAttempt) return;
    void attemptStep(lastAttempt.kind, lastAttempt.uid, lastAttempt.nextUids);
  };

  if (!started) {
    return (
      <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-md flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Convert to accounts</h2>
          <p className="text-sm text-gray-500">Choose which accounts to create for this registration.</p>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={checked.student}
              disabled={!!registration.convertedStudentUid}
              onChange={(e) => setChecked((c) => ({ ...c, student: e.target.checked }))}
              className="accent-sky-500"
            />
            <span className="text-sm">
              Create student account
              {registration.convertedStudentUid && <span className="text-gray-400"> (already created)</span>}
            </span>
          </label>
          {registration.mother && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checked.mother}
                disabled={!!registration.convertedMotherUid}
                onChange={(e) => setChecked((c) => ({ ...c, mother: e.target.checked }))}
                className="accent-sky-500"
              />
              <span className="text-sm">
                Create mother's account
                {registration.convertedMotherUid && <span className="text-gray-400"> (already created)</span>}
              </span>
            </label>
          )}
          {registration.father && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checked.father}
                disabled={!!registration.convertedFatherUid}
                onChange={(e) => setChecked((c) => ({ ...c, father: e.target.checked }))}
                className="accent-sky-500"
              />
              <span className="text-sm">
                Create father's account
                {registration.convertedFatherUid && <span className="text-gray-400"> (already created)</span>}
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm">
              Cancel
            </button>
            <button
              onClick={() => setStarted(true)}
              disabled={steps.length === 0}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (saveError) {
    return (
      <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-md flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-red-600">Couldn't save this step</h2>
          <p className="text-sm text-gray-500">{saveError}</p>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm">
              Close
            </button>
            <button onClick={retry} className="px-4 py-2 rounded-md bg-sky-600 text-white text-sm">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (saving || !currentStep) {
    return (
      <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-md text-sm text-gray-500">Saving…</div>
      </div>
    );
  }

  const guardianData = currentStep === "mother" ? registration.mother : currentStep === "father" ? registration.father : null;

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-md w-full max-w-3xl my-8">
        <div className="px-6 pt-6 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Step {stepIndex + 1} of {steps.length}: create {currentStep} account
          </h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </div>
        <AdminCreateUserForm
          initialInstitutionId={institutionId}
          lockedRole={currentStep === "student" ? "student" : "parent"}
          initialValues={
            currentStep === "student"
              ? {
                  firstName: registration.student.firstName,
                  lastName: registration.student.lastName,
                  dateOfBirth: registration.student.dateOfBirth,
                  gender: registration.student.gender,
                }
              : guardianData
                ? {
                    firstName: guardianData.firstName,
                    lastName: guardianData.lastName,
                    email: guardianData.email,
                    phone: guardianData.contact,
                  }
                : undefined
          }
          onSuccess={handleStepSuccess(currentStep)}
        />
      </div>
    </div>
  );
}
