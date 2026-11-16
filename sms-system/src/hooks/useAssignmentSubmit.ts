import type { User } from "firebase/auth";
import type { AssignmentFile } from "@/lib/assignmentFile";
import {
  assignmentNames,
  buildAssignmentPayload,
  resolveTeacher,
  saveErrorMessage,
  updateIdFor,
  type AssignmentFormOutput,
  type AssignmentFormRecord,
  type TeacherMeta,
} from "@/lib/assignmentFormLogic";
import { saveAssignment } from "@/lib/assignmentFormSave";

type Named = { id: string; name: string };

/**
 * What the assignment form (components/forms/AssignmentForm.tsx) does on Save, moved from the form as it was: work
 * out the teacher, build the document, then save it with its attachment. The form passes what it already holds.
 */
export function useAssignmentSubmit(p: {
  institutionId: string | null;
  user: User | null;
  role: string | null;
  type: "create" | "update";
  data: AssignmentFormRecord | undefined;
  isTeacherRole: boolean;
  lockedTeacherId: string;
  lockedTeacherName: string;
  teacherOptions: { id: string; name: string }[];
  teacherMetaById: Record<string, TeacherMeta>;
  myDepartmentId: string | null | undefined;
  terms: readonly Named[];
  classes: readonly Named[];
  selectedSubject: { name?: string } | undefined;
  attachment: AssignmentFile | null;
  attachmentChanged: boolean;
  setUploading: (uploading: boolean) => void;
  setSubmitError: (message: string | null) => void;
  showMissingId: () => void;
  onSaved: () => void;
}): (formData: AssignmentFormOutput) => Promise<void> {
  return async (formData) => {
    p.setSubmitError(null);
    if (!p.institutionId) return;
    const { teacherId, teacherName, departmentId, teacherRole } =
      resolveTeacher({
        isTeacherRole: p.isTeacherRole,
        role: p.role,
        lockedTeacherId: p.lockedTeacherId,
        lockedTeacherName: p.lockedTeacherName,
        formTeacherId: formData.teacherId,
        teacherOptions: p.teacherOptions,
        teacherMetaById: p.teacherMetaById,
        userUid: p.user?.uid,
        myDepartmentId: p.myDepartmentId,
        type: p.type,
        data: p.data,
      });
    if (!teacherRole) {
      p.setSubmitError(
        "Could not determine the selected teacher's role — try again.",
      );
      return;
    }
    const payload = buildAssignmentPayload({
      institutionId: p.institutionId,
      formData,
      type: p.type,
      data: p.data,
      ...assignmentNames(formData, p.terms, p.classes, p.selectedSubject),
      teacher: { teacherId, teacherName, departmentId, teacherRole },
    });
    const updateId = updateIdFor(p.type, p.data);
    if (updateId === null) return p.showMissingId();
    try {
      await saveAssignment({
        institutionId: p.institutionId,
        uid: p.user?.uid ?? "",
        role: p.role,
        type: p.type,
        data: p.data,
        updateId,
        payload,
        attachment: p.attachment,
        attachmentChanged: p.attachmentChanged,
        setUploading: p.setUploading,
      });
      p.onSaved();
    } catch (err) {
      p.setSubmitError(saveErrorMessage(err, "Failed to save assignment."));
    }
  };
}
