import { useState, useEffect, useMemo, useRef } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, type UserPhotoDocument } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import AccountStatusToggle from "@/components/AccountStatusToggle";
import SessionResetButton from "@/components/SessionResetButton";
import SendLoginEmailButton from "@/components/SendLoginEmailButton";
import DeleteUserButton from "@/components/DeleteUserButton";
import InactiveBadge from "@/components/InactiveBadge";
import type { CreateUserLocationState } from "@/components/forms/AdminCreateUserForm";
import { useAuth } from "@/lib/AuthContext";
import { useInstitutionUsers } from "@/hooks/useInstitutionUsers";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import Pagination from "@/components/Pagination";
import { Eye, Plus } from "lucide-react";
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
  // Carried so the edit form opens with them (they were missing, so an edit
  // blanked both) and so its audit entry can tell whether they changed.
  phone2?: string;
  idNumber?: string;
  grade: number;
  class: string;
  classId?: string;
  address: string;
  gender?: string;
  institutionId?: string;
  dateOfBirth?: string;
  institutionStudentId?: string;
  houseId?: string;
  status?: string;
};

const columns = [
  {
    header: "Name",
    accessor: "info",
  },
  {
    header: "Grade",
    accessor: "grade",
    className: "hidden md:table-cell",
  },
  {
    header: "Gender",
    accessor: "gender",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const StudentListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data: allUsers, isLoading: loading } = useInstitutionUsers();
  const { data: liveClasses = [] } = useInstitutionClasses();
  // classId → { name, grade }
  const classInfoById = useMemo(
    () => Object.fromEntries(liveClasses.map((c) => [c.id, { name: c.name, grade: c.grade }])),
    [liveClasses],
  );
  const liveStudents = useMemo<Student[]>(
    () =>
      (allUsers ?? [])
        .filter((u) => u.role === "student")
        .map((u) => ({
          id: u.id,
          uid: u.id,
          studentId: (u.institutionStudentId as string) || u.id,
          firstName: (u.firstName as string) ?? "",
          lastName: (u.lastName as string) ?? "",
          name: (u.name as string) ?? "—",
          email: u.email as string | undefined,
          photo: "/avatar.png",
          phone: u.phone as string | undefined,
          phone2: u.phone2 as string | undefined,
          idNumber: u.idNumber as string | undefined,
          grade: 0,
          class: (u.classId as string) ?? "—",
          classId: u.classId as string | undefined,
          address: (u.address as string) ?? "—",
          gender: u.gender as string | undefined,
          institutionId: u.institutionId as string,
          dateOfBirth: u.dateOfBirth as string | undefined,
          institutionStudentId: u.institutionStudentId as string | undefined,
          houseId: u.houseId as string | undefined,
          status: u.status as string | undefined,
        })),
    [allUsers],
  );

  const allStudents: Student[] = USE_MOCK ? (studentsData as unknown as Student[]) : liveStudents;
  const institutionFiltered = filterByInstitution(allStudents, USE_MOCK ? null : institutionId);

  const filteredData = useMemo(() => {
    let data = institutionFiltered;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter((s) => s.name.toLowerCase().includes(q));
    }
    return [...data].sort((a, b) => a.name.localeCompare(b.name));
  }, [institutionFiltered, search]);

  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Bounded per-page photo fetch (PHOTO_UPLOAD_SPEC.md §List-Table
  // Thumbnails): fetches at most PAGE_SIZE new uids per page view, never
  // more, regardless of institution size — the requestedPhotoUids ref (not
  // state) tracks what's already been requested so page navigation only
  // ever adds to the cache, never re-fetches an already-resolved uid.
  // getDoc, not onSnapshot — 20 extra real-time listeners per page view
  // would be worse than accepting the cache going stale until a remount.
  const [photoCache, setPhotoCache] = useState<Record<string, string | null>>({});
  const requestedPhotoUids = useRef<Set<string>>(new Set());

  const fetchPhoto = async (uid: string) => {
    requestedPhotoUids.current.add(uid);
    const snap = await getDoc(doc(db, "users", uid, "photo", "current"));
    const url = snap.exists() ? ((snap.data() as UserPhotoDocument).dataUrl ?? null) : null;
    setPhotoCache((prev) => ({ ...prev, [uid]: url }));
  };

  // Called via FormModal's onClose (StudentForm's edit modal) so a photo
  // upload/replace/remove is reflected immediately instead of staying stale
  // until the page is reloaded — bypasses the "already requested" guard
  // deliberately, since this is a targeted, on-demand refresh of one row,
  // not the bulk per-page fetch below.
  const refreshPhoto = (uid: string) => {
    void fetchPhoto(uid);
  };

  useEffect(() => {
    if (USE_MOCK) return;
    const uidsToFetch = paginatedData
      .map((s) => s.uid)
      .filter((uid) => !requestedPhotoUids.current.has(uid));
    // fetchPhoto itself marks each uid as requested (needed so refreshPhoto's
    // targeted, guard-bypassing calls stay correctly tracked too) — no need
    // to also mark them here before calling it.
    uidsToFetch.forEach((uid) => void fetchPhoto(uid));
  }, [paginatedData]);

  const renderRow = (item: Student) => {
    // classInfoById resolves the live-fetched grade; falls back to the
    // item's own grade (0 until the classes snapshot loads in live mode,
    // or the mock data's baked-in value).
    const classInfo = item.classId ? classInfoById[item.classId] : undefined;
    const displayGrade = classInfo?.grade ?? item.grade;
    // Mock mode keeps its existing baked-in stock photo (item.photo);
    // live mode uses the bounded per-page fetch below instead of the
    // hardcoded "/avatar.png" placeholder those rows used to carry.
    const photoSrc = USE_MOCK ? item.photo : photoCache[item.uid];

    return (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">
        {photoSrc ? (
          <img
            src={photoSrc}
            alt=""
            width={40}
            height={40}
            className="md:hidden xl:block w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex md:hidden xl:flex w-10 h-10 rounded-full bg-sky-500 items-center justify-center text-white text-sm font-semibold shrink-0">
            {(item.name[0] ?? "?").toUpperCase()}
          </div>
        )}
        <div className="flex flex-col">
          <h3 className="font-semibold">{item.name}</h3>
          <p className="text-xs text-gray-500">{item?.email}</p>
          <InactiveBadge status={item.status} />
        </div>
      </td>
      <td className="hidden md:table-cell">{displayGrade || "—"}</td>
      <td className="hidden md:table-cell">{item.gender ?? "—"}</td>
      <td>
        <div className="flex items-center gap-2">
          <Link to={`/dashboard/list/students/${item.id}`}>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--brand-button-bg, #0284c7)' }}
              title={`View ${item.name}'s details`}
              aria-label={`View ${item.name}'s details`}
            >
              <Eye className="w-4 h-4 text-white" />
            </button>
          </Link>
          {(role === "institution_admin" || role === "super_admin") && (
            <>
              <FormModal table="student" type="update" data={item} onClose={() => refreshPhoto(item.uid)} />
              <AccountStatusToggle uid={item.uid} name={item.name} status={item.status} institutionId={item.institutionId} />
              <SessionResetButton uid={item.uid} name={item.name} institutionId={item.institutionId} />
              <SendLoginEmailButton uid={item.uid} name={item.name} institutionId={item.institutionId} />
              <DeleteUserButton uid={item.uid} name={item.name} role="student" institutionId={item.institutionId} />
            </>
          )}
        </div>
      </td>
    </tr>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="hidden md:block text-lg font-semibold">All Students</h1>
        <input
          type="text"
          autoComplete="off"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name…"
          className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100 flex-1 min-w-40 max-w-xs"
        />
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin") && (
            <Link to="/dashboard/create-user" state={{ initialRole: "student" } satisfies CreateUserLocationState}>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--brand-button-bg, #0284c7)' }}
                title="Add new student"
                aria-label="Add new student"
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
            </Link>
          )}
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default StudentListPage;
