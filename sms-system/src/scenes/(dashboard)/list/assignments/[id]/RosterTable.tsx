import Table from "@/components/Table";
import { StatusBadge } from "./StatusBadge";
import { canEditAssignment, type RosterStudent, type Submission } from "@/lib/assignmentDetailLogic";

// The class roster: each student's name, id and submission status, with Grade or Re-grade for editors and
// the saved grade for a spectator.
export function RosterTable({
  roster,
  rosterLoading,
  submissionsByStudent,
  role,
  openGradingModal,
}: {
  roster: RosterStudent[];
  rosterLoading: boolean;
  submissionsByStudent: Record<string, Submission>;
  role: string | null;
  openGradingModal: (student: RosterStudent) => void;
}) {
  const renderRosterRow = (item: RosterStudent) => {
    const submission = submissionsByStudent[item.uid];
    return (
      <tr
        key={item.uid}
        className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm"
      >
        <td className="p-4">{item.name}</td>
        <td className="hidden md:table-cell">{item.institutionStudentId ?? "—"}</td>
        <td>{submission ? <StatusBadge status={submission.status} /> : <span className="text-xs text-gray-400">Not submitted</span>}</td>
        <td>
          {submission && canEditAssignment(role) && (
            <button
              type="button"
              onClick={() => openGradingModal(item)}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {submission.status === "graded" ? "Re-grade" : "Grade"}
            </button>
          )}
          {submission && !canEditAssignment(role) && submission.status === "graded" && (
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {submission.grade} / {submission.maxGrade}
            </span>
          )}
        </td>
      </tr>
    );
  };

  const rosterColumns = [
    { header: "Student Name", accessor: "name" },
    { header: "Student ID", accessor: "institutionStudentId", className: "hidden md:table-cell" },
    { header: "Submission", accessor: "status" },
    { header: canEditAssignment(role) ? "Actions" : "Grade", accessor: "action" },
  ];

  return <Table columns={rosterColumns} renderRow={renderRosterRow} data={roster} loading={rosterLoading} />;
}
