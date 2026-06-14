import { lazy, Suspense, useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import Pagination from '@/components/Pagination';
import Table from '@/components/Table';
import { PAGE_SIZE } from '@/lib/utils';
import { generateReportCard } from '@/lib/generateReportCard';
import type { ReportCardDocument } from '@/lib/firebase';

const ReportCardPDFModal = lazy(() => import('@/components/reportCard/ReportCardPDFModal'));

type CardRow = ReportCardDocument & { id: string };
type GenMode = 'single' | 'batch';
type BatchProgress = { done: number; total: number; errors: string[] };

const columns = [
  { header: 'Student', accessor: 'studentName' },
  { header: 'Term', accessor: 'termName' },
  { header: 'Class', accessor: 'className', className: 'hidden md:table-cell' },
  { header: 'GPA', accessor: 'gpa', className: 'hidden md:table-cell' },
  { header: 'Generated', accessor: 'generatedAt', className: 'hidden md:table-cell' },
  { header: 'Actions', accessor: 'action' },
];

const SELECT_CLS =
  'border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 flex-1';

const BTN_CANCEL =
  'px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-sm rounded-md transition-colors';

const ReportCardsPage = () => {
  const { user, role, institutionId } = useAuth();
  const [page, setPage] = useState(1);

  const [cards, setCards] = useState<CardRow[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [linkedStudentIds, setLinkedStudentIds] = useState<string[]>([]);

  const [showPanel, setShowPanel] = useState(false);
  const [genMode, setGenMode] = useState<GenMode>('single');
  const [genStudentId, setGenStudentId] = useState('');
  const [genTermId, setGenTermId] = useState('');
  const [batchClassId, setBatchClassId] = useState('');
  const [batchTermId, setBatchTermId] = useState('');

  const [generating, setGenerating] = useState(false);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelWarnings, setPanelWarnings] = useState<string[]>([]);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  const [pdfCard, setPdfCard] = useState<CardRow | null>(null);

  const isAdmin = role === 'institution_admin';

  // Load dropdown data for admin generate panels
  useEffect(() => {
    if (!isAdmin || !institutionId || institutionId === '*') return;
    getDocs(
      query(
        collection(db, 'users'),
        where('role', '==', 'student'),
        where('institutionId', '==', institutionId),
      ),
    ).then((snap) =>
      setStudents(
        snap.docs
          .map((d) => ({ id: d.id, name: d.data().name as string }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
    getDocs(query(collection(db, 'terms'), where('institutionId', '==', institutionId))).then(
      (snap) => setTerms(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
    );
    getDocs(query(collection(db, 'classes'), where('institutionId', '==', institutionId))).then(
      (snap) =>
        setClasses(
          snap.docs
            .map((d) => ({ id: d.id, name: d.data().name as string }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
    );
  }, [isAdmin, institutionId]);

  // Resolve linked children for parent role
  useEffect(() => {
    if (role !== 'parent' || !user) return;
    getDocs(
      query(collection(db, 'student_parents'), where('parentId', '==', user.uid)),
    ).then((snap) =>
      setLinkedStudentIds(snap.docs.map((d) => d.id.replace(`${user.uid}_`, ''))),
    );
  }, [role, user]);

  // Subscribe to reportCards, role-scoped
  useEffect(() => {
    if (!institutionId || institutionId === '*') return;

    let q;
    if (role === 'student' && user?.uid) {
      q = query(
        collection(db, 'reportCards'),
        where('institutionId', '==', institutionId),
        where('studentId', '==', user.uid),
      );
    } else if (role === 'parent') {
      if (linkedStudentIds.length === 0) {
        setCards([]);
        return;
      }
      q = query(
        collection(db, 'reportCards'),
        where('institutionId', '==', institutionId),
        where('studentId', 'in', linkedStudentIds.slice(0, 10)),
      );
    } else {
      q = query(
        collection(db, 'reportCards'),
        where('institutionId', '==', institutionId),
      );
    }

    return onSnapshot(q, (snap) =>
      setCards(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CardRow))),
    );
  }, [institutionId, role, user, linkedStudentIds]);

  const handleGenerate = async () => {
    if (!genStudentId || !genTermId || !user || !institutionId) return;
    setGenerating(true);
    setPanelError(null);
    setPanelWarnings([]);
    const result = await generateReportCard({
      studentId: genStudentId,
      termId: genTermId,
      institutionId,
      generatedBy: user.uid,
      generatedByRole: role!,
    });
    setGenerating(false);
    if (result.ok) {
      setPanelWarnings(result.warnings);
      if (result.warnings.length === 0) {
        setShowPanel(false);
        setGenStudentId('');
        setGenTermId('');
      }
    } else {
      setPanelError(result.error);
    }
  };

  const handleBatchGenerate = async () => {
    if (!batchClassId || !batchTermId || !user || !institutionId) return;
    setGenerating(true);
    setPanelError(null);
    setPanelWarnings([]);
    setBatchProgress(null);

    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('institutionId', '==', institutionId),
        where('classId', '==', batchClassId),
        where('role', '==', 'student'),
      ),
    );
    const studentIds = snap.docs.map((d) => d.id);

    if (studentIds.length === 0) {
      setPanelError('No students found in the selected class.');
      setGenerating(false);
      return;
    }

    const progress: BatchProgress = { done: 0, total: studentIds.length, errors: [] };
    setBatchProgress({ ...progress });

    for (const studentId of studentIds) {
      const result = await generateReportCard({
        studentId,
        termId: batchTermId,
        institutionId,
        generatedBy: user.uid,
        generatedByRole: role!,
        generatedViaBatch: true,
      });
      progress.done += 1;
      if (!result.ok) progress.errors = [...progress.errors, result.error];
      setBatchProgress({ ...progress });
    }

    setGenerating(false);
  };

  const handleRegenerate = async (card: CardRow) => {
    if (!user || !institutionId) return;
    setRegenId(card.id);
    setRegenError(null);
    const result = await generateReportCard({
      studentId: card.studentId,
      termId: card.termId,
      institutionId,
      generatedBy: user.uid,
      generatedByRole: role!,
    });
    setRegenId(null);
    if (!result.ok) setRegenError(result.error);
  };

  const closePanel = () => {
    setShowPanel(false);
    setPanelError(null);
    setPanelWarnings([]);
    setBatchProgress(null);
  };

  const paginatedCards = cards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: CardRow) => {
    const genDate = item.generatedAt?.toDate?.()?.toLocaleDateString() ?? '—';
    return (
      <tr
        key={item.id}
        className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
      >
        <td className="flex items-center gap-4 p-4">{item.studentName}</td>
        <td>{item.termName}</td>
        <td className="hidden md:table-cell">{item.className}</td>
        <td className="hidden md:table-cell">
          {item.gpa !== null ? item.gpa.toFixed(2) : '—'}
        </td>
        <td className="hidden md:table-cell">{genDate}</td>
        <td>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => handleRegenerate(item)}
                disabled={regenId === item.id}
                className="text-xs bg-lamaYellow hover:bg-yellow-300 text-gray-700 px-2 py-1 rounded transition-colors disabled:opacity-50"
              >
                {regenId === item.id ? 'Generating…' : 'Re-generate'}
              </button>
            )}
            <button
              onClick={() => setPdfCard(item)}
              className="text-xs bg-sky-100 hover:bg-sky-200 text-sky-700 px-2 py-1 rounded transition-colors"
            >
              PDF
            </button>
          </div>
        </td>
      </tr>
    );
  };

  if (institutionId === '*') {
    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
        <h1 className="text-lg font-semibold mb-4">Report Cards</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select an institution to view report cards.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">Report Cards</h1>
        {isAdmin && (
          <button
            onClick={() => {
              setShowPanel((p) => !p);
              setPanelError(null);
              setPanelWarnings([]);
              setBatchProgress(null);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow"
            title="Generate Report Card"
          >
            <img src="/create.png" alt="Generate" width={14} height={14} />
          </button>
        )}
      </div>

      {/* Generate Panel */}
      {showPanel && isAdmin && (
        <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setGenMode('single')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                genMode === 'single'
                  ? 'bg-sky-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Single Student
            </button>
            <button
              onClick={() => setGenMode('batch')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                genMode === 'batch'
                  ? 'bg-sky-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Batch (Class)
            </button>
          </div>

          {genMode === 'single' ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={genStudentId}
                onChange={(e) => setGenStudentId(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">Select student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={genTermId}
                onChange={(e) => setGenTermId(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">Select term…</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleGenerate}
                disabled={!genStudentId || !genTermId || generating}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-md transition-colors disabled:opacity-50"
              >
                {generating ? 'Generating…' : 'Generate'}
              </button>
              <button onClick={closePanel} className={BTN_CANCEL}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={batchClassId}
                  onChange={(e) => setBatchClassId(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="">Select class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={batchTermId}
                  onChange={(e) => setBatchTermId(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="">Select term…</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleBatchGenerate}
                  disabled={!batchClassId || !batchTermId || generating}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-md transition-colors disabled:opacity-50"
                >
                  {generating ? 'Generating…' : 'Batch Generate'}
                </button>
                <button onClick={closePanel} className={BTN_CANCEL}>
                  Cancel
                </button>
              </div>

              {batchProgress && (
                <div className="text-xs mt-1">
                  <p className="text-gray-600 dark:text-gray-400">
                    Progress: {batchProgress.done} / {batchProgress.total}
                  </p>
                  {batchProgress.errors.length > 0 && (
                    <ul className="mt-1 text-red-500 list-disc list-inside">
                      {batchProgress.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  {batchProgress.done === batchProgress.total && (
                    <p className="text-green-600 dark:text-green-400 mt-1">
                      Done. {batchProgress.total - batchProgress.errors.length} succeeded,{' '}
                      {batchProgress.errors.length} failed.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {panelError && <p className="mt-2 text-xs text-red-500">{panelError}</p>}
          {panelWarnings.length > 0 && (
            <ul className="mt-2 text-xs text-amber-600 dark:text-amber-400 list-disc list-inside">
              {panelWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {regenError && <p className="mt-2 text-xs text-red-500">{regenError}</p>}

      <Table columns={columns} renderRow={renderRow} data={paginatedCards} />
      <Pagination total={cards.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {pdfCard && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 text-white text-sm">
              Loading PDF renderer…
            </div>
          }
        >
          <ReportCardPDFModal data={pdfCard} onClose={() => setPdfCard(null)} />
        </Suspense>
      )}
    </div>
  );
};

export default ReportCardsPage;
