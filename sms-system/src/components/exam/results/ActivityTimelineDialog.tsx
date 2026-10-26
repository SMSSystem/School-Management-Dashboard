import DialogShell from "@/components/DialogShell";
import { PRIMARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { ACTIVITY_NOTES, describeTimeline, integrityCellText } from "@/lib/examActivityReport";
import type { ExamIntegritySummary } from "@/types/exams";

// When a student's exam page was left (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.4): the figures and
// the timeline the teacher can open from the results table. Read only, for anyone who can see the results. It says what a
// browser can and cannot tell, because a Review mark is a reason to look and never a finding.
export default function ActivityTimelineDialog({
  studentName,
  summary,
  onClose,
}: {
  studentName: string;
  summary: ExamIntegritySummary;
  onClose: () => void;
}) {
  const lines = describeTimeline(summary.timeline);
  // The kept timeline holds the longest spells when there were more than it can hold.
  const partial = summary.leaves + summary.acts > lines.length;
  return (
    <DialogShell title={`When ${studentName} left the exam page`} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm text-gray-700 dark:text-gray-300">
        <p className="font-medium text-gray-900 dark:text-gray-100">
          {integrityCellText(summary)}
          {summary.acts > 0 && `; ${summary.acts} other thing${summary.acts === 1 ? "" : "s"} recorded (copy, print and the like)`}
        </p>
        {summary.review && (
          <p className="rounded-md bg-amber-50 p-2 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            Review: more than the usual for an exam of this length. Worth a look; not a finding.
          </p>
        )}

        {lines.length === 0 ? (
          <p>No timeline was kept for this student.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                <th className="pb-1 pr-3 font-medium">Into the exam</th>
                <th className="pb-1 pr-3 font-medium">What</th>
                <th className="pb-1 font-medium">Away for</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={`${l.when}-${i}`} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="py-1 pr-3 tabular-nums">{l.when}</td>
                  <td className="py-1 pr-3">{l.what}</td>
                  <td className="py-1">{l.away}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {partial && lines.length > 0 && <p className="text-xs">The timeline holds the longest spells away; there were more leaves than are listed.</p>}

        <ul className="list-disc pl-5 text-xs text-gray-500 dark:text-gray-400">
          {ACTIVITY_NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={PRIMARY_BUTTON_CLS} style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}>
            Close
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
