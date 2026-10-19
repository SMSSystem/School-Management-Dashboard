import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, Controller } from "react-hook-form";
import { z } from "@/lib/zod";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { ClassDocument, db } from "@/lib/firebase";
import { fetchUserPhotoUrl } from "@/lib/userPhoto";
import { onLoadError } from "@/lib/reportError";
import { formatPhone } from "@/lib/phone";
import { usePhoneCanonicalizer } from "@/hooks/usePhoneCanonicalizer";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { useAuth } from "@/lib/AuthContext";
import { actorName, buildAuditEntry, logAuditEvent } from "@/lib/auditLog";
import { STUDENT_EDIT_FIELDS, describeProfileEdit, diffChangedFields } from "@/lib/profileEditDiff";
import PhotoUploadField from "@/components/PhotoUploadField";
import { fetchInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { fetchInstitutionHouses } from "@/hooks/useInstitutionHouses";
import ExtraClassesField, { type ExtraClassesValue } from "@/components/forms/ExtraClassesField";
import { classIdsOf, extraClassIds, membershipError, normaliseMembership, readClassSubjects } from "@/lib/studentClasses";
import { populationDelta } from "@/lib/classPopulationDelta";
import { addPopulationDelta } from "@/lib/classPopulationWrite";

const schema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  email: z
    .string()
    .email("Enter a valid email address.")
    .optional()
    .or(z.literal("")),
  phone: z.string().optional(),
  phone2: z.string().optional(),
  idNumber: z
    .string()
    .max(50, "Citizen ID or TRN must be 50 characters or less.")
    .optional(),
  institutionStudentId: z
    .string()
    .max(50, "Student ID must be 50 characters or less.")
    .optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["Male", "Female"] as const, {
    message: "Gender is required.",
  }),
  classId: z.string().optional(),
  houseId: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<
  Record<string, string | number | readonly string[] | undefined>
>;

// Matches the field styling this form previously only used on the Student
// Detail page's own hand-rolled "Edit Student Details" modal — unified here
// since this form now replaces that modal (both surfaces render this same
// component via FormModal). Widths keep the existing multi-column flow
// rather than forcing a single column now that there are 11 fields.
const fieldCls = "flex flex-col gap-1 w-full md:w-1/4";
const labelCls = "text-sm font-medium text-gray-700 dark:text-gray-200";
const inputCls =
  "mt-0.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400";
const optionalSpan = (
  <span className="font-normal text-gray-400">(optional)</span>
);

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-400">{message}</p>;
}

const StudentForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const [classes, setClasses] = useState<(ClassDocument & { id: string })[]>(
    [],
  );
  const [houses, setHouses] = useState<{ id: string; name: string }[]>([]);
  // Additional classes (see lib/studentClasses.ts); kept beside the form fields, validated on save.
  const [extras, setExtras] = useState<ExtraClassesValue>(() => ({
    extraClassIds: extraClassIds({ classId: data?.classId as string | undefined, classIds: data?.classIds as string[] | undefined }),
    classSubjects: readClassSubjects(data?.classSubjects),
  }));
  const [extrasError, setExtrasError] = useState("");

  const institutionId = data?.institutionId as string | undefined;
  const uid = (data?.uid ?? data?.id) as string | undefined;

  // Photo upload/replace/remove is admin-only (PHOTO_UPLOAD_SPEC.md §Design
  // Decisions) and only applies to the edit (update) flow — "create" isn't a
  // functioning path in this form today (onSubmit no-ops without a uid).
  const { user, role, displayName } = useAuth();
  const isPhotoEditor = role === "institution_admin" || role === "super_admin";
  // originalPhotoUrl is the saved value (fetched once below); pendingPhotoDataUrl/
  // photoRemoved track an in-progress, unsaved change. photoPreview (derived,
  // not state) is what PhotoUploadField actually displays.
  const [originalPhotoUrl, setOriginalPhotoUrl] = useState<string | null>(null);
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const photoPreview = pendingPhotoDataUrl ?? (photoRemoved ? null : originalPhotoUrl);

  // A student with no photo has no document, and a plain getDoc on a missing photo is refused
  // for staff (lib/userPhoto.ts), so this reads it with the institution-filtered query.
  useEffect(() => {
    if (type !== "update" || !uid) return;
    fetchUserPhotoUrl(uid, institutionId).then(
      setOriginalPhotoUrl,
      onLoadError("the photo", undefined, { quiet: true }),
    );
  }, [type, uid, institutionId]);

  const handlePhotoUploadFieldChange = (dataUrl: string | null) => {
    if (dataUrl) {
      setPendingPhotoDataUrl(dataUrl);
      setPhotoRemoved(false);
    } else {
      setPendingPhotoDataUrl(null);
      setPhotoRemoved(true);
    }
  };

  // Keyed by the student's own institutionId (data?.institutionId), not the
  // signed-in caller's — a super_admin editing a student in a different
  // institution than their own session context. useInstitutionClasses() is
  // tied to useAuth().institutionId, so it doesn't fit here; the imperative
  // fetchInstitutionClasses() shares the same cache under the correct key
  // without that assumption (Phase 3a, FIRESTORE_READ_CACHING_SPEC.md §5.1).
  useEffect(() => {
    if (!institutionId) return;
    let cancelled = false;
    fetchInstitutionClasses(institutionId).then((data) => {
      if (!cancelled) setClasses(data);
    }, onLoadError("classes"));
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  // Keyed by the student's own institutionId (data?.institutionId), not the
  // signed-in caller's — same reasoning as the classes fetch above (Phase 3a,
  // FIRESTORE_READ_CACHING_SPEC.md §5.1).
  useEffect(() => {
    if (!institutionId) return;
    let cancelled = false;
    fetchInstitutionHouses(institutionId).then((data) => {
      if (!cancelled) setHouses(data);
    }, onLoadError("houses"));
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: (data?.firstName as string) ?? "",
      lastName: (data?.lastName as string) ?? "",
      email: (data?.email as string) ?? "",
      phone: (data?.phone as string) ?? "",
      phone2: (data?.phone2 as string) ?? "",
      idNumber: (data?.idNumber as string) ?? "",
      institutionStudentId: (data?.institutionStudentId as string) ?? "",
      dateOfBirth: (data?.dateOfBirth as string) ?? "",
      gender: (data?.gender as "Male" | "Female" | undefined) ?? undefined,
      classId: (data?.classId as string) ?? "",
      houseId: (data?.houseId as string) ?? "",
    },
  });

  const homeClassId = useWatch({ control, name: "classId" }) ?? "";

  const canonicalizePhone = usePhoneCanonicalizer();
  const { onChange: onPhoneChange, onBlur: onPhoneBlur, ...phoneReg } = register("phone");
  const { onChange: onPhone2Change, onBlur: onPhone2Blur, ...phone2Reg } = register("phone2");

  const onSubmit = handleSubmit(async (formData) => {
    if (!uid) {
      console.log("StudentForm: no UID available", formData);
      return;
    }
    if (!institutionId) return;
    const picked = {
      classId: formData.classId,
      extraClassIds: extras.extraClassIds.filter((id) => id !== formData.classId),
      classSubjects: extras.classSubjects,
    };
    const problem = membershipError(picked);
    setExtrasError(problem);
    if (problem) return;
    const membership = normaliseMembership(picked, classes.length > 0 ? new Set(classes.map((c) => c.id)) : undefined);
    const selectedHouse = houses.find((h) => h.id === formData.houseId);
    const prevHouseId = (data?.houseId as string | undefined) || null;
    const newHouseId = formData.houseId || null;

    // The class head-counts (lib/classPopulationDelta.ts) move by the difference between the student as stored RIGHT NOW
    // and as saved. The row this form was opened from can be minutes old (the list is cached), so it is not used.
    const storedStudent = await getDoc(doc(db, "users", uid));
    const stored = storedStudent.data();
    const studentInstitutionId = (stored?.institutionId as string | undefined) ?? institutionId;
    const populationChange =
      stored && studentInstitutionId && studentInstitutionId !== "*"
        ? populationDelta(
            { classIds: classIdsOf(stored), gender: stored.gender, status: stored.status },
            { classIds: membership.classIds, gender: formData.gender, status: stored.status },
            new Set((classes.length > 0 ? classes : await fetchInstitutionClasses(studentInstitutionId)).map((c) => c.id)),
          )
        : {};

    const batch = writeBatch(db);

    batch.update(doc(db, "users", uid), {
      firstName: formData.firstName,
      lastName: formData.lastName,
      name: `${formData.firstName} ${formData.lastName}`,
      ...(formData.email !== undefined && { email: formData.email || null }),
      ...(formData.phone !== undefined && { phone: canonicalizePhone(formData.phone) }),
      phone2: formData.phone2 ? canonicalizePhone(formData.phone2) : null,
      idNumber: formData.idNumber || null,
      institutionStudentId: formData.institutionStudentId || null,
      ...(formData.dateOfBirth !== undefined && {
        dateOfBirth: formData.dateOfBirth || null,
      }),
      gender: formData.gender,
      classId: membership.classId,
      classIds: membership.classIds,
      classSubjects: membership.classSubjects,
      houseId: newHouseId,
      houseName: selectedHouse?.name ?? null,
      // The list rows skip the photo read for a person whose hasPhoto is false (lib/userPhoto.ts), so the flag is
      // written with the photo document, and only when this save changes the photo.
      ...(isPhotoEditor && pendingPhotoDataUrl && { hasPhoto: true }),
      ...(isPhotoEditor && !pendingPhotoDataUrl && photoRemoved && { hasPhoto: false }),
    });

    if (prevHouseId && prevHouseId !== newHouseId) {
      batch.update(institutionDoc(institutionId, "houses", prevHouseId), {
        studentIds: arrayRemove(uid),
      });
    }
    if (newHouseId && newHouseId !== prevHouseId) {
      batch.update(institutionDoc(institutionId, "houses", newHouseId), {
        studentIds: arrayUnion(uid),
      });
    }

    addPopulationDelta(batch, studentInstitutionId, populationChange);

    const photoDocRef = doc(db, "users", uid, "photo", "current");
    if (isPhotoEditor && pendingPhotoDataUrl) {
      batch.set(photoDocRef, {
        dataUrl: pendingPhotoDataUrl,
        institutionId,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
      });
    } else if (isPhotoEditor && photoRemoved) {
      batch.delete(photoDocRef);
    }

    // Which fields this save changed, against the row the list passed in. In the
    // SAME batch as the change, so a profile edit never exists without its record
    // (a rules rejection of the entry fails the save). Field names only. Phones
    // compare in canonical form: the save rewrites a bare NANP number to
    // +1-XXX-XXX-XXXX, which is not an edit. The photo has its own entry below.
    const changedFields = diffChangedFields(
      { ...data, extraClasses: extraClassIds({ classId: data?.classId as string | undefined, classIds: data?.classIds as string[] | undefined }) },
      { ...formData, extraClasses: membership.classIds.filter((id) => id !== membership.classId), classSubjects: membership.classSubjects },
      STUDENT_EDIT_FIELDS,
      { normalizers: { phone: canonicalizePhone, phone2: canonicalizePhone } },
    );
    if (user && changedFields.length > 0 && institutionId !== "*") {
      batch.set(
        doc(institutionCollection(institutionId, "audit_log")),
        buildAuditEntry({
          institutionId,
          eventType: "profile_edit",
          detail: describeProfileEdit(changedFields, `${formData.firstName} ${formData.lastName}`),
          targetUid: uid,
          targetName: `${formData.firstName} ${formData.lastName}`,
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
      const targetName = `${formData.firstName} ${formData.lastName}`;
      const detail = photoRemoved ? "Photo removed by administrator" : "Photo updated by administrator";
      try {
        await addDoc(collection(db, "users", uid, "activity_log"), {
          eventType: "photo_update",
          detail,
          timestamp: new Date().toISOString(),
          recordedAt: serverTimestamp(),
          uid,
          institutionId,
        });
        await logAuditEvent({
          institutionId,
          eventType: "photo_change",
          detail: photoRemoved ? `Removed photo for ${targetName}` : `Updated photo for ${targetName}`,
          targetUid: uid,
          targetName,
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
        {type === "create" ? "Create a new student" : "Edit Student Details"}
      </h1>
      {isPhotoEditor && type === "update" && (
        <PhotoUploadField
          photoUrl={photoPreview}
          onChange={handlePhotoUploadFieldChange}
          fallbackInitial={(data?.firstName as string | undefined)?.[0] ?? "?"}
        />
      )}
      <div className="flex justify-between flex-wrap gap-2">
        <div className={fieldCls}>
          <label htmlFor="firstName" className={labelCls}>
            First Name
          </label>
          <input
            id="firstName"
            autoComplete="off"
            {...register("firstName")}
            className={inputCls}
          />
          <FieldError message={errors.firstName?.message} />
        </div>

        <div className={fieldCls}>
          <label htmlFor="lastName" className={labelCls}>
            Last Name
          </label>
          <input
            id="lastName"
            autoComplete="off"
            {...register("lastName")}
            className={inputCls}
          />
          <FieldError message={errors.lastName?.message} />
        </div>

        <div className={fieldCls}>
          <label htmlFor="email" className={labelCls}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="off"
            {...register("email")}
            className={inputCls}
          />
          <FieldError message={errors.email?.message} />
        </div>

        <div className={fieldCls}>
          <label htmlFor="phone" className={labelCls}>
            Phone
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="off"
            {...phoneReg}
            onChange={(e) => {
              e.target.value = formatPhone(e.target.value);
              onPhoneChange(e);
            }}
            onBlur={(e) => {
              e.target.value = canonicalizePhone(e.target.value);
              onPhoneBlur(e);
            }}
            className={inputCls}
          />
          <FieldError message={errors.phone?.message} />
        </div>

        <div className={fieldCls}>
          <label htmlFor="phone2" className={`${labelCls} whitespace-nowrap`}>
            Second phone {optionalSpan}
          </label>
          <input
            id="phone2"
            type="tel"
            autoComplete="off"
            {...phone2Reg}
            onChange={(e) => {
              e.target.value = formatPhone(e.target.value);
              onPhone2Change(e);
            }}
            onBlur={(e) => {
              e.target.value = canonicalizePhone(e.target.value);
              onPhone2Blur(e);
            }}
            className={inputCls}
          />
          <FieldError message={errors.phone2?.message} />
        </div>

        <div className={fieldCls}>
          <label htmlFor="idNumber" className={`${labelCls} whitespace-nowrap`}>
            Citizen ID or TRN {optionalSpan}
          </label>
          <input
            id="idNumber"
            autoComplete="off"
            maxLength={50}
            {...register("idNumber")}
            className={inputCls}
          />
          <FieldError message={errors.idNumber?.message} />
        </div>

        <div className={fieldCls}>
          <label
            htmlFor="institutionStudentId"
            className={`${labelCls} whitespace-nowrap`}
          >
            Student ID {optionalSpan}
          </label>
          <input
            id="institutionStudentId"
            autoComplete="off"
            maxLength={50}
            {...register("institutionStudentId")}
            className={inputCls}
          />
          <FieldError message={errors.institutionStudentId?.message} />
        </div>

        <div className={fieldCls}>
          <label htmlFor="dateOfBirth" className={labelCls}>
            Date of Birth
          </label>
          <input
            id="dateOfBirth"
            type="date"
            {...register("dateOfBirth")}
            className={inputCls}
          />
          <FieldError message={errors.dateOfBirth?.message} />
        </div>

        <div className={fieldCls}>
          <label htmlFor="gender" className={labelCls}>
            Gender
          </label>
          <select id="gender" {...register("gender")} className={inputCls}>
            <option value="">Select gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          <FieldError message={errors.gender?.message} />
        </div>

        <div className={fieldCls}>
          <label htmlFor="classId" className={labelCls}>
            Class
          </label>
          <Controller
            name="classId"
            control={control}
            render={({ field }) => (
              <select id="classId" {...field} className={inputCls}>
                <option value="">No class assigned</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          />
          <FieldError message={errors.classId?.message} />
        </div>

        {houses.length > 0 && (
          <div className={fieldCls}>
            <label htmlFor="houseId" className={labelCls}>
              House
            </label>
            <Controller
              name="houseId"
              control={control}
              render={({ field }) => (
                <select id="houseId" {...field} className={inputCls}>
                  <option value="">No house assigned</option>
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              )}
            />
            <FieldError message={errors.houseId?.message} />
          </div>
        )}

        {institutionId && (
          <div className="w-full">
            <ExtraClassesField
              institutionId={institutionId}
              classes={classes}
              homeClassId={homeClassId}
              value={{ ...extras, extraClassIds: extras.extraClassIds.filter((id) => id !== homeClassId) }}
              onChange={(next) => {
                setExtras(next);
                setExtrasError("");
              }}
              error={extrasError}
            />
          </div>
        )}
      </div>
      <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
        <button
          type="button"
          className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
          onClick={onClose}
        >
          Cancel
        </button>
        <button className="bg-blue-400 text-white py-2 px-4 rounded-md text-sm">
          {type === "create" ? "Create" : "Update"}
        </button>
      </div>
    </form>
  );
};

export default StudentForm;
