import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import type { ParentRelationship } from "@/lib/firebase";
import { hasStaffView } from "@/lib/roleCapabilities";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useCurrentTerm } from "@/lib/CurrentTermContext";
import { useStudentDetail } from "@/hooks/useStudentDetail";
import { useStudentTermRecords } from "@/hooks/useStudentTermRecords";
import { academicYearIdOf, studentInfoRows } from "@/lib/studentDetailLogic";
import {
  linkParent,
  unlinkParent,
  addActivity,
  deleteActivity,
  addResponsibility,
  deleteResponsibility,
  saveReportCardComments,
} from "@/lib/studentDetailSave";
import { StudentInfoCard } from "./StudentInfoCard";
import { LinkedParentsSection } from "./LinkedParentsSection";
import { ActivitiesSection } from "./ActivitiesSection";
import { ResponsibilitiesSection } from "./ResponsibilitiesSection";
import { ReportCardCommentsSection } from "./ReportCardCommentsSection";
import { DisciplinarySection } from "./DisciplinarySection";

const SingleStudentPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user, role, institutionId, institution } = useAuth();

  const { student, studentLoading, studentInstitutionId, photoUrl, refreshPhoto, parentLinks, allParents } = useStudentDetail(id);

  const { data: terms = [] } = useInstitutionTerms();
  // The user document stores only `classId`; the name comes from the class list.
  const { data: classes } = useInstitutionClasses();
  // Seeded once from the app-wide "current term" (DEV_NOTES Item 6.2) as a
  // convenient starting point — this is a historical lookup for one student,
  // not an ongoing work context, so it deliberately doesn't write back. Seeded
  // via an effect (not a useState initializer) because currentTermId can
  // still be '' at mount (its own onSnapshot listener hasn't resolved yet);
  // the `!selectedTermId` guard means this never overwrites a value the user
  // already picked while waiting for it to resolve.
  const { currentTermId } = useCurrentTerm();
  const [selectedTermId, setSelectedTermId] = useState('');
  useEffect(() => {
    if (!selectedTermId && currentTermId) setSelectedTermId(currentTermId);
  }, [selectedTermId, currentTermId]);

  const {
    activities,
    responsibilities,
    disciplinaryActions,
    commentDocId,
    classSupervisorComment,
    setClassSupervisorComment,
    gradeSupervisorComment,
    setGradeSupervisorComment,
    principalComment,
    setPrincipalComment,
    vicePrincipalComment,
    setVicePrincipalComment,
    commentError,
    setCommentError,
    commentSaved,
    setCommentSaved,
  } = useStudentTermRecords(id, selectedTermId, institutionId);

  // Activities (the add form)
  const [activityName, setActivityName] = useState("");
  const [addingActivity, setAddingActivity] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  // Responsibilities (the add form)
  const [responsibilityTitle, setResponsibilityTitle] = useState("");
  const [responsibilityOrg, setResponsibilityOrg] = useState("");
  const [addingResponsibility, setAddingResponsibility] = useState(false);
  const [responsibilityError, setResponsibilityError] = useState<string | null>(
    null,
  );

  // Report card comments (saving)
  const [savingComments, setSavingComments] = useState(false);

  // Parent linking form
  const [selectedParentId, setSelectedParentId] = useState("");
  const [selectedRelationship, setSelectedRelationship] = useState<ParentRelationship>("guardian");
  const [linkingParent, setLinkingParent] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const handleLinkParent = async () => {
    // The student's institution, not the signed-in one: a super_admin has none selected.
    if (!id || !selectedParentId || !user || !studentInstitutionId) return;
    setLinkingParent(true);
    setLinkError(null);
    try {
      await linkParent({
        parentId: selectedParentId,
        studentId: id,
        institutionId: studentInstitutionId,
        relationship: selectedRelationship,
        uid: user.uid,
      });
      setSelectedParentId("");
      setSelectedRelationship("guardian");
    } catch {
      setLinkError("Failed to link parent. Please try again.");
    } finally {
      setLinkingParent(false);
    }
  };

  const handleUnlinkParent = async (docId: string) => {
    const link = parentLinks.find((l) => l.docId === docId);
    if (!id || !link || !studentInstitutionId) return;
    setLinkError(null);
    try {
      await unlinkParent({ docId, parentId: link.parentId, studentId: id, institutionId: studentInstitutionId });
    } catch {
      setLinkError("Failed to unlink parent. Please try again.");
    }
  };

  const handleAddActivity = async () => {
    if (
      !id ||
      !selectedTermId ||
      !activityName.trim() ||
      !user ||
      !institutionId ||
      institutionId === "*"
    )
      return;
    const academicYearId = academicYearIdOf(terms, selectedTermId);
    setAddingActivity(true);
    setActivityError(null);
    try {
      await addActivity({
        institutionId,
        studentId: id,
        classId: student?.classId ?? "",
        termId: selectedTermId,
        academicYearId,
        activityName,
        uid: user.uid,
      });
      setActivityName("");
    } catch {
      setActivityError("Failed to add activity. Please try again.");
    } finally {
      setAddingActivity(false);
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!institutionId || institutionId === "*") return;
    setActivityError(null);
    try {
      await deleteActivity(institutionId, activityId);
    } catch {
      setActivityError("Failed to remove activity. Please try again.");
    }
  };

  const handleAddResponsibility = async () => {
    if (
      !id ||
      !selectedTermId ||
      !responsibilityTitle.trim() ||
      !user ||
      !institutionId ||
      institutionId === "*"
    )
      return;
    const academicYearId = academicYearIdOf(terms, selectedTermId);
    setAddingResponsibility(true);
    setResponsibilityError(null);
    try {
      await addResponsibility({
        institutionId,
        studentId: id,
        classId: student?.classId ?? "",
        termId: selectedTermId,
        academicYearId,
        title: responsibilityTitle,
        organisation: responsibilityOrg,
        uid: user.uid,
      });
      setResponsibilityTitle("");
      setResponsibilityOrg("");
    } catch {
      setResponsibilityError("Failed to add position. Please try again.");
    } finally {
      setAddingResponsibility(false);
    }
  };

  const handleDeleteResponsibility = async (responsibilityId: string) => {
    if (!institutionId || institutionId === "*") return;
    setResponsibilityError(null);
    try {
      await deleteResponsibility(institutionId, responsibilityId);
    } catch {
      setResponsibilityError("Failed to remove position. Please try again.");
    }
  };

  const handleSaveComments = async () => {
    if (
      !id ||
      !selectedTermId ||
      !user ||
      !institutionId ||
      institutionId === "*"
    )
      return;
    const academicYearId = academicYearIdOf(terms, selectedTermId);
    setSavingComments(true);
    setCommentError(null);
    setCommentSaved(false);
    try {
      await saveReportCardComments({
        institutionId,
        studentId: id,
        termId: selectedTermId,
        academicYearId,
        classSupervisorComment,
        gradeSupervisorComment,
        principalComment,
        vicePrincipalComment,
        uid: user.uid,
        commentDocId,
      });
      setCommentSaved(true);
      setTimeout(() => setCommentSaved(false), 3000);
    } catch {
      setCommentError("Failed to save comments. Please try again.");
    } finally {
      setSavingComments(false);
    }
  };

  if (studentLoading) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
    );
  }

  if (!student) {
    return (
      <div className="p-8 text-center flex flex-col items-center gap-3">
        <p className="text-gray-500">Student not found.</p>
        <Link
          to="/dashboard/list/students"
          className="text-sky-600 underline text-sm"
        >
          ← Back to Students
        </Link>
      </div>
    );
  }

  // isStaff: sees the disciplinary record (staff and a spectator).
  // isAdmin: may edit or delete a disciplinary entry.
  // mayEdit: may change this student's links, activities, positions and report
  // card comments (institution_admin only, as before).
  // showAdminSections: sees those sections; a spectator sees them read-only.
  const isStaff = hasStaffView(role);
  const isAdmin = role === "institution_admin" || role === "super_admin";
  const mayEdit = role === "institution_admin";
  const showAdminSections = role === "institution_admin" || role === "spectator";

  const infoRows = studentInfoRows(student, classes);

  return (
    <div className="p-4 flex flex-col gap-4">
      <Link
        to="/dashboard/list/students"
        className="text-sm text-sky-600 hover:underline self-start"
      >
        ← Back to Students
      </Link>

      {/* Student info card */}
      <StudentInfoCard
        student={student}
        photoUrl={photoUrl}
        role={role}
        refreshPhoto={refreshPhoto}
        infoRows={infoRows}
      />

      {/* Parent Linking (admin edits; a spectator sees the links read-only) */}
      {showAdminSections && (
        <LinkedParentsSection
          parentLinks={parentLinks}
          allParents={allParents}
          mayEdit={mayEdit}
          handleUnlinkParent={handleUnlinkParent}
          linkError={linkError}
          selectedRelationship={selectedRelationship}
          setSelectedRelationship={setSelectedRelationship}
          selectedParentId={selectedParentId}
          setSelectedParentId={setSelectedParentId}
          handleLinkParent={handleLinkParent}
          linkingParent={linkingParent}
        />
      )}

      {/* Term selector — sets context for activity/comment sections added in later steps */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
          View term:
        </label>
        <select
          value={selectedTermId}
          onChange={(e) => setSelectedTermId(e.target.value)}
          className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
        >
          <option value="">— Select a term —</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Extra Curricular Activities */}
      {showAdminSections && selectedTermId && (
        <ActivitiesSection
          activities={activities}
          mayEdit={mayEdit}
          handleDeleteActivity={handleDeleteActivity}
          activityError={activityError}
          activityName={activityName}
          setActivityName={setActivityName}
          handleAddActivity={handleAddActivity}
          addingActivity={addingActivity}
        />
      )}

      {/* Positions of Responsibility */}
      {showAdminSections && selectedTermId && (
        <ResponsibilitiesSection
          responsibilities={responsibilities}
          mayEdit={mayEdit}
          handleDeleteResponsibility={handleDeleteResponsibility}
          responsibilityError={responsibilityError}
          responsibilityTitle={responsibilityTitle}
          setResponsibilityTitle={setResponsibilityTitle}
          responsibilityOrg={responsibilityOrg}
          setResponsibilityOrg={setResponsibilityOrg}
          handleAddResponsibility={handleAddResponsibility}
          addingResponsibility={addingResponsibility}
        />
      )}

      {/* Report Card Comments */}
      {showAdminSections && selectedTermId && (
        <ReportCardCommentsSection
          institution={institution}
          classSupervisorComment={classSupervisorComment}
          setClassSupervisorComment={setClassSupervisorComment}
          gradeSupervisorComment={gradeSupervisorComment}
          setGradeSupervisorComment={setGradeSupervisorComment}
          principalComment={principalComment}
          setPrincipalComment={setPrincipalComment}
          vicePrincipalComment={vicePrincipalComment}
          setVicePrincipalComment={setVicePrincipalComment}
          mayEdit={mayEdit}
          commentError={commentError}
          commentSaved={commentSaved}
          handleSaveComments={handleSaveComments}
          savingComments={savingComments}
        />
      )}

      {/* Disciplinary Record */}
      {isStaff && selectedTermId && (
        <DisciplinarySection
          disciplinaryActions={disciplinaryActions}
          isAdmin={isAdmin}
          role={role}
          student={student}
          id={id}
          selectedTermId={selectedTermId}
        />
      )}

    </div>
  );
};

export default SingleStudentPage;
