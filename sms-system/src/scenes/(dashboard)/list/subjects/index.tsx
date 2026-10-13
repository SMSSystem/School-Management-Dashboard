import { useState, useEffect, useMemo } from "react";
import { onSnapshot } from "firebase/firestore";
import { type SubjectDocument } from "@/lib/firebase";
import { institutionCollection } from "@/lib/paths";
import FormModal from "@/components/FormModal";
import ViewDetailsButton from "@/components/ViewDetailsButton";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { subjectsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { formatSubjectFrequency } from "@/lib/subjectFrequency";
import FilterSelect from "@/components/FilterSelect";
import { NONE, filterSubjectsByTeacher, teacherOptions, validChoice } from "@/lib/listFilters";
import { getPersistedFilter, setPersistedFilter } from "@/lib/filterPersistence";
import { sortByNameNatural } from "@/lib/sortByName";
import { formatSubjectTeachers } from "@/lib/subjectTeachers";

type Subject = SubjectDocument & { id: string };

const columns = [
  {
    header: "Subject Name",
    accessor: "name",
  },
  {
    header: "Teachers",
    accessor: "teachers",
    className: "hidden md:table-cell",
  },
  {
    header: "Attendance Frequency",
    accessor: "frequency",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const SubjectListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveSubjects, setLiveSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      institutionCollection(institutionId, "subjects"),
      (snap) => {
        setLiveSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [institutionId]);

  const allSubjects: Subject[] = USE_MOCK ? (subjectsData as unknown as Subject[]) : liveSubjects;
  // Teacher filter: remembered for the browser session; a teacher no longer on any subject
  // falls back to "All" (lib/listFilters.ts). The options come from the subjects themselves,
  // so no users are read.
  const [teacherChoice, setTeacherChoice] = useState(() => getPersistedFilter("subjects", "teacher"));
  const teacherChoices = useMemo(() => teacherOptions(allSubjects), [allSubjects]);
  const teacherFilter =
    teacherChoices.length === 0 ? teacherChoice : validChoice(teacherChoice, teacherChoices.map((t) => t.id));
  // Natural order (digits first, 2 before 10), sorted before the page is sliced.
  const filteredData = useMemo(
    () =>
      sortByNameNatural(
        filterSubjectsByTeacher(filterByInstitution(allSubjects, USE_MOCK ? null : institutionId), teacherFilter),
        (s) => s.name ?? "",
      ),
    [allSubjects, institutionId, teacherFilter],
  );
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Subject) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.name}</td>
      <td className="hidden md:table-cell">{item.teacherNames
          ? formatSubjectTeachers(item)
          : ((item as unknown as { teachers?: string[] }).teachers ?? []).join(", ")}</td>
      <td className="hidden md:table-cell">{formatSubjectFrequency(item)}</td>
      <td>
        <div className="flex items-center gap-2">
          {!USE_MOCK && <ViewDetailsButton to={`/dashboard/list/subjects/${item.id}`} name={item.name} />}
          {(role === "institution_admin" || role === "super_admin") && (
            <>
              <FormModal table="subject" type="update" data={item as unknown as Record<string, string | number | readonly string[] | undefined>} />
              <FormModal table="subject" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="hidden md:block text-lg font-semibold">All Subjects</h1>
        <FilterSelect
          label="Teacher"
          allLabel="All teachers"
          noneOption={{ value: NONE, label: "No teacher" }}
          options={teacherChoices.map((t) => ({ value: t.id, label: t.name }))}
          value={teacherFilter}
          onChange={(v) => {
            setTeacherChoice(v);
            setPersistedFilter("subjects", "teacher", v);
            setPage(1);
          }}
        />
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin") && <FormModal table="subject" type="create" />}
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default SubjectListPage;
