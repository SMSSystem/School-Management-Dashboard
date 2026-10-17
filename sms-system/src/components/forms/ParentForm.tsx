import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import { actorName, buildAuditEntry } from "@/lib/auditLog";
import {
  PARENT_EDIT_FIELDS,
  describeProfileEdit,
  diffChangedFields,
  parentPhoneNormalizer,
} from "@/lib/profileEditDiff";
import { institutionCollection } from "@/lib/paths";
import InputField from "../InputField";
import { formatPhone } from "@/lib/phone";
import { phonePattern } from "@/lib/fieldPatterns";
import { usePhoneCanonicalizer } from "@/hooks/usePhoneCanonicalizer";

const schema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  email: z.string().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z
    .string()
    .refine((v) => v === "" || phonePattern.test(v), "Enter a valid phone number.")
    .optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

interface StudentRow {
  uid: string;
  name: string;
}

const ParentForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, displayName, institutionId } = useAuth();
  const canonicalizePhone = usePhoneCanonicalizer();
  // The PARENT's institution, not the signed-in admin's (a super_admin's own is '*').
  const targetInstitutionId = (data?.institutionId as string | undefined) ?? institutionId;
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  // The links as they were when the form opened (null until loaded): what the
  // ticks are compared with to find added and removed links.
  const [initialLinkIds, setInitialLinkIds] = useState<string[] | null>(null);

  // Load all students in institution
  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "student"),
      ),
      (snap) => {
        setAllStudents(
          snap.docs
            .map((d) => ({ uid: d.id, name: (d.data().name as string) ?? d.id }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      () => {},
    );
    return unsub;
  }, [institutionId]);

  // Pre-load existing links for this parent. The read rule for student_parents
  // (see firestore.rules) holds only for a query that names the institution, so
  // this filters on the parent's institutionId: with `parentId ==` alone an admin
  // is refused, the links never load and Save returns without saving. A
  // super_admin's row with no institution ('*') keeps the plain query, which
  // they are allowed to run.
  useEffect(() => {
    const uid = data?.uid as string | undefined;
    if (!uid) return;
    const filters = [where("parentId", "==", uid)];
    if (targetInstitutionId && targetInstitutionId !== "*") {
      filters.push(where("institutionId", "==", targetInstitutionId));
    }
    getDocs(query(collection(db, "student_parents"), ...filters)).then((snap) => {
      const ids = snap.docs.map((d) => d.data().studentId as string);
      setSelectedStudentIds(ids);
      setInitialLinkIds(ids);
    }, onLoadError("this parent's linked students"));
  }, [data?.uid, targetInstitutionId]);

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    );
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: (data?.firstName as string) ?? "",
      lastName: (data?.lastName as string) ?? "",
      email: (data?.email as string) ?? "",
      phone: (data?.phone as string) ?? "",
    },
  });

  const onSubmit = handleSubmit(async (formData) => {
    const uid = data?.uid as string | undefined;
    if (!uid) {
      console.log("ParentForm: no UID available (mock mode)", formData);
      return;
    }
    // The links are only known once they have loaded; saving before then would
    // read "nothing linked" and unlink everyone.
    if (initialLinkIds === null) return;
    const batch = writeBatch(db);
    const parentName = `${formData.firstName} ${formData.lastName}`;

    batch.set(
      doc(db, "users", uid),
      {
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: parentName,
        ...(formData.email !== undefined && { email: formData.email || null }),
        ...(formData.phone !== undefined && { phone: canonicalizePhone(formData.phone) }),
      },
      { merge: true },
    );

    for (const studentId of selectedStudentIds) {
      batch.set(
        doc(db, "student_parents", `${uid}_${studentId}`),
        { parentId: uid, studentId, institutionId },
        { merge: true },
      );
    }
    // Unticking a student removes the link (it used to do nothing on save).
    const removedLinks = initialLinkIds.filter((id) => !selectedStudentIds.includes(id));
    for (const studentId of removedLinks) {
      batch.delete(doc(db, "student_parents", `${uid}_${studentId}`));
    }
    const linksChanged =
      removedLinks.length > 0 || selectedStudentIds.some((id) => !initialLinkIds.includes(id));

    // Which fields this save changed, against the row the list passed in. In the
    // SAME batch as the change, so a profile edit never exists without its record.
    // Field names only. The row shows a missing phone as an em dash, which is
    // "empty"; phones compare in canonical form (the save reformats them). Filed
    // under the PARENT's institution (a super_admin's own is the '*' sentinel).
    const changedFields = [
      ...diffChangedFields(data, formData, PARENT_EDIT_FIELDS, {
        normalizers: { phone: parentPhoneNormalizer(canonicalizePhone) },
      }),
      ...(linksChanged ? ["linked students"] : []),
    ];
    if (user && changedFields.length > 0 && targetInstitutionId && targetInstitutionId !== "*") {
      batch.set(
        doc(institutionCollection(targetInstitutionId, "audit_log")),
        buildAuditEntry({
          institutionId: targetInstitutionId,
          eventType: "profile_edit",
          detail: describeProfileEdit(changedFields, parentName),
          targetUid: uid,
          targetName: parentName,
          performedBy: user.uid,
          performedByName: actorName(displayName, user.email),
        }),
      );
    }

    await batch.commit();
    onClose?.();
  });

  const linkedIds = new Set(selectedStudentIds);
  const linkedStudents = allStudents.filter((s) => linkedIds.has(s.uid));
  const unlinkedStudents = allStudents.filter((s) => !linkedIds.has(s.uid));

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new parent" : "Edit parent"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="First Name" name="firstName" register={register} error={errors.firstName} />
        <InputField label="Last Name" name="lastName" register={register} error={errors.lastName} />
        <InputField label="Email" name="email" type="email" register={register} error={errors.email} />
        <InputField
          label="Phone"
          name="phone"
          type="tel"
          register={register}
          error={errors.phone}
          formatter={formatPhone}
          onBlurFormatter={canonicalizePhone}
        />
        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Linked Students</label>
          {allStudents.length === 0 ? (
            <p className="text-xs text-gray-400">No students found — create student accounts first.</p>
          ) : (
            <div className="space-y-3">
              {linkedStudents.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Currently linked</p>
                  <div className="flex flex-wrap gap-3">
                    {linkedStudents.map((s) => (
                      <label key={s.uid} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => toggleStudent(s.uid)}
                          className="accent-blue-400"
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {unlinkedStudents.length > 0 && (
                <div>
                  {linkedStudents.length > 0 && (
                    <p className="text-xs text-gray-400 mb-1">Available to link</p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {unlinkedStudents.map((s) => (
                      <label key={s.uid} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => toggleStudent(s.uid)}
                          className="accent-blue-400"
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={!!data?.uid && initialLinkIds === null}
      >
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default ParentForm;
