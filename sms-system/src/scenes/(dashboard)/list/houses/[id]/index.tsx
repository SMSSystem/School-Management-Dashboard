import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import FormModal from "@/components/FormModal";
import Table from "@/components/Table";

type House = {
  id: string;
  name: string;
  description?: string;
  institutionId: string;
};

type AssignedStudent = {
  uid: string;
  name: string;
  classId?: string | null;
  institutionStudentId?: string | null;
};

type AllStudent = {
  uid: string;
  name: string;
  houseId?: string | null;
  houseName?: string | null;
  classId?: string | null;
  institutionStudentId?: string | null;
};

const assignedColumns = [
  { header: "Student Name", accessor: "name" },
  { header: "Class", accessor: "classId", className: "hidden md:table-cell" },
  { header: "Student ID", accessor: "institutionStudentId", className: "hidden md:table-cell" },
];

const HouseDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { role, institutionId } = useAuth();

  const [house, setHouse] = useState<House | null>(null);
  const [houseLoading, setHouseLoading] = useState(true);
  const [assignedStudents, setAssignedStudents] = useState<AssignedStudent[]>([]);

  // Manage panel state
  const [manageOpen, setManageOpen] = useState(false);
  const [allStudents, setAllStudents] = useState<AllStudent[]>([]);
  const [allStudentsLoading, setAllStudentsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, "houses", id), (snap) => {
      setHouseLoading(false);
      if (snap.exists()) {
        setHouse({ id: snap.id, ...snap.data() } as House);
      } else {
        setHouse(null);
      }
    });
  }, [id]);

  useEffect(() => {
    if (!id || !institutionId || institutionId === "*") return;
    return onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("houseId", "==", id),
        where("role", "==", "student"),
      ),
      (snap) =>
        setAssignedStudents(
          snap.docs.map((d) => ({
            uid: d.id,
            name: d.data().name as string,
            classId: (d.data().classId as string | null | undefined) ?? null,
            institutionStudentId: (d.data().institutionStudentId as string | null | undefined) ?? null,
          }))
        )
    );
  }, [id, institutionId]);

  useEffect(() => {
    if (!manageOpen || !institutionId || institutionId === "*") return;
    setAllStudentsLoading(true);
    getDocs(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "student"),
      )
    ).then((snap) => {
      const students: AllStudent[] = snap.docs.map((d) => ({
        uid: d.id,
        name: d.data().name as string,
        houseId: (d.data().houseId as string | null | undefined) ?? null,
        houseName: (d.data().houseName as string | null | undefined) ?? null,
        classId: (d.data().classId as string | null | undefined) ?? null,
        institutionStudentId: (d.data().institutionStudentId as string | null | undefined) ?? null,
      }));
      students.sort((a, b) => a.name.localeCompare(b.name));
      setAllStudents(students);
      setSelected(new Set(students.filter((s) => s.houseId === id).map((s) => s.uid)));
      setAllStudentsLoading(false);
    });
  }, [manageOpen, institutionId, id]);

  const handleSaveAssignments = async () => {
    if (!house || !id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const originallyInHouse = new Set(
        allStudents.filter((s) => s.houseId === id).map((s) => s.uid)
      );
      const toAdd = [...selected].filter((uid) => !originallyInHouse.has(uid));
      const toRemove = [...originallyInHouse].filter((uid) => !selected.has(uid));

      if (toAdd.length > 0 || toRemove.length > 0) {
        const batch = writeBatch(db);
        toAdd.forEach((uid) =>
          batch.update(doc(db, "users", uid), { houseId: id, houseName: house.name })
        );
        toRemove.forEach((uid) =>
          batch.update(doc(db, "users", uid), { houseId: null, houseName: null })
        );
        await batch.commit();
      }
      setManageOpen(false);
    } catch {
      setSaveError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const renderAssignedRow = (item: AssignedStudent) => (
    <tr
      key={item.uid}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="p-4">{item.name}</td>
      <td className="hidden md:table-cell p-4">{item.classId ?? "—"}</td>
      <td className="hidden md:table-cell p-4">{item.institutionStudentId ?? "—"}</td>
    </tr>
  );

  if (houseLoading) {
    return <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>;
  }

  if (!house) {
    return (
      <div className="p-8 text-center flex flex-col items-center gap-3">
        <p className="text-gray-500">House not found.</p>
        <Link to="/dashboard/list/houses" className="text-sky-600 underline text-sm">
          ← Back to Houses
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <Link
        to="/dashboard/list/houses"
        className="text-sm text-sky-600 hover:underline self-start"
      >
        ← Back to Houses
      </Link>

      {/* House info card */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-md flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold flex-1">{house.name}</h1>
          {role === "institution_admin" && (
            <FormModal table="house" type="update" data={house} />
          )}
        </div>
        {house.description ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">{house.description}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">No description.</p>
        )}
      </div>

      {/* Assigned students */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">
            Assigned Students ({assignedStudents.length})
          </h2>
          {role === "institution_admin" && (
            <button
              className="bg-lamaYellow text-sm px-4 py-1.5 rounded-md hover:opacity-90"
              onClick={() => { setSaveError(null); setManageOpen(true); }}
            >
              Manage Students
            </button>
          )}
        </div>

        {assignedStudents.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No students assigned to this house yet.
          </p>
        ) : (
          <Table
            columns={assignedColumns}
            renderRow={renderAssignedRow}
            data={assignedStudents}
          />
        )}
      </div>

      {/* Manage Students overlay */}
      {manageOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-lg flex flex-col gap-4 max-h-[85dvh]">
            <div>
              <h2 className="text-lg font-semibold">Manage Students — {house.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Check a student to assign them to this house. Students in another house will be moved automatically.
              </p>
            </div>

            {allStudentsLoading ? (
              <p className="text-sm text-center text-gray-500 py-6">Loading students…</p>
            ) : allStudents.length === 0 ? (
              <p className="text-sm text-center text-gray-500 py-6">
                No students found in this institution.
              </p>
            ) : (
              <div className="overflow-y-auto flex-1 flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
                {allStudents.map((student) => {
                  const isChecked = selected.has(student.uid);
                  const inOtherHouse = student.houseId && student.houseId !== id;
                  return (
                    <label
                      key={student.uid}
                      className="flex items-start gap-3 py-2.5 px-1 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={isChecked}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(student.uid);
                            else next.delete(student.uid);
                            return next;
                          });
                        }}
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{student.name}</span>
                        {inOtherHouse && isChecked && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            Will be moved from {student.houseName ?? "another house"}.
                          </span>
                        )}
                        {inOtherHouse && !isChecked && (
                          <span className="text-xs text-gray-400">
                            Currently in {student.houseName ?? "another house"}.
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {saveError && (
              <p className="text-sm text-red-500 text-center">{saveError}</p>
            )}

            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
                onClick={() => { setManageOpen(false); setSaveError(null); }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || allStudentsLoading}
                className="bg-blue-500 text-white py-2 px-4 rounded-md text-sm disabled:opacity-50"
                onClick={handleSaveAssignments}
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

export default HouseDetailPage;
