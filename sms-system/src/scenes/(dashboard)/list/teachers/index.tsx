import { useState, useEffect, useMemo, useRef } from "react";
import FormModal from "@/components/FormModal";
import AccountStatusToggle from "@/components/AccountStatusToggle";
import SessionResetButton from "@/components/SessionResetButton";
import SendLoginEmailButton from "@/components/SendLoginEmailButton";
import { fetchUserPhotoUrl } from "@/lib/userPhoto";
import DeleteUserButton from "@/components/DeleteUserButton";
import LoginLinkBadge from "@/components/LoginLinkBadge";
import FilterSelect from "@/components/FilterSelect";
import ResultCount from "@/components/ResultCount";
import { NONE, filterTeachersBySubject, validChoice } from "@/lib/listFilters";
import { getPersistedFilter, setPersistedFilter } from "@/lib/filterPersistence";
import { sortByNameNatural } from "@/lib/sortByName";
import { loginLinkState, toMillis, type LoginLinkState } from "@/lib/loginLinkStatus";
import InactiveBadge from "@/components/InactiveBadge";
import type { CreateUserLocationState } from "@/components/forms/AdminCreateUserForm";
import { useAuth } from "@/lib/AuthContext";
import { useInstitutionUsers } from "@/hooks/useInstitutionUsers";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useAllInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import { useInstitutionDepartments } from "@/hooks/useInstitutionDepartments";
import { Eye, Plus } from "lucide-react";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { teachersData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { Link } from "react-router-dom";

type Teacher = {
  id: string;
  name: string;
  email?: string;
  photo: string;
  subjects: string[];
  classes: string[];
  institutionId?: string;
  assignedClassId?: string;
  homeroomRoom?: string;
  homeroomBuilding?: string;
  departmentId?: string;
  status?: string;
  userRole?: string;
  loginState?: LoginLinkState;
  emailedAtMs?: number;
};

const columns = [
  {
    header: "Name",
    accessor: "info",
  },
  {
    header: "Subjects",
    accessor: "subjects",
    className: "hidden md:table-cell",
  },
  {
    header: "Homeroom",
    accessor: "classes",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const TeacherListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data: allUsers, isLoading: loading } = useInstitutionUsers();
  const { data: liveClasses = [] } = useInstitutionClasses();
  const { data: liveSubjects = [] } = useAllInstitutionSubjects();
  const { data: departments = [] } = useInstitutionDepartments();
  // Subject filter: remembered for the browser session; an id that no longer exists (or a
  // subject list that has not loaded yet) never hides everyone (lib/listFilters.ts).
  const [subjectChoice, setSubjectChoice] = useState(() => getPersistedFilter("teachers", "subject"));
  const subjectFilter =
    liveSubjects.length === 0 ? subjectChoice : validChoice(subjectChoice, liveSubjects.map((s) => s.id));
  const subjectOptions = useMemo(
    () => sortByNameNatural(liveSubjects, (s) => s.name).map((s) => ({ value: s.id, label: s.name })),
    [liveSubjects],
  );
  // A teacher with no department is invisible to senior teachers' views of
  // their notes and assignments — flag them so an admin can assign one. Only
  // meaningful where the institution has departments to choose from.
  const institutionHasDepartments = departments.length > 0;
  // uid → [subjectName, ...]
  const teacherSubjects = useMemo(() => {
    const map: Record<string, string[]> = {};
    liveSubjects.forEach((s) => {
      (s.teacherIds ?? []).forEach((tid) => {
        if (!map[tid]) map[tid] = [];
        map[tid].push(s.name);
      });
    });
    return map;
  }, [liveSubjects]);
  // classId → className
  const classNameById = useMemo(
    () => Object.fromEntries(liveClasses.map((c) => [c.id, c.name])),
    [liveClasses],
  );
  const liveTeachers = useMemo<Teacher[]>(
    () =>
      (allUsers ?? [])
        .filter((u) => u.role === "senior_teacher" || u.role === "regular_teacher")
        .map((u) => ({
          id: u.id,
          name: (u.name as string) ?? "—",
          email: u.email as string | undefined,
          photo: "/avatar.png",
          subjects: [],
          classes: [],
          institutionId: u.institutionId as string,
          assignedClassId: u.assignedClassId as string | undefined,
          homeroomRoom: u.homeroomRoom as string | undefined,
          homeroomBuilding: u.homeroomBuilding as string | undefined,
          // TeacherForm has written null for "no department"; the type here is string | undefined.
          departmentId: (u.departmentId as string | null | undefined) ?? undefined,
          status: u.status as string | undefined,
          userRole: u.role as string,
          loginState: loginLinkState({
            mustChangePassword: u.mustChangePassword as boolean | undefined,
            emailedAtMs: toMillis(u.credentialsEmailedAt),
          }) ?? undefined,
          emailedAtMs: toMillis(u.credentialsEmailedAt) ?? undefined,
        })),
    [allUsers],
  );

  const allTeachers: Teacher[] = USE_MOCK ? (teachersData as unknown as Teacher[]) : liveTeachers;
  const institutionFiltered = filterByInstitution(allTeachers, USE_MOCK ? null : institutionId);

  const filteredData = useMemo(() => {
    let data = filterTeachersBySubject(institutionFiltered, liveSubjects, subjectFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter((t) => t.name.toLowerCase().includes(q));
    }
    return [...data].sort((a, b) => a.name.localeCompare(b.name));
  }, [institutionFiltered, search, liveSubjects, subjectFilter]);

  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Bounded per-page photo fetch (PHOTO_UPLOAD_SPEC.md §List-Table
  // Thumbnails): fetches at most PAGE_SIZE new ids per page view, never
  // more, regardless of institution size — the requestedPhotoUids ref (not
  // state) tracks what's already been requested so page navigation only
  // ever adds to the cache, never re-fetches an already-resolved uid.
  // getDoc, not onSnapshot — 20 extra real-time listeners per page view
  // would be worse than accepting the cache going stale until a remount.
  const [photoCache, setPhotoCache] = useState<Record<string, string | null>>({});
  const requestedPhotoUids = useRef<Set<string>>(new Set());

  const fetchPhoto = async (uid: string, rowInstitutionId: string | undefined) => {
    requestedPhotoUids.current.add(uid);
    // A filtered query, not getDoc: reading a photo that does not exist is denied by the rules.
    const url = await fetchUserPhotoUrl(uid, rowInstitutionId).catch(() => null);
    setPhotoCache((prev) => ({ ...prev, [uid]: url }));
  };

  // Called via FormModal's onClose (TeacherForm's edit modal) so a photo
  // upload/replace/remove is reflected immediately instead of staying stale
  // until the page is reloaded — bypasses the "already requested" guard
  // deliberately, since this is a targeted, on-demand refresh of one row,
  // not the bulk per-page fetch below.
  const refreshPhoto = (uid: string, rowInstitutionId: string | undefined) => {
    void fetchPhoto(uid, rowInstitutionId);
  };

  useEffect(() => {
    if (USE_MOCK) return;
    const rowsToFetch = paginatedData.filter((t) => !requestedPhotoUids.current.has(t.id));
    // fetchPhoto itself marks each uid as requested (needed so refreshPhoto's
    // targeted, guard-bypassing calls stay correctly tracked too) — no need
    // to also mark them here before calling it.
    rowsToFetch.forEach((t) => void fetchPhoto(t.id, t.institutionId));
  }, [paginatedData]);

  const renderRow = (item: Teacher) => {
    // Mock mode keeps its existing baked-in stock photo (item.photo);
    // live mode uses the bounded per-page fetch above instead of the
    // hardcoded "/avatar.png" placeholder those rows used to carry.
    const photoSrc = USE_MOCK ? item.photo : photoCache[item.id];

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
            loading="lazy"
            decoding="async"
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
          <LoginLinkBadge state={item.loginState} emailedAtMs={item.emailedAtMs} />
          {!USE_MOCK && institutionHasDepartments && !item.departmentId && (
            <span
              className="mt-1 w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
              title="Senior teachers can't see this teacher's notes or assignments until a department is assigned."
            >
              No department
            </span>
          )}
        </div>
      </td>
      <td className="hidden md:table-cell">
        {(teacherSubjects[item.id] ?? []).join(", ") || "N/A"}
      </td>
      <td className="hidden md:table-cell">
        {item.assignedClassId ? (
          <div className="flex flex-col">
            <span>{classNameById[item.assignedClassId] ?? item.assignedClassId}</span>
            {item.homeroomRoom && (
              <span className="text-xs text-gray-500">
                Room {item.homeroomRoom}
                {item.homeroomBuilding ? `, ${item.homeroomBuilding}` : ""}
              </span>
            )}
          </div>
        ) : (
          "N/A"
        )}
      </td>
      <td>
        <div className="flex items-center gap-2">
          <Link to={`/dashboard/list/teachers/${item.id}`}>
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
              <FormModal table="teacher" type="update" data={item} onClose={() => refreshPhoto(item.id, item.institutionId)} />
              <AccountStatusToggle uid={item.id} name={item.name} status={item.status} institutionId={item.institutionId} />
              <SessionResetButton uid={item.id} name={item.name} institutionId={item.institutionId} />
              <SendLoginEmailButton uid={item.id} name={item.name} institutionId={item.institutionId} />
              {item.userRole && (
                <DeleteUserButton uid={item.id} name={item.name} role={item.userRole} institutionId={item.institutionId} />
              )}
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="hidden md:block text-lg font-semibold">All Teachers</h1>
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
        <FilterSelect
          label="Subject"
          allLabel="All subjects"
          noneOption={{ value: NONE, label: "No subjects" }}
          options={subjectOptions}
          value={subjectFilter}
          onChange={(v) => {
            setSubjectChoice(v);
            setPersistedFilter("teachers", "subject", v);
            setPage(1);
          }}
        />
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin") && (
            <Link to="/dashboard/create-user" state={{ initialRole: "senior_teacher" } satisfies CreateUserLocationState}>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--brand-button-bg, #0284c7)' }}
                title="Add new teacher"
                aria-label="Add new teacher"
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
            </Link>
          )}
        </div>
        <ResultCount matching={filteredData.length} total={institutionFiltered.length} page={page} singular="teacher" plural="teachers" loading={loading} />
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default TeacherListPage;
