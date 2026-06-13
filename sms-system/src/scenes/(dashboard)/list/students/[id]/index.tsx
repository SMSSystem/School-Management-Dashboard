import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { UserDocument } from "@/lib/firebase";

type Student = UserDocument & { uid: string; email?: string };

type House = { id: string; name: string };
type Term = { id: string; name: string };

const SingleStudentPage = () => {
  const { id } = useParams<{ id: string }>();
  const { role, institutionId } = useAuth();

  const [student, setStudent] = useState<Student | null>(null);
  const [studentLoading, setStudentLoading] = useState(true);

  const [houses, setHouses] = useState<House[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState("");

  // Edit panel state
  const [editOpen, setEditOpen] = useState(false);
  const [editStudentId, setEditStudentId] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editHouseId, setEditHouseId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dobError, setDobError] = useState<string | null>(null);
  const [studentIdError, setStudentIdError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, "users", id), (snap) => {
      setStudentLoading(false);
      if (snap.exists()) {
        setStudent({ uid: snap.id, ...snap.data() } as Student);
      } else {
        setStudent(null);
      }
    });
  }, [id]);

  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    return onSnapshot(
      query(collection(db, "houses"), where("institutionId", "==", institutionId)),
      (snap) =>
        setHouses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })))
    );
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    return onSnapshot(
      query(collection(db, "terms"), where("institutionId", "==", institutionId)),
      (snap) =>
        setTerms(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })))
    );
  }, [institutionId]);

  const openEdit = () => {
    if (!student) return;
    setEditStudentId(student.institutionStudentId ?? "");
    setEditDob(student.dateOfBirth ?? "");
    setEditHouseId(student.houseId ?? "");
    setDobError(null);
    setStudentIdError(null);
    setSaveError(null);
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!id) return;
    setDobError(null);
    setStudentIdError(null);
    setSaveError(null);

    const dobTrimmed = editDob.trim();
    if (dobTrimmed && !/^\d{4}-\d{2}-\d{2}$/.test(dobTrimmed)) {
      setDobError("Date must be in YYYY-MM-DD format.");
      return;
    }

    setSaving(true);
    try {
      const houseName = editHouseId
        ? houses.find((h) => h.id === editHouseId)?.name ?? null
        : null;

      await updateDoc(doc(db, "users", id), {
        institutionStudentId: editStudentId.trim() || null,
        dateOfBirth: dobTrimmed || null,
        houseId: editHouseId || null,
        houseName,
      });
      setEditOpen(false);
    } catch {
      setSaveError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (studentLoading) {
    return <div className="p-8 text-center text-sm text-gray-500">Loading…</div>;
  }

  if (!student) {
    return (
      <div className="p-8 text-center flex flex-col items-center gap-3">
        <p className="text-gray-500">Student not found.</p>
        <Link to="/list/students" className="text-sky-600 underline text-sm">
          ← Back to Students
        </Link>
      </div>
    );
  }

  const infoRows: { label: string; value: string | null | undefined }[] = [
    { label: "Class", value: student.classId },
    { label: "House", value: student.houseName },
    { label: "Date of Birth", value: student.dateOfBirth },
    { label: "Student ID", value: student.institutionStudentId },
    { label: "Status", value: student.status },
    { label: "Phone", value: student.phone },
    { label: "Email", value: (student as Student & { email?: string }).email },
  ];

  return (
    <div className="p-4 flex flex-col gap-4">
      <Link
        to="/list/students"
        className="text-sm text-sky-600 hover:underline self-start"
      >
        ← Back to Students
      </Link>

      {/* Student info card */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-md flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{student.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Student</p>
          </div>
          {role === "institution_admin" && (
            <button
              className="text-sm text-sky-600 hover:underline shrink-0"
              onClick={openEdit}
            >
              Edit
            </button>
          )}
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {infoRows.map(({ label, value }) => (
            <div key={label} className="flex gap-2">
              <dt className="font-medium text-gray-500 dark:text-gray-400 w-32 shrink-0">
                {label}
              </dt>
              <dd className="text-gray-900 dark:text-gray-100">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

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

      {/* Edit panel */}
      {editOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-sm flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Edit Student Details</h2>

            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-gray-200">
              Student ID{" "}
              <span className="font-normal text-gray-400">(optional)</span>
              <input
                type="text"
                maxLength={50}
                value={editStudentId}
                onChange={(e) => {
                  setEditStudentId(e.target.value);
                  setStudentIdError(null);
                }}
                className="mt-0.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
              />
              {studentIdError && (
                <span className="text-xs text-red-500">{studentIdError}</span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-gray-200">
              Date of Birth
              <input
                type="date"
                value={editDob}
                onChange={(e) => {
                  setEditDob(e.target.value);
                  setDobError(null);
                }}
                className="mt-0.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
              />
              {dobError && (
                <span className="text-xs text-red-500">{dobError}</span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-gray-200">
              House
              <select
                value={editHouseId}
                onChange={(e) => setEditHouseId(e.target.value)}
                className="mt-0.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
              >
                <option value="">— None —</option>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>

            {saveError && (
              <p className="text-sm text-red-500 text-center">{saveError}</p>
            )}

            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
                onClick={() => setEditOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="bg-sky-600 text-white py-2 px-4 rounded-md text-sm disabled:opacity-50"
                onClick={handleSave}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SingleStudentPage;
