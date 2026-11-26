import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { submitAssignmentWork } from "@/lib/submissions";
import { gradeSubmission } from "@/lib/grading";
import { convertAssignmentToGradebook } from "@/lib/gradebookConversion";
import { DocumentValidationError } from "@/lib/documentUpload";
import AssignmentAttachment from "@/components/AssignmentAttachment";
import {
  assignmentTypeLabel,
  canViewRoster,
  effectivePicks,
  gradeToSave,
  gradingFormFor,
  type RosterStudent,
} from "@/lib/assignmentDetailLogic";
import type { RubricPicks } from "@/lib/rubricScoring";
import { fetchConversionColumns } from "@/lib/assignmentDetailFetch";
import { useAssignmentRecord } from "@/hooks/useAssignmentRecord";
import { useAssignmentParticipants } from "@/hooks/useAssignmentParticipants";
import { AssignmentInfoCard } from "./AssignmentInfoCard";
import { RubricSection } from "./RubricSection";
import { RosterTable } from "./RosterTable";
import { StudentSubmissionSection } from "./StudentSubmissionSection";
import { ParentSubmissionSection } from "./ParentSubmissionSection";
import { GradeDialog } from "./GradeDialog";
import { ConversionDialog } from "./ConversionDialog";

// list/assignments/[id]/index.tsx — ASSIGNMENTS_FEATURE_SPEC.md §13
// Implementation Order steps 4-6, 8. Description/attachment/rubric render
// and the class roster shipped in step 4 as a shell; step 5 wired up the
// real submissions/attempts/submissionTombstones collections behind them
// (student upload/resubmit, per-student submission status, a parent's
// read-only view). Step 6 added the teacher/admin grading action itself
// (§4.3) via src/lib/grading.ts's gradeSubmission() — in 'gradebook' mode,
// the max score is locked to the linked column's own maxScore (mirroring
// performSave()'s own convention of never using a per-result value), not
// freely editable the way it is in 'standalone' mode. Step 8 adds the
// one-way standalone -> gradebook conversion action (§4.5) via
// src/lib/gradebookConversion.ts, gated the same way as the roster/grading
// actions above it (canEditAssignment(role) — the read rule already scopes
// which assignments a regular_teacher/senior_teacher can even reach this
// page for, so no extra own-teacher/in-department check is needed client-side).
const AssignmentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { role, institutionId, user, displayName } = useAuth();

  const {
    assignment,
    assignmentLoading,
    denied,
    rubric,
    gradebookColumnMaxScore,
  } = useAssignmentRecord(id);
  const {
    roster,
    rosterLoading,
    submissionsByStudent,
    mySubmission,
    childId,
    childSubmission,
  } = useAssignmentParticipants(id, assignment);

  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [gradingTarget, setGradingTarget] = useState<RosterStudent | null>(
    null,
  );
  const [gradeScore, setGradeScore] = useState("");
  const [gradeMaxScore, setGradeMaxScore] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");
  // null until the teacher picks: until then the dialog shows the saved scores (effectivePicks).
  const [rubricPicks, setRubricPicks] = useState<RubricPicks | null>(null);
  const criteria = rubric?.criteria ?? [];
  const [gradingLoading, setGradingLoading] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);

  // Gradebook conversion (§4.5, Implementation Order step 8) — standalone ->
  // gradebook, one-way, retroactive. Column list fetched fresh each time the
  // modal opens, same shape AssignmentForm.tsx's own picker uses.
  const [conversionOpen, setConversionOpen] = useState(false);
  const [conversionColumns, setConversionColumns] = useState<
    { id: string; label: string; maxScore: number; order: number }[]
  >([]);
  const [conversionColumnsLoading, setConversionColumnsLoading] =
    useState(false);
  const [conversionColumnId, setConversionColumnId] = useState("");
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (
      !file ||
      !assignment ||
      !institutionId ||
      institutionId === "*" ||
      !user ||
      !id
    )
      return;
    if (!assignment.dueDateTimestamp) {
      setUploadError(
        "This assignment is missing setup data required for submission — contact your teacher.",
      );
      return;
    }
    setUploadError(null);
    setUploadLoading(true);
    try {
      await submitAssignmentWork({
        institutionId,
        assignmentId: id,
        studentId: user.uid,
        studentName: displayName || user.uid,
        classId: assignment.classId,
        assignmentDueDate: assignment.dueDate,
        dueDateTimestamp: assignment.dueDateTimestamp,
        file,
      });
    } catch (err) {
      setUploadError(
        err instanceof DocumentValidationError
          ? err.message
          : "Could not submit this file. Please try again.",
      );
    } finally {
      setUploadLoading(false);
    }
  };

  const openGradingModal = (student: RosterStudent) => {
    const submission = submissionsByStudent[student.uid];
    const form = gradingFormFor(
      submission,
      assignment?.gradingMode,
      gradebookColumnMaxScore,
    );
    setGradingError(null);
    setGradeScore(form.score);
    setGradeMaxScore(form.maxScore);
    setGradeFeedback(form.feedback);
    setRubricPicks(null);
    setGradingTarget(student);
  };

  // A new pick clears an error about the last picks, such as a criterion still to score.
  const pickRubric = (picks: RubricPicks) => {
    setRubricPicks(picks);
    setGradingError(null);
  };

  const handleGradeSubmit = async () => {
    if (
      !gradingTarget ||
      !assignment ||
      !institutionId ||
      institutionId === "*" ||
      !user
    )
      return;
    const checked = gradeToSave(
      gradeScore,
      gradeMaxScore,
      criteria,
      effectivePicks(rubricPicks, criteria, submissionsByStudent[gradingTarget.uid]),
    );
    if ("error" in checked) {
      setGradingError(checked.error);
      return;
    }
    const { score, maxScore, rubricScoring } = checked;
    setGradingError(null);
    setGradingLoading(true);
    try {
      await gradeSubmission({
        institutionId,
        assignment,
        studentId: gradingTarget.uid,
        studentName: gradingTarget.name,
        score,
        maxScore,
        feedback: gradeFeedback.trim() || undefined,
        graderId: user.uid,
        graderName: displayName || user.uid,
        rubric,
        rubricScoring,
      });
      setGradingTarget(null);
    } catch (err) {
      setGradingError(
        err instanceof Error
          ? err.message
          : "Could not save this grade. Please try again.",
      );
    } finally {
      setGradingLoading(false);
    }
  };

  const openConversionModal = async () => {
    if (!assignment || !institutionId || institutionId === "*") return;
    setConversionError(null);
    setConversionColumnId("");
    setConversionOpen(true);
    setConversionColumnsLoading(true);
    try {
      setConversionColumns(
        await fetchConversionColumns(institutionId, assignment),
      );
    } catch {
      setConversionColumns([]);
    } finally {
      setConversionColumnsLoading(false);
    }
  };

  const handleConversionSubmit = async () => {
    if (
      !assignment ||
      !institutionId ||
      institutionId === "*" ||
      !conversionColumnId
    )
      return;
    setConversionError(null);
    setConversionLoading(true);
    try {
      await convertAssignmentToGradebook({
        institutionId,
        assignment,
        gradebookColumnId: conversionColumnId,
      });
      setConversionOpen(false);
    } catch (err) {
      setConversionError(
        err instanceof Error
          ? err.message
          : "Could not convert this assignment. Please try again.",
      );
    } finally {
      setConversionLoading(false);
    }
  };

  if (assignmentLoading) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
    );
  }

  if (!assignment || denied) {
    return (
      <div className="p-8 text-center flex flex-col items-center gap-3">
        <p className="text-gray-500">Assignment not found.</p>
        <Link
          to="/dashboard/list/assignments"
          className="text-sky-600 underline text-sm"
        >
          ← Back to Assignments
        </Link>
      </div>
    );
  }

  const typeLabel = assignmentTypeLabel(assignment);

  return (
    <div className="p-4 flex flex-col gap-4">
      <Link
        to="/dashboard/list/assignments"
        className="text-sm text-sky-600 hover:underline self-start"
      >
        ← Back to Assignments
      </Link>

      {/* Assignment info card */}
      <AssignmentInfoCard
        assignment={assignment}
        typeLabel={typeLabel}
        role={role}
        openConversionModal={openConversionModal}
      />

      {/* Attachment */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Attachment</h2>
        <AssignmentAttachment
          assignment={assignment}
          institutionId={institutionId}
        />
      </div>

      {/* Rubric */}
      <RubricSection
        assignment={assignment}
        rubric={rubric}
        role={role}
        submission={role === "parent" ? childSubmission : mySubmission}
      />

      {/* Role-dependent area */}
      {canViewRoster(role) ? (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            Class Roster ({roster.length})
          </h2>
          <RosterTable
            roster={roster}
            rosterLoading={rosterLoading}
            submissionsByStudent={submissionsByStudent}
            role={role}
            openGradingModal={openGradingModal}
          />
        </div>
      ) : role === "student" ? (
        <StudentSubmissionSection
          mySubmission={mySubmission}
          handleUpload={handleUpload}
          uploadLoading={uploadLoading}
          uploadError={uploadError}
        />
      ) : role === "parent" ? (
        <ParentSubmissionSection
          childId={childId}
          childSubmission={childSubmission}
        />
      ) : null}

      {gradingTarget && (
        <GradeDialog
          assignment={assignment}
          gradingTarget={gradingTarget}
          submissionsByStudent={submissionsByStudent}
          gradeScore={gradeScore}
          setGradeScore={setGradeScore}
          gradeMaxScore={gradeMaxScore}
          setGradeMaxScore={setGradeMaxScore}
          gradeFeedback={gradeFeedback}
          setGradeFeedback={setGradeFeedback}
          criteria={criteria}
          rubricPicks={effectivePicks(
            rubricPicks,
            criteria,
            submissionsByStudent[gradingTarget.uid],
          )}
          setRubricPicks={pickRubric}
          gradebookColumnMaxScore={gradebookColumnMaxScore}
          gradingError={gradingError}
          gradingLoading={gradingLoading}
          setGradingTarget={setGradingTarget}
          handleGradeSubmit={handleGradeSubmit}
        />
      )}

      {conversionOpen && (
        <ConversionDialog
          conversionColumnsLoading={conversionColumnsLoading}
          conversionColumnId={conversionColumnId}
          setConversionColumnId={setConversionColumnId}
          conversionColumns={conversionColumns}
          conversionError={conversionError}
          conversionLoading={conversionLoading}
          setConversionOpen={setConversionOpen}
          handleConversionSubmit={handleConversionSubmit}
        />
      )}
    </div>
  );
};

export default AssignmentDetailPage;
