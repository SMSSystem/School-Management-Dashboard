import { useState, useEffect } from "react";
import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where,
} from "firebase/firestore";
import { db, DayKey, DaySchedule, UserDocument } from "@/lib/firebase";
import { canGenerateSchedule } from "@/lib/permissions";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { lessonsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";

type Lesson = {
  id: string;
  subjectName: string;
  className: string;
  teacherName: string;
  schedule?: Partial<Record<DayKey, DaySchedule>>;
  frequency?: string;
  lessonType?: string;
  institutionId?: string;
};

type FormFieldValue = string | number | readonly string[] | undefined;

const columns = [
  { header: "Subject",   accessor: "subjectName" },
  { header: "Class",     accessor: "className" },
  { header: "Teacher",   accessor: "teacherName",  className: "hidden md:table-cell" },
  { header: "Days",      accessor: "days",          className: "hidden md:table-cell" },
  { header: "Frequency", accessor: "frequency",     className: "hidden lg:table-cell" },
  { header: "Actions",   accessor: "action" },
];

const LessonListPage = () => {
  const { user, role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveLessons, setLiveLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);
  const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>('');
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);

  const canManage = canGenerateSchedule(role ?? '', userDoc);

  // Fetch user doc for canGenerateSchedule check
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists()) setUserDoc(snap.data() as UserDocument);
    });
  }, [user]);

  // Fetch terms for the term selector
  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === '*') return;
    getDocs(
      query(collection(db, 'terms'), where('institutionId', '==', institutionId), orderBy('startDate', 'desc')),
    ).then((snap) => {
      const loaded = snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? '') }));
      setTerms(loaded);
      if (loaded.length > 0) setSelectedTermId(loaded[0].id);
    });
  }, [institutionId]);

  // Subscribe to timetable_slots filtered by term
  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === '*' || !selectedTermId) return;
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'timetable_slots'),
        where('institutionId', '==', institutionId),
        where('termId', '==', selectedTermId),
      ),
      (snap) => {
        setLiveLessons(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson)));
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [institutionId, selectedTermId]);

  const allLessons: Lesson[] = USE_MOCK ? (lessonsData as unknown as Lesson[]) : liveLessons;
  const filteredData = filterByInstitution(allLessons, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Lesson) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.subjectName}</td>
      <td>{item.className}</td>
      <td className="hidden md:table-cell">{item.teacherName}</td>
      <td className="hidden md:table-cell">
        {Object.keys(item.schedule ?? {}).join(', ') || '—'}
      </td>
      <td className="hidden lg:table-cell">{item.frequency || '—'}</td>
      <td>
        <div className="flex items-center gap-2">
          {canManage && (
            <FormModal table="lesson" type="update" data={item as unknown as Record<string, FormFieldValue>} />
          )}
          {canManage && (
            <FormModal table="lesson" type="delete" id={item.id} />
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="hidden md:block text-lg font-semibold">All Lessons</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {!USE_MOCK && (
            <select
              className="ring-[1.5px] ring-gray-300 dark:ring-gray-600 dark:bg-gray-700 dark:text-white p-2 rounded-md text-sm"
              value={selectedTermId}
              onChange={(e) => { setSelectedTermId(e.target.value); setPage(1); }}
            >
              <option value="">Select a term</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          {canManage && <FormModal table="lesson" type="create" />}
        </div>
      </div>
      {/* LIST */}
      {!USE_MOCK && !selectedTermId ? (
        <p className="text-sm text-gray-400 italic mt-6">Select a term to view lessons.</p>
      ) : (
        <Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />
      )}
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default LessonListPage;
