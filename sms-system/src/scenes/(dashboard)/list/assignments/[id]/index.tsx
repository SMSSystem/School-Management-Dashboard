import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AssignmentDocument, RubricDocument } from "@/lib/firebase";
import { ASSIGNMENT_VALUE_TYPE_LABELS } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import FormModal from "@/components/FormModal";
import Table from "@/components/Table";
import { institutionDoc } from "@/lib/paths";

type Assignment = AssignmentDocument & { id: string };
type Rubric = RubricDocument & { id: string };
type RosterStudent = { uid: string; name: string; institutionStudentId?: string };

const rosterColumns = [
  { header: "Student Name", accessor: "name" },
  { header: "Student ID", accessor: "institutionStudentId", className: "hidden md:table-cell" },
];

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

// list/assignments/[id]/index.tsx — ASSIGNMENTS_FEATURE_SPEC.md §13
// Implementation Order step 4. Per your explicit choice, this step is a
// shell: description/attachment/rubric render (fully functional) plus a
// real class roster for teacher/admin roles, but no interactive submission
// upload or grading yet — the submissions collection, its firestore.rules,
// and the actual upload/grading logic are steps 5-6, not yet built. The
// student/parent panels below say so explicitly rather than presenting a
// disabled control that would misleadingly suggest the feature almost works.
const AssignmentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { role, institutionId } = useAuth();

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

  const renderRosterRow = (item: RosterStudent) => (
    <tr
      key={item.uid}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm"
    >
      <td className="p-4">{item.name}</td>
      <td className="hidden md:table-cell">{item.institutionStudentId ?? "—"}</td>
    </tr>
  );

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

      {/* Role-dependent area — shell only, per Implementation Order step 4;
          real submission/grading UI lands with steps 5-6. */}
      {canEditAssignment(role) ? (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Class Roster ({roster.length})</h2>
          <p className="text-xs text-gray-400">
            Submission status per student isn't available yet — coming with the submissions
            feature.
          </p>
          <Table columns={rosterColumns} renderRow={renderRosterRow} data={roster} loading={rosterLoading} />
        </div>
      ) : role === "student" ? (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Your Submission</h2>
          <p className="text-sm text-gray-400 italic">
            Submitting completed work isn't available yet — this is coming soon.
          </p>
        </div>
      ) : role === "parent" ? (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Your Child's Submission</h2>
          <p className="text-sm text-gray-400 italic">
            Viewing your child's submission isn't available yet — this is coming soon.
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default AssignmentDetailPage;
