import { readClassSubjects, takesSubject } from "@/lib/studentClasses";
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AssignmentDocument, Role, RubricDocument, SubmissionDocument } from "@/lib/firebase";
import { hasStaffView } from "@/lib/roleCapabilities";
import { ASSIGNMENT_VALUE_TYPE_LABELS } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import { useLinkedStudentIds } from "@/lib/useLinkedStudentIds";
import { submitAssignmentWork } from "@/lib/submissions";
import { gradeSubmission } from "@/lib/grading";
import { convertAssignmentToGradebook } from "@/lib/gradebookConversion";
import { DocumentValidationError } from "@/lib/documentUpload";
import FormModal from "@/components/FormModal";
import AssignmentAttachment from "@/components/AssignmentAttachment";
import Table from "@/components/Table";
import { institutionDoc, institutionSubcollection, institutionSubdoc } from "@/lib/paths";

type Assignment = AssignmentDocument & { id: string };
type Rubric = RubricDocument & { id: string };
type Submission = SubmissionDocument & { id: string };
type RosterStudent = { uid: string; name: string; institutionStudentId?: string };

const rubricColumns = [
  { header: "Criterion", accessor: "name" },
  { header: "Max Points", accessor: "maxPoints", className: "hidden md:table-cell" },
  { header: "Performance Levels", accessor: "levels" },
];

const canEditAssignment = (role: string | null) =>
  role === "institution_admin" ||
  role === "super_admin" ||
  role === "regular_teacher" ||
  role === "senior_teacher";

// Who may SEE the class roster and every student's submission state: the editors
// above plus a spectator, which reads the same data but cannot edit, convert or
// grade (canEditAssignment stays the gate for those).
const canViewRoster = (role: Role | null) => hasStaffView(role);

const STATUS_BADGE_CLS: Record<string, string> = {
  submitted: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  late: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  graded: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  late: "Late",
  graded: "Graded",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE_CLS[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

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

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  // Distinguishes "doesn't exist" from "exists, but firestore.rules denies
  // this reader" — onSnapshot's error callback fires for the latter (a
  // get() on one specific denied document errors, unlike a list query that
  // just returns nothing). Both render the same not-found-style message:
  // confirming *which* case it is would leak whether the document exists
  // to someone who isn't allowed to see it.
  const [denied, setDenied] = useState(false);

  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [submissionsByStudent, setSubmissionsByStudent] = useState<Record<string, Submission>>({});

  const [mySubmission, setMySubmission] = useState<Submission | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { linkedStudentIds } = useLinkedStudentIds();
  const [childId, setChildId] = useState<string | null>(null);
  const [childSubmission, setChildSubmission] = useState<Submission | null>(null);

  // gradingMode === 'gradebook' only — the linked column's own maxScore,
  // locked in the grading form rather than left freely editable (§4.3
  // mirrors performSave(), which always writes maxScore: effectiveCol.maxScore,
  // never a per-result value).
  const [gradebookColumnMaxScore, setGradebookColumnMaxScore] = useState<number | null>(null);
  const [gradingTarget, setGradingTarget] = useState<RosterStudent | null>(null);
  const [gradeScore, setGradeScore] = useState("");
  const [gradeMaxScore, setGradeMaxScore] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");
  const [gradingLoading, setGradingLoading] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);

  // Gradebook conversion (§4.5, Implementation Order step 8) — standalone ->
  // gradebook, one-way, retroactive. Column list fetched fresh each time the
  // modal opens, same shape AssignmentForm.tsx's own picker uses.
  const [conversionOpen, setConversionOpen] = useState(false);
  const [conversionColumns, setConversionColumns] = useState<
    { id: string; label: string; maxScore: number; order: number }[]
  >([]);
  const [conversionColumnsLoading, setConversionColumnsLoading] = useState(false);
  const [conversionColumnId, setConversionColumnId] = useState("");
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !institutionId || institutionId === "*") return;
    setAssignmentLoading(true);
    setDenied(false);
    return onSnapshot(
      institutionDoc(institutionId, "assignments", id),
      (snap) => {
        setAssignmentLoading(false);
        setAssignment(snap.exists() ? ({ id: snap.id, ...snap.data() } as Assignment) : null);
      },
      () => {
        setAssignmentLoading(false);
        setDenied(true);
      },
    );
  }, [id, institutionId]);

  useEffect(() => {
    if (!institutionId || institutionId === "*" || !assignment?.rubricId) {
      setRubric(null);
      return;
    }
    return onSnapshot(
      institutionDoc(institutionId, "rubrics", assignment.rubricId),
      (snap) => setRubric(snap.exists() ? ({ id: snap.id, ...snap.data() } as Rubric) : null),
      () => setRubric(null),
    );
  }, [institutionId, assignment?.rubricId]);

  useEffect(() => {
    if (
      !institutionId ||
      institutionId === "*" ||
      assignment?.gradingMode !== "gradebook" ||
      !assignment.gradebookColumnId
    ) {
      setGradebookColumnMaxScore(null);
      return;
    }
    const gradebookId = `${assignment.classId}_${assignment.subjectId}_${assignment.termId}`;
    getDoc(
      institutionSubdoc(institutionId, "gradebooks", gradebookId, "columns", assignment.gradebookColumnId),
    ).then(
      (snap) => setGradebookColumnMaxScore((snap.data()?.maxScore as number | undefined) ?? null),
      onLoadError("the gradebook column", () => setGradebookColumnMaxScore(null)),
    );
  }, [institutionId, assignment?.gradingMode, assignment?.gradebookColumnId, assignment?.classId, assignment?.subjectId, assignment?.termId]);

  // Class roster — teacher/admin roles only, so a student/parent viewer
  // never triggers a query their own read scope wouldn't need anyway.
  useEffect(() => {
    if (!institutionId || institutionId === "*" || !assignment?.classId || !canViewRoster(role)) {
      setRoster([]);
      return;
    }
    setRosterLoading(true);
    return onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "student"),
        // everyone in the class, home or additional (lib/studentClasses.ts)
        where("classIds", "array-contains", assignment.classId),
      ),
      (snap) => {
        setRoster(
          snap.docs
            .filter((d) =>
              takesSubject(
                { classId: d.data().classId, classIds: d.data().classIds, classSubjects: readClassSubjects(d.data().classSubjects) },
                assignment.classId,
                assignment.subjectId,
              ),
            )
            .map((d) => ({
              uid: d.id,
              name: (d.data().name as string | undefined) ?? d.id,
              institutionStudentId: d.data().institutionStudentId as string | undefined,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setRosterLoading(false);
      },
      () => setRosterLoading(false),
    );
  }, [institutionId, assignment?.classId, assignment?.subjectId, role]);

  // Every student's current submission state for this assignment — §6.2's
  // "unfiltered, path-scoped" teacher grading view (small collection,
  // bounded by class size, no composite index needed).
  useEffect(() => {
    if (!institutionId || institutionId === "*" || !id || !canViewRoster(role)) {
      setSubmissionsByStudent({});
      return;
    }
    return onSnapshot(
      institutionSubcollection(institutionId, "assignments", id, "submissions"),
      (snap) => {
        const map: Record<string, Submission> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() } as Submission;
        });
        setSubmissionsByStudent(map);
      },
      () => setSubmissionsByStudent({}),
    );
  }, [institutionId, id, role]);

  // Student's own submission — a direct single-document read (§6.2), not a query.
  useEffect(() => {
    if (!institutionId || institutionId === "*" || !id || role !== "student" || !user) {
      setMySubmission(null);
      return;
    }
    return onSnapshot(
      institutionSubdoc(institutionId, "assignments", id, "submissions", user.uid),
      (snap) => setMySubmission(snap.exists() ? ({ id: snap.id, ...snap.data() } as Submission) : null),
      () => setMySubmission(null),
    );
  }, [institutionId, id, role, user]);

  // Parent: resolve which linked child is actually in this assignment's
  // class (assignments are classId-keyed, not studentId-keyed — same
  // resolution list/assignments/index.tsx's own parent query already does).
  useEffect(() => {
    if (role !== "parent" || !assignment?.classId || linkedStudentIds.length === 0) {
      setChildId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      for (const sid of linkedStudentIds) {
        const snap = await getDoc(doc(db, "users", sid));
        if (snap.data()?.classId === assignment.classId) {
          if (!cancelled) setChildId(sid);
          return;
        }
      }
      if (!cancelled) setChildId(null);
    })().catch((err) => {
      if (!cancelled) onLoadError("your child's class", () => setChildId(null))(err);
    });
    return () => {
      cancelled = true;
    };
  }, [role, assignment?.classId, linkedStudentIds]);

  useEffect(() => {
    if (!institutionId || institutionId === "*" || !id || role !== "parent" || !childId) {
      setChildSubmission(null);
      return;
    }
    return onSnapshot(
      institutionSubdoc(institutionId, "assignments", id, "submissions", childId),
      (snap) => setChildSubmission(snap.exists() ? ({ id: snap.id, ...snap.data() } as Submission) : null),
      () => setChildSubmission(null),
    );
  }, [institutionId, id, role, childId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !assignment || !institutionId || institutionId === "*" || !user || !id) return;
    if (!assignment.dueDateTimestamp) {
      setUploadError("This assignment is missing setup data required for submission — contact your teacher.");
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
        err instanceof DocumentValidationError ? err.message : "Could not submit this file. Please try again.",
      );
    } finally {
      setUploadLoading(false);
    }
  };

  const openGradingModal = (student: RosterStudent) => {
    const submission = submissionsByStudent[student.uid];
    setGradingError(null);
    setGradeScore(submission?.grade !== undefined ? String(submission.grade) : "");
    setGradeMaxScore(
      assignment?.gradingMode === "gradebook"
        ? String(gradebookColumnMaxScore ?? "")
        : submission?.maxGrade !== undefined
          ? String(submission.maxGrade)
          : "",
    );
    setGradeFeedback(submission?.feedback ?? "");
    setGradingTarget(student);
  };

  const handleGradeSubmit = async () => {
    if (!gradingTarget || !assignment || !institutionId || institutionId === "*" || !user) return;
    const score = Number(gradeScore);
    const maxScore = Number(gradeMaxScore);
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
      setGradingError("Enter a valid score and max score.");
      return;
    }
    if (score > maxScore) {
      setGradingError("Score cannot exceed the max score.");
      return;
    }
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
      });
      setGradingTarget(null);
    } catch (err) {
      setGradingError(err instanceof Error ? err.message : "Could not save this grade. Please try again.");
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
    const gradebookId = `${assignment.classId}_${assignment.subjectId}_${assignment.termId}`;
    try {
      const snap = await getDocs(institutionSubcollection(institutionId, "gradebooks", gradebookId, "columns"));
      setConversionColumns(
        snap.docs
          .map((d) => ({
            id: d.id,
            label: (d.data().label as string | undefined) ?? "Untitled column",
            maxScore: (d.data().maxScore as number | undefined) ?? 0,
            order: (d.data().order as number | undefined) ?? 0,
          }))
          .sort((a, b) => a.order - b.order),
      );
    } catch {
      setConversionColumns([]);
    } finally {
      setConversionColumnsLoading(false);
    }
  };

  const handleConversionSubmit = async () => {
    if (!assignment || !institutionId || institutionId === "*" || !conversionColumnId) return;
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
        err instanceof Error ? err.message : "Could not convert this assignment. Please try again.",
      );
    } finally {
      setConversionLoading(false);
    }
  };

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

  const renderRubricRow = (criterion: RubricDocument["criteria"][number]) => (
    <tr
      key={criterion.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm align-top"
    >
      <td className="p-4 font-medium">{criterion.name}</td>
      <td className="hidden md:table-cell">{criterion.maxPoints}</td>
      <td className="py-2">
        <div className="flex flex-col gap-1">
          {criterion.levels.map((lvl, i) => (
            <div key={i} className="text-xs">
              <span className="font-medium">{lvl.label}</span> ({lvl.points} pts)
              {lvl.description ? <span className="text-gray-400"> — {lvl.description}</span> : null}
            </div>
          ))}
        </div>
      </td>
    </tr>
  );

  if (assignmentLoading) {
    return <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>;
  }

  if (!assignment || denied) {
    return (
      <div className="p-8 text-center flex flex-col items-center gap-3">
        <p className="text-gray-500">Assignment not found.</p>
        <Link to="/dashboard/list/assignments" className="text-sky-600 underline text-sm">
          ← Back to Assignments
        </Link>
      </div>
    );
  }

  const typeLabel = assignment.type
    ? assignment.type === "other"
      ? (assignment.otherTypeLabel ?? "Other")
      : ASSIGNMENT_VALUE_TYPE_LABELS[assignment.type]
    : "—"; // legacy assignment, predates the type field

  return (
    <div className="p-4 flex flex-col gap-4">
      <Link
        to="/dashboard/list/assignments"
        className="text-sm text-sky-600 hover:underline self-start"
      >
        ← Back to Assignments
      </Link>

      {/* Assignment info card */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-md flex flex-col gap-3">
        <div className="flex items-start gap-4">
          <div className="flex-1 flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">
              {assignment.title ?? `${assignment.subjectName} — ${assignment.className}`}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{assignment.subjectName}</span>
              <span>·</span>
              <span>{assignment.className}</span>
              <span>·</span>
              <span>{assignment.teacherName}</span>
              <span>·</span>
              <span>
                Due{" "}
                {assignment.dueDate
                  ? new Date(assignment.dueDate + "T00:00:00").toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                {typeLabel}
              </span>
              {assignment.status && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    assignment.status === "published"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {assignment.status === "published" ? "Published" : "Draft"}
                </span>
              )}
            </div>
          </div>
          {canEditAssignment(role) && (
            <div className="flex items-center gap-2">
              {assignment.gradingMode === "standalone" && (
                <button
                  type="button"
                  onClick={openConversionModal}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Convert to Gradebook
                </button>
              )}
              <FormModal
                table="assignment"
                type="update"
                data={assignment as unknown as Record<string, string | number | readonly string[] | undefined>}
              />
            </div>
          )}
        </div>

        {assignment.description ? (
          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
            {assignment.description}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">No description.</p>
        )}
      </div>

      {/* Attachment */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Attachment</h2>
        <AssignmentAttachment assignment={assignment} institutionId={institutionId} />
      </div>

      {/* Rubric */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Rubric</h2>
        {!assignment.rubricId ? (
          <p className="text-sm text-gray-400 italic">No rubric attached.</p>
        ) : !rubric ? (
          <p className="text-sm text-gray-400 italic">
            Rubric not found — it may have been deleted since this assignment was created.
          </p>
        ) : (
          <>
            <p className="text-sm font-medium">{rubric.title}</p>
            {rubric.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{rubric.description}</p>
            )}
            <Table columns={rubricColumns} renderRow={renderRubricRow} data={rubric.criteria} />
          </>
        )}
      </div>

      {/* Role-dependent area */}
      {canViewRoster(role) ? (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Class Roster ({roster.length})</h2>
          <Table columns={rosterColumns} renderRow={renderRosterRow} data={roster} loading={rosterLoading} />
        </div>
      ) : role === "student" ? (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Your Submission</h2>
          {mySubmission ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-sm">{mySubmission.fileName}</span>
                  <span className="text-xs text-gray-400">
                    Attempt {mySubmission.currentAttemptNumber} · {Math.round(mySubmission.fileSize / 1024)} KB
                  </span>
                </div>
                <StatusBadge status={mySubmission.status} />
              </div>
              {mySubmission.status === "graded" && (
                <div className="text-sm rounded-md bg-gray-50 dark:bg-gray-900 p-3">
                  <p className="font-medium">
                    Grade: {mySubmission.grade} / {mySubmission.maxGrade}
                  </p>
                  {mySubmission.feedback && (
                    <p className="text-gray-600 dark:text-gray-300 mt-1">{mySubmission.feedback}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">You haven't submitted anything yet.</p>
          )}

          <label className="cursor-pointer self-start text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
            {mySubmission ? "Resubmit" : "Submit work"}
            <input
              type="file"
              accept=".pdf,.docx,.pptx,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleUpload}
              disabled={uploadLoading}
            />
          </label>
          {uploadLoading && <p className="text-xs text-gray-400">Submitting…</p>}
          {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
        </div>
      ) : role === "parent" ? (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Your Child's Submission</h2>
          {!childId ? (
            <p className="text-sm text-gray-400 italic">
              No linked child found in this assignment's class.
            </p>
          ) : childSubmission ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-sm">{childSubmission.fileName}</span>
                  <span className="text-xs text-gray-400">
                    {Math.round(childSubmission.fileSize / 1024)} KB
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={childSubmission.status} />
                  <a
                    href={childSubmission.fileDataUrl}
                    download={childSubmission.fileName}
                    className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Download
                  </a>
                </div>
              </div>
              {childSubmission.status === "graded" && (
                <div className="text-sm rounded-md bg-gray-50 dark:bg-gray-900 p-3">
                  <p className="font-medium">
                    Grade: {childSubmission.grade} / {childSubmission.maxGrade}
                  </p>
                  {childSubmission.feedback && (
                    <p className="text-gray-600 dark:text-gray-300 mt-1">{childSubmission.feedback}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">Your child hasn't submitted anything yet.</p>
          )}
        </div>
      ) : null}

      {gradingTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-md flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Grade — {gradingTarget.name}</h2>

            {submissionsByStudent[gradingTarget.uid] && (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span>{submissionsByStudent[gradingTarget.uid].fileName}</span>
                <a
                  href={submissionsByStudent[gradingTarget.uid].fileDataUrl}
                  download={submissionsByStudent[gradingTarget.uid].fileName}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Download
                </a>
              </div>
            )}

            <div className="flex gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-xs text-gray-500 dark:text-gray-300">Score</label>
                <input
                  type="number"
                  min={0}
                  value={gradeScore}
                  onChange={(e) => setGradeScore(e.target.value)}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-xs text-gray-500 dark:text-gray-300">Max Score</label>
                <input
                  type="number"
                  min={1}
                  value={gradeMaxScore}
                  onChange={(e) => setGradeMaxScore(e.target.value)}
                  disabled={assignment.gradingMode === "gradebook"}
                  className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 disabled:opacity-60"
                />
              </div>
            </div>
            {assignment.gradingMode === "gradebook" && (
              <p className="text-xs text-gray-400 -mt-2">
                Max score is fixed to the linked Gradebook column.
              </p>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-300">Feedback (optional)</label>
              <textarea
                value={gradeFeedback}
                onChange={(e) => setGradeFeedback(e.target.value)}
                rows={3}
                className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            {gradingError && <p className="text-xs text-red-400">{gradingError}</p>}

            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
                onClick={() => setGradingTarget(null)}
                disabled={gradingLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={gradingLoading}
                className="bg-blue-500 text-white py-2 px-4 rounded-md text-sm disabled:opacity-50"
                onClick={handleGradeSubmit}
              >
                {gradingLoading ? "Saving…" : "Save Grade"}
              </button>
            </div>
          </div>
        </div>
      )}

      {conversionOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-md flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Convert to Gradebook</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This is one-way and applies retroactively: every student already graded on this
              assignment will have their result rescaled to the chosen column's max score and
              moved into that column. This can't be undone from here.
            </p>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-300">Gradebook column</label>
              <select
                value={conversionColumnId}
                onChange={(e) => setConversionColumnId(e.target.value)}
                disabled={conversionColumnsLoading}
                className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">
                  {conversionColumnsLoading
                    ? "Loading columns…"
                    : conversionColumns.length > 0
                      ? "Select a column"
                      : "No columns yet for this class/subject/term"}
                </option>
                {conversionColumns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.label} (out of {col.maxScore})
                  </option>
                ))}
              </select>
            </div>

            {conversionError && <p className="text-xs text-red-400">{conversionError}</p>}

            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
                onClick={() => setConversionOpen(false)}
                disabled={conversionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={conversionLoading || !conversionColumnId}
                className="bg-blue-500 text-white py-2 px-4 rounded-md text-sm disabled:opacity-50"
                onClick={handleConversionSubmit}
              >
                {conversionLoading ? "Converting…" : "Convert"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignmentDetailPage;
