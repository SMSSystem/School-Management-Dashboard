import type { EnrollmentRegistrationDocument } from "@/lib/firebase";

type Registration = EnrollmentRegistrationDocument & { id: string };

// STUB (Phase 8 of STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md): the
// real checklist + AdminCreateUserForm stepper + student_parents linking
// lands in Phase 10. This stub exists only so the "Convert to accounts"
// button on the review page has somewhere to go in the meantime, rather
// than being hidden or left silently broken.
export default function ConvertToAccountsPanel({
  onClose,
}: {
  registration: Registration;
  institutionId: string;
  onClose: () => void;
  onConverted: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-md flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Convert to accounts</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Account conversion isn't wired up yet — this is still on the way.
        </p>
        <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
