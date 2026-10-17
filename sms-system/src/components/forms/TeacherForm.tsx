import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import InputField from "../InputField";
import { db } from "@/lib/firebase";
import { fetchUserPhotoUrl } from "@/lib/userPhoto";
import { onLoadError } from "@/lib/reportError";
import { formatPhone } from "@/lib/phone";
import { usePhoneCanonicalizer } from "@/hooks/usePhoneCanonicalizer";
import { useAuth } from "@/lib/AuthContext";
import { actorName, buildAuditEntry, logAuditEvent } from "@/lib/auditLog";
import { describeProfileEdit, diffChangedFields, teacherEditFields } from "@/lib/profileEditDiff";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { homeroomRoomField, homeroomBuildingField, addHomeroomRoomRequiredIssue } from "@/lib/homeroomFields";
import PhotoUploadField from "@/components/PhotoUploadField";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useAllInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import { withoutTeacher } from "@/lib/subjectTeachers";
import { useInstitutionDepartments } from "@/hooks/useInstitutionDepartments";
import { departmentRequired, DEPARTMENT_REQUIRED_MESSAGE } from "@/lib/departmentRequirement";

const schema = z
  .object({
    firstName: z.string().min(1, "First name is required."),
    lastName: z.string().min(1, "Last name is required."),
    phone: z.string().optional(),
    departmentId: z.string().optional(),
    assignedClassId: z.string().optional(),
    homeroomRoom: homeroomRoomField,
    homeroomBuilding: homeroomBuildingField,
  })
  .superRefine((values, ctx) => {
    if (values.assignedClassId && !values.homeroomRoom?.trim()) {
      addHomeroomRoomRequiredIssue(ctx);
    }
  });

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const TeacherForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, displayName, institutionId } = useAuth();
  const canonicalizePhone = usePhoneCanonicalizer();
  const { data: departments = [] } = useInstitutionDepartments();
  const { data: classes = [] } = useInstitutionClasses();
  const { data: subjects = [] } = useAllInstitutionSubjects();
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // Read-only rollup of every class covered by the currently-selected subjects —
  // institution-scoped subjects count as every class, class-scoped subjects count
  // as their own classIds. Recomputes live as subject checkboxes are toggled.
  const classesTaught = (() => {
    const names = new Set<string>();
    for (const subjectId of selectedSubjectIds) {
      const subject = subjects.find((s) => s.id === subjectId);
      if (!subject) continue;
      if (subject.classScope === "institution") {
        classes.forEach((c) => names.add(c.name));
      } else {
        subject.classNames.forEach((n) => names.add(n));
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  })();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      departmentId: "",
      assignedClassId: "",
      homeroomRoom: "",
      homeroomBuilding: "",
    },
  });

  // Seniority is derived from the account's role, not editable from this form
  // (finding 2.6 — see PR_REVIEW_FIXES_data-structure-overhaul.md Fix 7).
  const [teacherType, setTeacherType] = useState<"regular" | "senior">("regular");
  // The teacher's profile as loaded into the form: what an edit is compared with
  // for its audit entry (see onSubmit).
  const [loadedUser, setLoadedUser] = useState<Record<string, unknown> | null>(null);
  const uid = (data?.uid ?? data?.id) as string | undefined;

  // Photo upload/replace/remove is admin-only (PHOTO_UPLOAD_SPEC.md §Design
  // Decisions) and only applies to the edit (update) flow.
  const isPhotoEditor = role === "institution_admin" || role === "super_admin";
  // CORRECTED (PR self-review): the photo doc's institutionId must be the
  // EDITED teacher's own institution, not the acting admin's — institutionId
  // (from useAuth) is always the sentinel '*' for a super_admin, so writing
  // it onto another institution's teacher's photo doc would silently lock
  // that institution's own institution_admin out of it afterward (their
  // rules check would fail: sameInstitution('*') requires
  // myInstitutionId() == '*', false for a real institution_admin). data
  // (the row being edited) already carries the teacher's real
  // institutionId — mirrors StudentForm.tsx's existing pattern.
  const targetInstitutionId = (data?.institutionId as string | undefined) ?? institutionId;
  // originalPhotoUrl is the saved value (fetched once below); pendingPhotoDataUrl/
  // photoRemoved track an in-progress, unsaved change. photoPreview (derived,
  // not state) is what PhotoUploadField actually displays.
  const [originalPhotoUrl, setOriginalPhotoUrl] = useState<string | null>(null);
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const photoPreview = pendingPhotoDataUrl ?? (photoRemoved ? null : originalPhotoUrl);

  // A teacher with no photo has no document, and a plain getDoc on a missing photo is refused
  // for staff (lib/userPhoto.ts), so this reads it with the institution-filtered query.
  useEffect(() => {
    if (type !== "update" || !uid) return;
    fetchUserPhotoUrl(uid, targetInstitutionId).then(
      setOriginalPhotoUrl,
      onLoadError("the photo", undefined, { quiet: true }),
    );
  }, [type, uid, targetInstitutionId]);

  const handlePhotoUploadFieldChange = (dataUrl: string | null) => {
    if (dataUrl) {
      setPendingPhotoDataUrl(dataUrl);
      setPhotoRemoved(false);
    } else {
      setPendingPhotoDataUrl(null);
      setPhotoRemoved(true);
    }
  };

  useEffect(() => {
    if (type !== "update" || !uid) return;
    getDoc(doc(db, "users", uid)).then((userSnap) => {
      const u = userSnap.data();
      setLoadedUser(u ?? null);
      setTeacherType(u?.role === "senior_teacher" ? "senior" : "regular");
      reset({
        firstName: (u?.firstName as string) ?? "",
        lastName: (u?.lastName as string) ?? "",
        phone: (u?.phone as string) ?? "",
        departmentId: (u?.departmentId as string) ?? "",
        assignedClassId: (u?.assignedClassId as string) ?? "",
        homeroomRoom: (u?.homeroomRoom as string) ?? "",
        homeroomBuilding: (u?.homeroomBuilding as string) ?? "",
      });
    });
  }, [uid, type, reset]);

  // Prefill selected subjects from teacherIds once, when both the target uid and
  // the live subjects list are available. A ref (not state) guards against
  // re-running on every subjects onSnapshot update, which would otherwise stomp
  // on the user's in-progress checkbox edits.
  const initializedSubjectsForUid = useRef<string | null>(null);
  useEffect(() => {
    if (type !== "update" || !uid) return;
    if (subjects.length === 0) return;
    if (initializedSubjectsForUid.current === uid) return;
    setSelectedSubjectIds(subjects.filter((s) => s.teacherIds?.includes(uid)).map((s) => s.id));
    initializedSubjectsForUid.current = uid;
  }, [type, uid, subjects]);

  const onSubmit = handleSubmit(async (formData) => {
    if (!uid) {
      console.log("TeacherForm: no UID available", formData);
      return;
    }
    if (!institutionId || !targetInstitutionId) return;
    // A teacher's department decides whether a senior_teacher can see their
    // notes and assignments (firestore.rules matches departmentId), so it's
    // required wherever the institution has departments to choose from. Runtime
    // state, so checked here rather than in the zod schema. Editing ANY field
    // of a department-less teacher therefore asks for one — intentional: this
    // form is how admins repair existing accounts.
    if (departmentRequired("regular_teacher", departments.length > 0) && !formData.departmentId) {
      setError("departmentId", { type: "required", message: DEPARTMENT_REQUIRED_MESSAGE });
      return;
    }
    const batch = writeBatch(db);
    const selectedDeptName = departments.find((d) => d.id === formData.departmentId)?.name ?? null;
    const teacherName = `${formData.firstName} ${formData.lastName}`;
    let subjectsChanged = false;
    batch.set(
      doc(db, "users", uid),
      {
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: teacherName,
        department: selectedDeptName,
        departmentId: formData.departmentId || null,
        ...(formData.phone !== undefined && { phone: canonicalizePhone(formData.phone) }),
        ...(teacherType === "senior" && {
          assignedClassId: formData.assignedClassId || null,
          assignedClassName: formData.assignedClassId
            ? (classes.find((c) => c.id === formData.assignedClassId)?.name ?? null)
            : null,
          homeroomRoom: formData.homeroomRoom || null,
          homeroomBuilding: formData.homeroomBuilding || null,
        }),
      },
      { merge: true },
    );

    // Reverse-editor for the subjects/{id}.teacherIds relationship: add or remove
    // this teacher from every subject whose selection state changed, preserving
    // every other teacher already on that subject.
    for (const subject of subjects) {
      const currentlyAssigned = subject.teacherIds?.includes(uid) ?? false;
      const shouldBeAssigned = selectedSubjectIds.includes(subject.id);
      if (currentlyAssigned === shouldBeAssigned) continue;
      subjectsChanged = true;

      const removed = withoutTeacher(subject, uid);
      const nextTeacherIds = shouldBeAssigned ? [...(subject.teacherIds ?? []), uid] : removed.teacherIds;
      const nextTeacherNames = shouldBeAssigned ? [...(subject.teacherNames ?? []), teacherName] : removed.teacherNames;

      batch.update(institutionDoc(institutionId, "subjects", subject.id), {
        teacherIds: nextTeacherIds,
        teacherNames: nextTeacherNames,
        // Taking the assistant off the subject also removes the assistant label.
        ...(!shouldBeAssigned && removed.clearAssistant
          ? { assistantTeacherId: deleteField(), assistantTeacherName: deleteField() }
          : {}),
      });
    }

    const photoDocRef = doc(db, "users", uid, "photo", "current");
    if (isPhotoEditor && pendingPhotoDataUrl) {
      batch.set(photoDocRef, {
        dataUrl: pendingPhotoDataUrl,
        institutionId: targetInstitutionId,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      });
    } else if (isPhotoEditor && photoRemoved) {
      batch.delete(photoDocRef);
    }

    // Which fields this save changed, against the teacher's profile as it was
    // loaded into the form (the list row does not carry every field this form
    // edits). In the SAME batch as the change, so a profile edit never exists
    // without its record. Field names only; phones compare in canonical form.
    // Filed under the EDITED teacher's institution, like the photo entry below.
    const changedFields = [
      ...diffChangedFields(
        loadedUser ?? undefined,
        formData,
        teacherEditFields(teacherType === "senior"),
        { normalizers: { phone: canonicalizePhone } },
      ),
      ...(subjectsChanged ? ["subjects"] : []),
    ];
    if (user && changedFields.length > 0 && targetInstitutionId !== "*") {
      batch.set(
        doc(institutionCollection(targetInstitutionId, "audit_log")),
        buildAuditEntry({
          institutionId: targetInstitutionId,
          eventType: "profile_edit",
          detail: describeProfileEdit(changedFields, teacherName),
          targetUid: uid,
          targetName: teacherName,
          performedBy: user.uid,
          performedByName: actorName(displayName, user.email),
        }),
      );
    }

    await batch.commit();

    // Best-effort audit trail — mirrors logRegistrationAudit's pattern.
    // Written after the batch commits (not folded into it) so a log-write
    // failure never blocks the actual profile/photo save.
    if (isPhotoEditor && user && (pendingPhotoDataUrl || photoRemoved)) {
      const detail = photoRemoved ? "Photo removed by administrator" : "Photo updated by administrator";
      try {
        await addDoc(collection(db, "users", uid, "activity_log"), {
          eventType: "photo_update",
          detail,
          timestamp: new Date().toISOString(),
          recordedAt: serverTimestamp(),
          uid,
          institutionId: targetInstitutionId,
        });
        // Filed under the EDITED teacher's institution, not the acting
        // admin's (same CORRECTED reasoning as the photo doc above) — a
        // super_admin's audit entry belongs where that institution's own
        // institution_admin can actually read it (institutions/{id}/
        // audit_log's rules scope read to that institution specifically).
        await logAuditEvent({
          institutionId: targetInstitutionId,
          eventType: "photo_change",
          detail: photoRemoved ? `Removed photo for ${teacherName}` : `Updated photo for ${teacherName}`,
          targetUid: uid,
          targetName: teacherName,
          performedBy: user.uid,
          performedByName: actorName(displayName, user.email),
        });
      } catch {
        // Best-effort — the photo change itself already succeeded above.
      }
    }

    onClose?.();
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new teacher" : "Edit teacher"}
      </h1>
      {isPhotoEditor && type === "update" && (
        <PhotoUploadField
          photoUrl={photoPreview}
          onChange={handlePhotoUploadFieldChange}
          fallbackInitial={(data?.firstName as string | undefined)?.[0] ?? "?"}
        />
      )}
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="First Name"
          name="firstName"
          register={register}
          error={errors.firstName}
        />
        <InputField
          label="Last Name"
          name="lastName"
          register={register}
          error={errors.lastName}
        />
        <InputField
          label="Phone"
          name="phone"
          type="tel"
          register={register}
          error={errors.phone}
          formatter={formatPhone}
          onBlurFormatter={canonicalizePhone}
        />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Teacher Type</label>
          <p className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100">
            {teacherType === "senior" ? "Senior" : "Regular"}
          </p>
        </div>

        {departments.length > 0 && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500 dark:text-gray-300">Department (required)</label>
            <select
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              {...register("departmentId")}
            >
              <option value="">Select a department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {errors.departmentId?.message && (
              <p className="text-xs text-red-400">{errors.departmentId.message.toString()}</p>
            )}
          </div>
        )}

        {teacherType === "senior" && classes.length > 0 && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500 dark:text-gray-300">Assigned Class</label>
            <select
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              {...register("assignedClassId")}
            >
              <option value="">No class assigned</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.assignedClassId?.message && (
              <p className="text-xs text-red-400">{errors.assignedClassId.message.toString()}</p>
            )}
          </div>
        )}

        {teacherType === "senior" && classes.length > 0 && (
          <>
            <InputField
              label="Homeroom Room"
              name="homeroomRoom"
              register={register}
              error={errors.homeroomRoom}
            />
            <InputField
              label="Homeroom Building (optional)"
              name="homeroomBuilding"
              register={register}
              error={errors.homeroomBuilding}
            />
          </>
        )}

        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Subjects</label>
          <div className="ring-[1.5px] ring-gray-300 rounded-md p-2 max-h-40 overflow-y-auto dark:ring-gray-600 dark:bg-gray-900">
            {subjects.length === 0 ? (
              <p className="text-xs text-gray-400">No subjects found.</p>
            ) : (
              subjects.map((subject) => (
                <label key={subject.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSubjectIds.includes(subject.id)}
                    onChange={() => toggleSubject(subject.id)}
                  />
                  {subject.name}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">
            Classes Taught (from selected subjects — not directly editable)
          </label>
          {classesTaught.length === 0 ? (
            <p className="text-xs text-gray-400">No classes yet — select a subject above.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classesTaught.map((name) => (
                <span
                  key={name}
                  className="text-xs px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                >
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default TeacherForm;
