import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Plus, Trash2, FileDown } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { ReportCardDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import Table from '@/components/Table';
import Pagination from '@/components/Pagination';
import { PAGE_SIZE } from '@/lib/utils';
import {
  type BuilderCard,
  type ColumnKey,
  type Condition,
  type Metric,
  type Operator,
  type ReportConfig,
  type ReportResult,
  COLUMN_LABELS,
  CONDUCT_CODES,
  LETTER_GRADES,
  columnValue,
  isNumericColumn,
  runReport,
} from '@/lib/reportBuilder';
import { REPORT_PRESETS } from '@/lib/reportPresets';

const ReportBuilderPDFModal = lazy(() => import('@/components/reportCard/ReportBuilderPDFModal'));

// ── shared styles (match report-cards scene) ────────────────────────────────────
const SELECT_CLS =
  'border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200';
const INPUT_CLS =
  'border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 w-28';
const LABEL_CLS = 'text-xs font-medium text-gray-500 dark:text-gray-400';
const BTN_PRIMARY =
  'px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-md transition-colors disabled:opacity-50';

const METRIC_OPTIONS: { value: Metric; label: string; kind: 'numeric' | 'letter' | 'conduct'; subject?: boolean }[] = [
  { value: 'average', label: 'Term average', kind: 'numeric' },
  { value: 'gpa', label: 'GPA', kind: 'numeric' },
  { value: 'classRank', label: 'Class position', kind: 'numeric' },
  { value: 'attendanceRate', label: 'Attendance rate %', kind: 'numeric' },
  { value: 'subjectScore', label: 'Subject score', kind: 'numeric', subject: true },
  { value: 'subjectLetter', label: 'Subject letter grade', kind: 'letter', subject: true },
  { value: 'conduct', label: 'Conduct grade', kind: 'conduct' },
];

const NUMERIC_OPERATORS: { value: Operator; label: string }[] = [
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'between', label: 'between' },
];

const ALL_COLUMNS: ColumnKey[] = [
  'studentName',
  'institutionStudentId',
  'className',
  'gradeLevel',
  'houseName',
  'dateOfBirth',
  'studentAverage',
  'gpa',
  'classRank',
  'attendance',
];

function metricKind(metric: Metric): 'numeric' | 'letter' | 'conduct' {
  return METRIC_OPTIONS.find((m) => m.value === metric)?.kind ?? 'numeric';
}
function metricNeedsSubject(metric: Metric): boolean {
  return METRIC_OPTIONS.find((m) => m.value === metric)?.subject ?? false;
}

const EMPTY_CONFIG: ReportConfig = {
  name: 'Custom Report',
  population: { type: 'institution' },
  conditions: [],
  output: 'list',
  columns: ['studentName', 'className', 'gradeLevel', 'studentAverage', 'gpa'],
};

const ReportBuilderPage = () => {
  const { institutionId, role, displayName, institution } = useAuth();

  const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string; grade: number }[]>([]);
  const [houses, setHouses] = useState<{ id: string; name: string }[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [years, setYears] = useState<{ id: string; name: string }[]>([]);

  const [termId, setTermId] = useState('');
  const [rawCards, setRawCards] = useState<(ReportCardDocument & { id: string })[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);

  const [config, setConfig] = useState<ReportConfig>(EMPTY_CONFIG);
  const [presetId, setPresetId] = useState('');
  const [result, setResult] = useState<ReportResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showPDF, setShowPDF] = useState(false);

  // Load dropdown data once per institution.
  useEffect(() => {
    if (!institutionId || institutionId === '*') return;
    const scope = where('institutionId', '==', institutionId);
    getDocs(query(collection(db, 'terms'), scope)).then((snap) =>
      setTerms(snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? d.id }))),
    );
    getDocs(query(collection(db, 'classes'), scope)).then((snap) =>
      setClasses(
        snap.docs
          .map((d) => ({ id: d.id, name: (d.data().name as string) ?? d.id, grade: (d.data().grade as number) ?? 0 }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
    getDocs(query(collection(db, 'houses'), scope)).then((snap) =>
      setHouses(snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? d.id }))),
    );
    getDocs(query(collection(db, 'subjects'), scope)).then((snap) =>
      setSubjects(
        snap.docs
          .map((d) => ({ id: d.id, name: (d.data().name as string) ?? d.id }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
    getDocs(query(collection(db, 'academicYears'), scope)).then((snap) =>
      setYears(snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? d.id }))),
    );
  }, [institutionId]);

  // classId → grade level, for enriching cards and the grade-population dropdown.
  const classGradeMap = useMemo(() => new Map(classes.map((c) => [c.id, c.grade])), [classes]);
  const distinctGrades = useMemo(
    () => [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b),
    [classes],
  );

  // Load report cards for the selected term.
  useEffect(() => {
    if (!institutionId || institutionId === '*' || !termId) {
      setRawCards([]);
      return;
    }
    setLoadingCards(true);
    setResult(null);
    getDocs(
      query(
        collection(db, 'reportCards'),
        where('institutionId', '==', institutionId),
        where('termId', '==', termId),
      ),
    )
      .then((snap) => setRawCards(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ReportCardDocument) }))))
      .finally(() => setLoadingCards(false));
  }, [institutionId, termId]);

  const cards: BuilderCard[] = useMemo(
    () => rawCards.map((c) => ({ ...c, gradeLevel: classGradeMap.get(c.classId) ?? null })),
    [rawCards, classGradeMap],
  );

  // ── config mutators ────────────────────────────────────────────────────────────
  const patch = (p: Partial<ReportConfig>) => {
    setConfig((c) => ({ ...c, ...p }));
    setResult(null);
  };
  const addCondition = () =>
    patch({ conditions: [...config.conditions, { metric: 'average', operator: 'gte', value: 50 }] });
  const removeCondition = (i: number) =>
    patch({ conditions: config.conditions.filter((_, idx) => idx !== i) });
  const updateCondition = (i: number, c: Partial<Condition>) =>
    patch({ conditions: config.conditions.map((cond, idx) => (idx === i ? { ...cond, ...c } : cond)) });
  const toggleColumn = (key: ColumnKey) =>
    patch({
      columns: config.columns.includes(key)
        ? config.columns.filter((k) => k !== key)
        : [...config.columns, key],
    });

  const loadPreset = (id: string) => {
    setPresetId(id);
    const preset = REPORT_PRESETS.find((p) => p.id === id);
    if (preset) {
      setConfig({ ...preset.config, conditions: preset.config.conditions.map((c) => ({ ...c })) });
      setResult(null);
    }
  };

  const usesSubject =
    config.conditions.some((c) => metricNeedsSubject(c.metric)) || config.columns.includes('subject');

  const handleRun = () => {
    setRunError(null);
    setPage(1);
    if (usesSubject && !config.focusSubjectId) {
      setRunError('Select a subject — this report references subject-level grades.');
      return;
    }
    // Inject the chosen subject into subject-scoped conditions.
    const conditions = config.conditions.map((c) =>
      metricNeedsSubject(c.metric) && !c.subjectId ? { ...c, subjectId: config.focusSubjectId } : c,
    );
    setResult(runReport(cards, { ...config, conditions }));
  };

  if (!institutionId || institutionId === '*') {
    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
        <h1 className="text-lg font-semibold mb-4">Report Builder</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Report building is scoped to a single institution. Sign in as an institution user to build reports.
        </p>
      </div>
    );
  }

  const displayColumns: ColumnKey[] = config.columns.includes('subject')
    ? config.columns
    : usesSubject && config.focusSubjectId
      ? [...config.columns, 'subject']
      : config.columns;

  const paginated = result ? result.matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : [];
  const termName = terms.find((t) => t.id === termId)?.name ?? '';

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Report Builder</h1>
      </div>

      {/* Preset + term */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Standing report</span>
          <select value={presetId} onChange={(e) => loadPreset(e.target.value)} className={SELECT_CLS}>
            <option value="">Custom report…</option>
            {REPORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Term</span>
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className={SELECT_CLS}>
            <option value="">Select term…</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {termId && (
          <span className="text-xs text-gray-400 pb-2">
            {loadingCards ? 'Loading cards…' : `${cards.length} report card(s) in this term`}
          </span>
        )}
      </div>

      {presetId && (
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
          {REPORT_PRESETS.find((p) => p.id === presetId)?.description}
        </p>
      )}

      {/* Population */}
      <fieldset className="border border-gray-200 dark:border-gray-700 rounded-md p-3 flex flex-wrap items-end gap-4">
        <legend className="text-xs font-semibold px-1 text-gray-600 dark:text-gray-300">Population</legend>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Group</span>
          <select
            value={config.population.type}
            onChange={(e) => patch({ population: { type: e.target.value as ReportConfig['population']['type'] } })}
            className={SELECT_CLS}
          >
            <option value="institution">Whole institution</option>
            <option value="class">Class</option>
            <option value="grade">Grade level</option>
            <option value="cohort">Cohort (academic year)</option>
            <option value="house">House</option>
          </select>
        </label>
        {config.population.type === 'class' && (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>Class</span>
            <select
              value={config.population.classId ?? ''}
              onChange={(e) => patch({ population: { type: 'class', classId: e.target.value } })}
              className={SELECT_CLS}
            >
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {config.population.type === 'grade' && (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>Grade</span>
            <select
              value={config.population.grade ?? ''}
              onChange={(e) => patch({ population: { type: 'grade', grade: Number(e.target.value) } })}
              className={SELECT_CLS}
            >
              <option value="">Select grade…</option>
              {distinctGrades.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </label>
        )}
        {config.population.type === 'cohort' && (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>Academic year</span>
            <select
              value={config.population.academicYearId ?? ''}
              onChange={(e) => patch({ population: { type: 'cohort', academicYearId: e.target.value } })}
              className={SELECT_CLS}
            >
              <option value="">Select year…</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {config.population.type === 'house' && (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>House</span>
            <select
              value={config.population.houseId ?? ''}
              onChange={(e) => patch({ population: { type: 'house', houseId: e.target.value } })}
              className={SELECT_CLS}
            >
              <option value="">Select house…</option>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      {/* Conditions */}
      <fieldset className="border border-gray-200 dark:border-gray-700 rounded-md p-3 flex flex-col gap-3">
        <legend className="text-xs font-semibold px-1 text-gray-600 dark:text-gray-300">
          Conditions (all must match)
        </legend>
        {config.conditions.length === 0 && (
          <p className="text-xs text-gray-400">No conditions — every student in the population is included.</p>
        )}
        {config.conditions.map((cond, i) => {
          const kind = metricKind(cond.metric);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={cond.metric}
                onChange={(e) => {
                  const metric = e.target.value as Metric;
                  const nextKind = metricKind(metric);
                  updateCondition(i, {
                    metric,
                    operator: nextKind === 'numeric' ? 'gte' : 'in',
                    value: nextKind === 'numeric' ? 50 : undefined,
                    values: nextKind === 'numeric' ? undefined : [],
                  });
                }}
                className={SELECT_CLS}
              >
                {METRIC_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              {kind === 'numeric' ? (
                <>
                  <select
                    value={cond.operator}
                    onChange={(e) => updateCondition(i, { operator: e.target.value as Operator })}
                    className={SELECT_CLS}
                  >
                    {NUMERIC_OPERATORS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={cond.value ?? ''}
                    onChange={(e) => updateCondition(i, { value: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className={INPUT_CLS}
                  />
                  {cond.operator === 'between' && (
                    <>
                      <span className="text-xs text-gray-400">and</span>
                      <input
                        type="number"
                        value={cond.value2 ?? ''}
                        onChange={(e) =>
                          updateCondition(i, { value2: e.target.value === '' ? undefined : Number(e.target.value) })
                        }
                        className={INPUT_CLS}
                      />
                    </>
                  )}
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-gray-400">is one of</span>
                  {(kind === 'letter' ? LETTER_GRADES : CONDUCT_CODES).map((code) => {
                    const checked = (cond.values ?? []).includes(code);
                    return (
                      <label
                        key={code}
                        className={`px-2 py-1 text-xs rounded cursor-pointer border ${
                          checked
                            ? 'bg-sky-500 text-white border-sky-500'
                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() =>
                            updateCondition(i, {
                              values: checked
                                ? (cond.values ?? []).filter((v) => v !== code)
                                : [...(cond.values ?? []), code],
                            })
                          }
                        />
                        {code}
                      </label>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => removeCondition(i)}
                className="text-gray-400 hover:text-red-500 p-1"
                title="Remove condition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addCondition}
          className="self-start flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700"
        >
          <Plus className="w-3.5 h-3.5" /> Add condition
        </button>
      </fieldset>

      {/* Subject + output + columns */}
      <div className="flex flex-wrap items-end gap-6">
        {usesSubject && (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>Subject</span>
            <select
              value={config.focusSubjectId ?? ''}
              onChange={(e) => {
                const s = subjects.find((x) => x.id === e.target.value);
                patch({ focusSubjectId: e.target.value || undefined, focusSubjectName: s?.name });
              }}
              className={SELECT_CLS}
            >
              <option value="">Select subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Output</span>
          <select
            value={config.output}
            onChange={(e) => patch({ output: e.target.value as ReportConfig['output'] })}
            className={SELECT_CLS}
          >
            <option value="list">List of students</option>
            <option value="percentage">Percentage of population</option>
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Columns</span>
          <div className="flex flex-wrap gap-2">
            {ALL_COLUMNS.map((key) => {
              const checked = config.columns.includes(key);
              return (
                <label
                  key={key}
                  className={`px-2 py-1 text-xs rounded cursor-pointer border ${
                    checked
                      ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleColumn(key)} />
                  {COLUMN_LABELS[key]}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Run */}
      <div className="flex items-center gap-3">
        <button onClick={handleRun} disabled={!termId || loadingCards} className={BTN_PRIMARY}>
          Run report
        </button>
        {result && result.matchedCount > 0 && (
          <button
            onClick={() => setShowPDF(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <FileDown className="w-4 h-4" /> Export PDF
          </button>
        )}
      </div>
      {runError && <p className="text-xs text-red-500">{runError}</p>}

      {/* Results */}
      {result && config.output === 'percentage' && (
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-6 text-center">
          <p className="text-4xl font-bold text-sky-600 dark:text-sky-400">
            {result.percentage != null ? `${result.percentage.toFixed(1)}%` : '—'}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {result.matchedCount} of {result.total} students matched
          </p>
        </div>
      )}

      {result && config.output === 'list' && (
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {result.matchedCount} of {result.total} students matched
          </p>
          <Table
            columns={displayColumns.map((k) => ({
              header: k === 'subject' ? config.focusSubjectName ?? 'Subject' : COLUMN_LABELS[k],
              accessor: k,
              className: isNumericColumn(k) ? 'text-right' : undefined,
            }))}
            data={paginated}
            renderRow={(card: BuilderCard) => (
              <tr
                key={card.id}
                className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm"
              >
                {displayColumns.map((k) => (
                  <td key={k} className={`p-3 ${isNumericColumn(k) ? 'text-right tabular-nums' : ''}`}>
                    {columnValue(card, k, config.focusSubjectId)}
                  </td>
                ))}
              </tr>
            )}
          />
          <Pagination total={result.matchedCount} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      )}

      {showPDF && result && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 text-white text-sm">
              Loading PDF renderer…
            </div>
          }
        >
          <ReportBuilderPDFModal
            config={config}
            displayColumns={displayColumns}
            result={result}
            institutionName={institution?.name ?? ''}
            termName={termName}
            generatedBy={displayName ?? role ?? ''}
            onClose={() => setShowPDF(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ReportBuilderPage;
