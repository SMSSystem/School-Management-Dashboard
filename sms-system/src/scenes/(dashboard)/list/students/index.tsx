import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { studentsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { Link } from "react-router-dom";

type Student = {
  id: string;
  uid: string;
  studentId: string;
  firstName: string;
  lastName: string;
  name: string;
  email?: string;
  photo: string;
  phone?: string;
  grade: number;
  class: string;
  classId?: string;
  address: string;
  institutionId?: string;
  dateOfBirth?: string;
  institutionStudentId?: string;
  houseId?: string;
};

const columns = [
  {
    header: "Info",
    accessor: "info",
  },
  {
    header: "Student ID",
    accessor: "studentId",
    className: "hidden md:table-cell",
  },
  {
    header: "Grade",
    accessor: "grade",
    className: "hidden md:table-cell",
  },
  {
    header: "Phone",
    accessor: "phone",
    className: "hidden lg:table-cell",
  },
  {
    header: "Address",
    accessor: "address",
    className: "hidden lg:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const StudentListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveStudents, setLiveStudents] = useState<Student[]>([]);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      query(collection(db, "users"), where("institutionId", "==", institutionId)),
      (snap) => {
        const students = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>))
          .filter((u) => u.role === "student")
          .map((u) => ({
            id: u.id as string,
            uid: u.id as string,
            studentId: (u.institutionStudentId as string) || (u.id as string),
            firstName: (u.firstName as string) ?? "",
            lastName: (u.lastName as string) ?? "",
            name: (u.name as string) ?? "—",
            email: u.email as string | undefined,
            photo: "/avatar.png",
            phone: u.phone as string | undefined,
            grade: 0,
            class: (u.classId as string) ?? "—",
            classId: u.classId as string | undefined,
            address: (u.address as string) ?? "—",
            institutionId: u.institutionId as string,
            dateOfBirth: u.dateOfBirth as string | undefined,
            institutionStudentId: u.institutionStudentId as string | undefined,
            houseId: u.houseId as string | undefined,
          }));
        setLiveStudents(students);
      }
    );
    return unsubscribe;
  }, [institutionId]);

  const allStudents: Student[] = USE_MOCK ? (studentsData as unknown as Student[]) : liveStudents;
  const filteredData = filterByInstitution(allStudents, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Student) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">
        <img
          src={item.photo}
          alt=""
          width={40}
          height={40}
          className="md:hidden xl:block w-10 h-10 rounded-full object-cover"
        />
        <div className="flex flex-col">
          <h3 className="font-semibold">{item.name}</h3>
          <p className="text-xs text-gray-500">{item.class}</p>
        </div>
      </td>
      <td className="hidden md:table-cell">{item.studentId}</td>
      <td className="hidden md:table-cell">{item.grade || "—"}</td>
      <td className="hidden md:table-cell">{item.phone}</td>
      <td className="hidden md:table-cell">{item.address}</td>
      <td>
        <div className="flex items-center gap-2">
          <Link to={`/list/students/${item.id}`}>
            <button className="w-7 h-7 flex items-center justify-center rounded-full bg-lamaSky">
              <img src="/view.png" alt="" width={16} height={16} />
            </button>
          </Link>
          {(role === "institution_admin" || role === "super_admin") && (
            <>
              <FormModal table="student" type="update" data={item} />
              <FormModal table="student" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Students</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin") && (
            <Link to="/create-user">
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
                <img src="/create.png" alt="" width={14} height={14} />
              </button>
            </Link>
          )}
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default StudentListPage;
