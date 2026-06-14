import { Fragment, useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

type ClassItem = { id: string; name: string };
type TermItem = { id: string; name: string; academicYearId: string };
type StudentItem = { uid: string; name: string };
type CommentEntry = {
  docId: string;
  classSupervisorComment: string;
  gradeSupervisorComment: string;
  principalComment: string;
  vicePrincipalComment: string;
};

type EditValues = {
  classSupervisorComment: string;
  gradeSupervisorComment: string;
  principalComment: string;
  vicePrincipalComment: string;
};

const EMPTY_EDIT: EditValues = {
  classSupervisorComment: "",
  gradeSupervisorComment: "",
  principalComment: "",
  vicePrincipalComment: "",
};

const FIELDS: { key: keyof EditValues; labelKey: keyof ReturnType<typeof buildLabels> }[] = [
  { key: "classSupervisorComment", labelKey: "classSupervisor" },
  { key: "gradeSupervisorComment", labelKey: "gradeSupervisor" },
  { key: "principalComment", labelKey: "principal" },
  { key: "vicePrincipalComment", labelKey: "vicePrincipal" },
];

function buildLabels(institution: { classSupervisorLabel?: string; gradeSupervisorLabel?: string; principalLabel?: string; vicePrincipalLabel?: string } | null | undefined) {
  return {
    classSupervisor: institution?.classSupervisorLabel ?? "Class Supervisor",
    gradeSupervisor: institution?.gradeSupervisorLabel ?? "Grade Supervisor",
    principal: institution?.principalLabel ?? "Principal",
    vicePrincipal: institution?.vicePrincipalLabel ?? "Vice Principal",
  };
}

const ReportCardCommentsPage = () => {
  const { user, institutionId, institution } = useAuth();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [allComments, setAllComments] = useState<Record<string, CommentEntry>>({});

  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({ ...EMPTY_EDIT });
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedStudentId, setSavedStudentId] = useState<string | null>(null);

  const labels = buildLabels(institution);

  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    return onSnapshot(
      query(collection(db, "classes"), where("institutionId", "==", institutionId)),
      (snap) => {
        const items: ClassItem[] = snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name as string,
        }));
        items.sort((a, b) => a.name.localeCompare(b.name));
        setClasses(items);
      }
    );
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    return onSnapshot(
      query(collection(db, "terms"), where("institutionId", "==", institutionId)),
      (snap) => {
        setTerms(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name as string,
            academicYearId: (d.data().academicYearId as string) ?? "",
          }))
        );
      }
    );
  }, [institutionId]);

  useEffect(() => {
    if (!selectedClassId || !institutionId || institutionId === "*") {
      setStudents([]);
      setExpandedStudentId(null);
      return;
    }
    setExpandedStudentId(null);
    setSaveError(null);
    return onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "student"),
        where("classId", "==", selectedClassId)
      ),
      (snap) => {
        const items: StudentItem[] = snap.docs.map((d) => ({
          uid: d.id,
          name: d.data().name as string,
        }));
        items.sort((a, b) => a.name.localeCompare(b.name));
        setStudents(items);
      }
    );
  }, [selectedClassId, institutionId]);

  useEffect(() => {
    if (!selectedTermId || !institutionId || institutionId === "*") {
      setAllComments({});
      return;
    }
    return onSnapshot(
      query(
        collection(db, "reportCardComments"),
        where("institutionId", "==", institutionId),
        where("termId", "==", selectedTermId)
      ),
      (snap) => {
        const map: Record<string, CommentEntry> = {};
        snap.docs.forEach((d) => {
          map[d.data().studentId as string] = {
            docId: d.id,
            classSupervisorComment: (d.data().classSupervisorComment as string) ?? "",
            gradeSupervisorComment: (d.data().gradeSupervisorComment as string) ?? "",
            principalComment: (d.data().principalComment as string) ?? "",
            vicePrincipalComment: (d.data().vicePrincipalComment as string) ?? "",
          };
        });
        setAllComments(map);
      }
    );
  }, [selectedTermId, institutionId]);

  const handleExpandRow = (studentUid: string) => {
    if (expandedStudentId === studentUid) {
      setExpandedStudentId(null);
      setSaveError(null);
      return;
    }
    setSaveError(null);
    setSavedStudentId(null);
    const existing = allComments[studentUid];
    setEditValues(
      existing
        ? {
            classSupervisorComment: existing.classSupervisorComment,
            gradeSupervisorComment: existing.gradeSupervisorComment,
            principalComment: existing.principalComment,
            vicePrincipalComment: existing.vicePrincipalComment,
          }
        : { ...EMPTY_EDIT }
    );
    setExpandedStudentId(studentUid);
  };

  const handleSaveComments = async (studentUid: string) => {
    if (!user || !selectedTermId || !institutionId) return;
    setSavingStudentId(studentUid);
    setSaveError(null);
    setSavedStudentId(null);

    const academicYearId = terms.find((t) => t.id === selectedTermId)?.academicYearId ?? "";
    const existing = allComments[studentUid];
    const payload = {
      institutionId,
      studentId: studentUid,
      termId: selectedTermId,
      academicYearId,
      classSupervisorComment: editValues.classSupervisorComment,
      gradeSupervisorComment: editValues.gradeSupervisorComment,
      principalComment: editValues.principalComment,
      vicePrincipalComment: editValues.vicePrincipalComment,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    };

    try {
      if (existing) {
        await updateDoc(doc(db, "reportCardComments", existing.docId), payload);
      } else {
        await addDoc(collection(db, "reportCardComments"), payload);
      }
      setSavedStudentId(studentUid);
      setTimeout(
        () => setSavedStudentId((prev) => (prev === studentUid ? null : prev)),
        3000
      );
    } catch {
      setSaveError("Failed to save. Please try again.");
    } finally {
      setSavingStudentId(null);
    }
  };

  const hasDot = (studentUid: string, field: keyof EditValues) =>
    !!(allComments[studentUid]?.[field]?.trim());

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const selectedTerm = terms.find((t) => t.id === selectedTermId);

  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Bulk Class Comments</h1>
        {selectedClass && selectedTerm && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {selectedClass.name} · {selectedTerm.name}
          </p>
        )}
      </div>

      {/* Selectors */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Class</label>
          <select
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setExpandedStudentId(null);
              setSaveError(null);
            }}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 min-w-[200px]"
          >
            <option value="">— Select class —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Term</label>
          <select
            value={selectedTermId}
            onChange={(e) => {
              setSelectedTermId(e.target.value);
              setExpandedStudentId(null);
              setSaveError(null);
            }}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 min-w-[200px]"
          >
            <option value="">— Select term —</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {!selectedClassId || !selectedTermId ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-10">
          Select a class and term to view students.
        </p>
      ) : students.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-10">
          No students found in this class.
        </p>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/60">
                <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-200">
                  Student
                </th>
                <th className="text-center p-4 font-semibold text-gray-700 dark:text-gray-200 hidden md:table-cell">
                  {labels.classSupervisor}
                </th>
                <th className="text-center p-4 font-semibold text-gray-700 dark:text-gray-200 hidden md:table-cell">
                  {labels.gradeSupervisor}
                </th>
                <th className="text-center p-4 font-semibold text-gray-700 dark:text-gray-200 hidden md:table-cell">
                  {labels.principal}
                </th>
                <th className="text-center p-4 font-semibold text-gray-700 dark:text-gray-200 hidden md:table-cell">
                  {labels.vicePrincipal}
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <Fragment key={student.uid}>
                  <tr
                    onClick={() => handleExpandRow(student.uid)}
                    className="border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-lamaPurpleLight dark:hover:bg-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60"
                  >
                    <td className="p-4 font-medium text-gray-900 dark:text-gray-100">
                      {student.name}
                    </td>
                    {(
                      [
                        "classSupervisorComment",
                        "gradeSupervisorComment",
                        "principalComment",
                        "vicePrincipalComment",
                      ] as (keyof EditValues)[]
                    ).map((field) => (
                      <td key={field} className="text-center p-4 hidden md:table-cell">
                        <span
                          className={`inline-block h-3 w-3 rounded-full ${
                            hasDot(student.uid, field)
                              ? "bg-green-500"
                              : "bg-gray-300 dark:bg-gray-600"
                          }`}
                        />
                      </td>
                    ))}
                  </tr>

                  {expandedStudentId === student.uid && (
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <td
                        colSpan={5}
                        className="p-4 bg-gray-50 dark:bg-gray-900/50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-col gap-3 max-w-2xl">
                          {FIELDS.map(({ key, labelKey }) => (
                            <label
                              key={key}
                              className="flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-gray-200"
                            >
                              {labels[labelKey]}
                              <textarea
                                value={editValues[key]}
                                onChange={(e) =>
                                  setEditValues((prev) => ({ ...prev, [key]: e.target.value }))
                                }
                                rows={2}
                                maxLength={500}
                                className="mt-0.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400 resize-none"
                              />
                            </label>
                          ))}

                          {saveError && (
                            <p className="text-xs text-red-500">{saveError}</p>
                          )}

                          <div className="flex items-center gap-3 justify-end pt-1 border-t border-gray-100 dark:border-gray-700">
                            {savedStudentId === student.uid && (
                              <span className="text-xs text-green-600 dark:text-green-400">
                                Saved.
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveComments(student.uid);
                              }}
                              disabled={savingStudentId === student.uid}
                              className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
                            >
                              {savingStudentId === student.uid ? "Saving…" : "Save Comments"}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportCardCommentsPage;
