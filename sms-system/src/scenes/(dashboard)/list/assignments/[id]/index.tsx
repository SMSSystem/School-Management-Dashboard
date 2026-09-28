import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AssignmentDocument, RubricDocument, SubmissionDocument } from "@/lib/firebase";
import { ASSIGNMENT_VALUE_TYPE_LABELS } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useLinkedStudentIds } from "@/lib/useLinkedStudentIds";
import { submitAssignmentWork } from "@/lib/submissions";
import { DocumentValidationError } from "@/lib/documentUpload";
import FormModal from "@/components/FormModal";
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
// Implementation Order steps 4-5. Description/attachment/rubric render and
// the class roster shipped in step 4 as a shell; this step wires up the
// real submissions/attempts/submissionTombstones collections (§4.2/§5.3/
// §9.4) behind them — student upload/resubmit, the roster's per-student
// submission status, and a parent's read-only view of their child's
// submission. Grading (entering a score/feedback) is still step 6, not
// built yet — a student's own submission already shows grade/feedback here
// if a future grading action sets them, since that's just reading whatever
// the document holds, not the grading UI itself.
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

  // Class roster — teacher/admin roles only, so a student/parent viewer
  // never triggers a query their own read scope wouldn't need anyway.
  useEffect(() => {
    if (!institutionId || institutionId === "*" || !assignment?.classId || !canEditAssignment(role)) {
      setRoster([]);
      return;
    }
    setRosterLoading(true);
    return onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "student"),
        where("classId", "==", assignment.classId),
      ),
      (snap) => {
        setRoster(
          snap.docs
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
  }, [institutionId, assignment?.classId, role]);

  // Every student's current submission state for this assignment — §6.2's
  // "unfiltered, path-scoped" teacher grading view (small collection,
  // bounded by class size, no composite index needed).
  useEffect(() => {
    if (!institutionId || institutionId === "*" || !id || !canEditAssignment(role)) {
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
    })();
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
      </tr>
    );
  };

  const rosterColumns = [
    { header: "Student Name", accessor: "name" },
    { header: "Student ID", accessor: "institutionStudentId", className: "hidden md:table-cell" },
    { header: "Submission", accessor: "status" },
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
            <FormModal
              table="assignment"
              type="update"
              data={assignment as unknown as Record<string, string | number | readonly string[] | undefined>}
            />
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
        {assignment.attachmentDataUrl ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-sm">{assignment.attachmentFileName ?? "attachment"}</span>
              {typeof assignment.attachmentSize === "number" && (
                <span className="text-xs text-gray-400">
                  {Math.round(assignment.attachmentSize / 1024)} KB
                </span>
              )}
            </div>
            <a
              href={assignment.attachmentDataUrl}
              download={assignment.attachmentFileName ?? "attachment"}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Download
            </a>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No attachment.</p>
        )}
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
      {canEditAssignment(role) ? (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Class Roster ({roster.length})</h2>
          <p className="text-xs text-gray-400">
            Grading isn't available yet — this is coming soon. Submission status only, for now.
          </p>
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
    </div>
  );
};

export default AssignmentDetailPage;
