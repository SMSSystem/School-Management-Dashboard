import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GradebookColumnDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { COMMENT_KEY } from '@/lib/commentKey';
import { Pencil } from 'lucide-react';
import { useNextStep } from 'nextstepjs';
import ColumnCreationModal from './ColumnCreationModal';
import ColumnEditModal from './ColumnEditModal';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type TermDoc = { id: string; name: string; status: string };
type ClassDoc = { id: string; name: string };
type SubjectDoc = {
  id: string;
  name: string;
  classIds?: string[];
  classScope?: string;
  teacherIds?: string[];
  teacherNames?: string[];
  departmentId?: string;
};
type StudentDoc = { id: string; name: string; gender?: string };
type ResultDoc = {
  id: string;
  studentId: string;
  score: number;
  maxScore: number;
  gradebookColumnId?: string;
  columnWeight?: number;
  assessmentType?: string;
};
type FeedbackDoc = {
  id: string;
  studentId: string;
  conductGrade?: string;
  commentNumbers?: number[];
};

// ---------------------------------------------------------------------------
// GradebookPage
// ---------------------------------------------------------------------------

const GradebookPage = () => {
  const { user, role, institutionId } = useAuth();
  const { startNextStep } = useNextStep();

  // Selection
  const [selectedTermId, setSelectedTermId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  // Reference data (loaded once via onSnapshot)
  const [terms, setTerms] = useState<TermDoc[]>([]);
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [subjects, setSubjects] = useState<SubjectDoc[]>([]);
  const [assignedClassId, setAssignedClassId] = useState<string | null>(null);

  // Per-selection data (one-time fetch)
  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [columns, setColumns] = useState<(GradebookColumnDocument & { id: string })[]>([]);
  const [results, setResults] = useState<ResultDoc[]>([]);
  const [feedback, setFeedback] = useState<FeedbackDoc[]>([]);
  const [gradebookExists, setGradebookExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Dirty / pending state
  const [dirtyScores, setDirtyScores] = useState<Record<string, Record<string, number | ''>>>({});
  const [dirtyConduct, setDirtyConduct] = useState<Record<string, string>>({});
  const [dirtyComments, setDirtyComments] = useState<Record<string, number[]>>({});
  const [pendingColumnEdits, setPendingColumnEdits] = useState<
    Record<string, Partial<GradebookColumnDocument>>
  >({});

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Modal state
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingColumn, setEditingColumn] = useState<
    (GradebookColumnDocument & { id: string }) | null
  >(null);

  // Comment picker state
  const [openCommentPickerId, setOpenCommentPickerId] = useState<string | null>(null);
  const [tempCommentSelection, setTempCommentSelection] = useState<number[]>([]);

  // Keyboard nav refs
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

  // Refs for auto-save
  const isDirtyRef = useRef(false);
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const effectiveColumns = useMemo(
    () =>
      columns
        .map((col) => ({ ...col, ...(pendingColumnEdits[col.id] ?? {}) }))
        .sort((a, b) => a.order - b.order),
    [columns, pendingColumnEdits],
  );

  const weightTotal = useMemo(
    () => effectiveColumns.reduce((s, c) => s + (c.columnWeight ?? 0), 0),
    [effectiveColumns],
  );

  const isDirty =
    Object.keys(dirtyScores).length > 0 ||
    Object.keys(dirtyConduct).length > 0 ||
    Object.keys(dirtyComments).length > 0 ||
    Object.keys(pendingColumnEdits).length > 0;

  const selectedTerm = terms.find((t) => t.id === selectedTermId);
  const isCompletedTerm = selectedTerm?.status === 'completed';
  const canEdit =
    (role === 'institution_admin' ||
      role === 'senior_teacher' ||
      role === 'regular_teacher') &&
    !isCompletedTerm;
  const showEditControls = role !== 'super_admin';

  const selectedSubjectDoc = subjects.find((s) => s.id === selectedSubjectId);
  const selectedClassName = classes.find((c) => c.id === selectedClassId)?.name ?? '';

  // Shared gradebook banner — show when subject has multiple teachers
  const sharedTeacherNames = useMemo(() => {
    if (!selectedSubjectDoc?.teacherIds || selectedSubjectDoc.teacherIds.length < 2) return [];
    return selectedSubjectDoc.teacherIds
      .map((tid, i) => ({
        tid,
        name: selectedSubjectDoc.teacherNames?.[i] ?? tid,
      }))
      .filter(({ tid }) =>
        role === 'institution_admin' || role === 'super_admin' ? true : tid !== user?.uid,
      )
      .map(({ name }) => name);
  }, [selectedSubjectDoc, role, user?.uid]);

  // ---------------------------------------------------------------------------
  // Role-filtered class / subject options
  // ---------------------------------------------------------------------------

  const visibleClasses = useMemo(() => {
    if (role === 'senior_teacher') {
      return assignedClassId ? classes.filter((c) => c.id === assignedClassId) : [];
    }
    if (role === 'regular_teacher') {
      const teacherClassIds = new Set<string>();
      subjects.forEach((s) => {
        if (s.teacherIds?.includes(user?.uid ?? '')) {
          s.classIds?.forEach((cid) => teacherClassIds.add(cid));
        }
      });
      return classes.filter((c) => teacherClassIds.has(c.id));
    }
    return classes;
  }, [classes, subjects, role, user?.uid, assignedClassId]);

  const visibleSubjects = useMemo(() => {
    if (!selectedClassId) return [];
    const forClass = subjects.filter(
      (s) => s.classScope === 'institution' || s.classIds?.includes(selectedClassId),
    );
    if (role === 'regular_teacher' || role === 'senior_teacher') {
      return forClass.filter((s) => s.teacherIds?.includes(user?.uid ?? ''));
    }
    return forClass;
  }, [subjects, selectedClassId, role, user?.uid]);

  const gradebookId =
    selectedClassId && selectedSubjectId && selectedTermId
      ? `${selectedClassId}_${selectedSubjectId}_${selectedTermId}`
      : null;

  // ---------------------------------------------------------------------------
  // Reference data subscriptions (live)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!institutionId) return;

    const unsubTerms = onSnapshot(
      query(collection(db, 'terms'), where('institutionId', '==', institutionId)),
      (snap) =>
        setTerms(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name as string,
            status: d.data().status as string,
          })),
        ),
    );

    const unsubClasses = onSnapshot(
      query(collection(db, 'classes'), where('institutionId', '==', institutionId)),
      (snap) =>
        setClasses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
    );

    const subjectQuery =
      role === 'regular_teacher' || role === 'senior_teacher'
        ? query(
            collection(db, 'subjects'),
            where('institutionId', '==', institutionId),
            where('teacherIds', 'array-contains', user!.uid),
          )
        : query(collection(db, 'subjects'), where('institutionId', '==', institutionId));

    const unsubSubjects = onSnapshot(subjectQuery, (snap) =>
      setSubjects(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name as string,
          classIds: (d.data().classIds ?? []) as string[],
          classScope: d.data().classScope as string | undefined,
          teacherIds: (d.data().teacherIds ?? []) as string[],
          teacherNames: (d.data().teacherNames ?? []) as string[],
          departmentId: d.data().departmentId as string | undefined,
        })),
      ),
    );

    return () => {
      unsubTerms();
      unsubClasses();
      unsubSubjects();
    };
  }, [institutionId, role, user?.uid]);

  // Fetch senior teacher's assignedClassId
  useEffect(() => {
    if (role === 'senior_teacher' && user?.uid) {
      getDoc(doc(db, 'users', user.uid)).then((snap) => {
        if (snap.exists()) setAssignedClassId((snap.data().assignedClassId as string) ?? null);
      });
    }
  }, [role, user?.uid]);

  // Auto-select active term
  useEffect(() => {
    if (terms.length > 0 && !selectedTermId) {
      const active = terms.find((t) => t.status === 'active');
      if (active) setSelectedTermId(active.id);
    }
  }, [terms, selectedTermId]);

  // Auto-select senior teacher's class
  useEffect(() => {
    if (role === 'senior_teacher' && assignedClassId && classes.some((c) => c.id === assignedClassId)) {
      setSelectedClassId(assignedClassId);
    }
  }, [role, assignedClassId, classes]);

  // Auto-select subject if only one is eligible
  useEffect(() => {
    if (visibleSubjects.length === 1 && selectedClassId) {
      setSelectedSubjectId(visibleSubjects[0].id);
    } else if (visibleSubjects.length !== 1) {
      setSelectedSubjectId('');
    }
  }, [visibleSubjects, selectedClassId]);

  // ---------------------------------------------------------------------------
  // Load per-selection data
  // ---------------------------------------------------------------------------

  const loadGradebook = useCallback(async () => {
    if (!institutionId || !gradebookId) return;
    setLoading(true);
    setLoadError(null);
    setStudents([]);
    setColumns([]);
    setResults([]);
    setFeedback([]);
    setDirtyScores({});
    setDirtyConduct({});
    setDirtyComments({});
    setPendingColumnEdits({});
    setSaveError(null);

    try {
      const [studentsSnap, columnsSnap, resultsSnap, feedbackSnap, gbSnap] =
        await Promise.all([
          getDocs(
            query(
              collection(db, 'users'),
              where('institutionId', '==', institutionId),
              where('role', '==', 'student'),
              where('classId', '==', selectedClassId),
            ),
          ),
          getDocs(
            query(
              collection(db, 'gradebooks', gradebookId, 'columns'),
              where('institutionId', '==', institutionId),
            ),
          ),
          getDocs(
            query(
              collection(db, 'results'),
              where('institutionId', '==', institutionId),
              where('classId', '==', selectedClassId),
              where('subjectId', '==', selectedSubjectId),
              where('termId', '==', selectedTermId),
            ),
          ),
          getDocs(
            query(
              collection(db, 'feedback_comments'),
              where('institutionId', '==', institutionId),
              where('classId', '==', selectedClassId),
              where('subjectId', '==', selectedSubjectId),
              where('termId', '==', selectedTermId),
            ),
          ),
          getDoc(doc(db, 'gradebooks', gradebookId)),
        ]);

      setStudents(
        studentsSnap.docs
          .map((d) => ({
            id: d.id,
            name: d.data().name as string,
            gender: d.data().gender as string | undefined,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );

      setColumns(
        columnsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as GradebookColumnDocument) }))
          .sort((a, b) => a.order - b.order),
      );

      setResults(
        resultsSnap.docs
          .filter((d) => d.data().gradebookColumnId)
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ResultDoc, 'id'>) })),
      );

      setFeedback(
        feedbackSnap.docs.map((d) => ({
          id: d.id,
          studentId: d.data().studentId as string,
          conductGrade: d.data().conductGrade as string | undefined,
          commentNumbers: d.data().commentNumbers as number[] | undefined,
        })),
      );

      setGradebookExists(gbSnap.exists());
    } catch (err) {
      console.error('GradebookPage load error:', err);
      setLoadError('Failed to load gradebook data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [institutionId, gradebookId, selectedClassId, selectedSubjectId, selectedTermId]);

  useEffect(() => {
    if (selectedClassId && selectedSubjectId && selectedTermId && institutionId) {
      loadGradebook();
    }
  }, [selectedClassId, selectedSubjectId, selectedTermId, institutionId, loadGradebook]);

  // Re-fetch only results (after save, to pick up new doc IDs)
  const reloadResults = useCallback(async () => {
    if (!institutionId || !selectedClassId || !selectedSubjectId || !selectedTermId) return;
    try {
      const snap = await getDocs(
        query(
          collection(db, 'results'),
          where('institutionId', '==', institutionId),
          where('classId', '==', selectedClassId),
          where('subjectId', '==', selectedSubjectId),
          where('termId', '==', selectedTermId),
        ),
      );
      setResults(
        snap.docs
          .filter((d) => d.data().gradebookColumnId)
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ResultDoc, 'id'>) })),
      );
    } catch (err) {
      console.error('reloadResults error:', err);
    }
  }, [institutionId, selectedClassId, selectedSubjectId, selectedTermId]);

  // ---------------------------------------------------------------------------
  // Auto-save on beforeunload
  // ---------------------------------------------------------------------------

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    saveRef.current = performSave;
  });

  useEffect(() => {
    const handler = () => {
      if (isDirtyRef.current) saveRef.current();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const getScore = (studentId: string, colId: string): number | '' => {
    const dirty = dirtyScores[studentId]?.[colId];
    if (dirty !== undefined) return dirty;
    const saved = results.find(
      (r) => r.gradebookColumnId === colId && r.studentId === studentId,
    );
    return saved?.score ?? '';
  };

  const getConductGrade = (studentId: string): string => {
    if (dirtyConduct[studentId] !== undefined) return dirtyConduct[studentId];
    return feedback.find((f) => f.studentId === studentId)?.conductGrade ?? '';
  };

  const getCommentNumbers = (studentId: string): number[] => {
    if (dirtyComments[studentId] !== undefined) return dirtyComments[studentId];
    return feedback.find((f) => f.studentId === studentId)?.commentNumbers ?? [];
  };

  const hasScoreError = (studentId: string, colId: string, maxScore: number): boolean => {
    const dirty = dirtyScores[studentId]?.[colId];
    return dirty !== undefined && dirty !== '' && Number(dirty) > maxScore;
  };

  const computeAverage = (studentId: string): number => {
    if (effectiveColumns.length < 2) return 0;
    const weightSum = effectiveColumns.reduce((s, c) => s + (c.columnWeight ?? 0), 0);
    if (weightSum === 0) return 0;
    const scoreSum = effectiveColumns.reduce((s, col) => {
      const score = getScore(studentId, col.id);
      const num = score === '' ? 0 : Number(score);
      const maxScore = col.maxScore > 0 ? col.maxScore : 1;
      return s + (num / maxScore) * (col.columnWeight ?? 0);
    }, 0);
    return Math.round((scoreSum / weightSum) * 100);
  };

  const affectedCountForColumn = (colId: string): number =>
    results.filter((r) => r.gradebookColumnId === colId && r.score > 0).length;

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function performSave() {
    if (!canEdit || saving || !gradebookId || !institutionId) return;

    // Validate: no score may exceed its column's maxScore
    for (const studentId of Object.keys(dirtyScores)) {
      for (const colId of Object.keys(dirtyScores[studentId] ?? {})) {
        const col = effectiveColumns.find((c) => c.id === colId);
        if (!col) continue;
        const score = dirtyScores[studentId][colId];
        if (score !== '' && Number(score) > col.maxScore) {
          setSaveError(
            `Score exceeds max (${col.maxScore}) for column "${col.label}". Fix before saving.`,
          );
          return;
        }
      }
    }

    setSaving(true);
    setSaveError(null);

    try {
      const batch = writeBatch(db);
      const gbDocRef = doc(db, 'gradebooks', gradebookId);

      // 1. Create gradebook parent doc on first save
      if (!gradebookExists) {
        batch.set(gbDocRef, {
          classId: selectedClassId,
          subjectId: selectedSubjectId,
          termId: selectedTermId,
          institutionId,
          createdAt: serverTimestamp(),
          createdBy: user?.uid ?? '',
        });
      }

      const subjectDoc = subjects.find((s) => s.id === selectedSubjectId);
      const teacherId = user?.uid ?? '';
      const teacherName = subjectDoc?.teacherNames?.[0] ?? '';
      const departmentId = subjectDoc?.departmentId ?? '';

      // 2. Dirty score cells
      for (const studentId of Object.keys(dirtyScores)) {
        for (const colId of Object.keys(dirtyScores[studentId] ?? {})) {
          const effectiveCol = effectiveColumns.find((c) => c.id === colId);
          if (!effectiveCol) continue;
          const rawScore = dirtyScores[studentId][colId];
          const score = rawScore === '' ? 0 : Number(rawScore);
          const student = students.find((s) => s.id === studentId);
          const existingResult = results.find(
            (r) => r.gradebookColumnId === colId && r.studentId === studentId,
          );

          if (existingResult) {
            batch.update(doc(db, 'results', existingResult.id), {
              score,
              maxScore: effectiveCol.maxScore,
              assessmentType: effectiveCol.assessmentType,
              columnWeight: effectiveCol.columnWeight,
              weight: effectiveCol.columnWeight,
            });
          } else {
            const newResultRef = doc(collection(db, 'results'));
            batch.set(newResultRef, {
              studentId,
              studentName: student?.name ?? '',
              classId: selectedClassId,
              className: selectedClassName,
              termId: selectedTermId,
              institutionId,
              subjectId: selectedSubjectId,
              assessmentName: colId,
              assessmentType: effectiveCol.assessmentType,
              score,
              maxScore: effectiveCol.maxScore,
              weight: effectiveCol.columnWeight,
              date: effectiveCol.date ?? '',
              gradebookColumnId: colId,
              columnWeight: effectiveCol.columnWeight,
              source: 'gradebook',
              teacherId,
              teacherName,
              departmentId,
              createdAt: serverTimestamp(),
            });
          }
        }
      }

      // 3. Dirty conduct / comments (upsert deterministic-ID docs)
      for (const student of students) {
        const hasDirtyConduct = dirtyConduct[student.id] !== undefined;
        const hasDirtyComments = dirtyComments[student.id] !== undefined;
        if (!hasDirtyConduct && !hasDirtyComments) continue;

        const fbDocRef = doc(
          db,
          'feedback_comments',
          `${student.id}_${selectedSubjectId}_${selectedTermId}`,
        );
        const existingFb = feedback.find((f) => f.studentId === student.id);
        const conductGrade = hasDirtyConduct
          ? dirtyConduct[student.id]
          : (existingFb?.conductGrade ?? '');
        const commentNumbers = hasDirtyComments
          ? dirtyComments[student.id]
          : (existingFb?.commentNumbers ?? []);

        batch.set(
          fbDocRef,
          {
            studentId: student.id,
            studentName: student.name,
            classId: selectedClassId,
            className: selectedClassName,
            termId: selectedTermId,
            institutionId,
            subjectId: selectedSubjectId,
            conductGrade,
            commentNumbers,
            teacherId,
            teacherName,
            departmentId,
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      // 4. Pending column metadata edits
      for (const colId of Object.keys(pendingColumnEdits)) {
        const edits = pendingColumnEdits[colId];
        const colDocRef = doc(db, 'gradebooks', gradebookId, 'columns', colId);
        batch.update(colDocRef, edits);

        // Proportional scale existing result scores if maxScore changed
        if (edits.maxScore !== undefined) {
          const oldCol = columns.find((c) => c.id === colId);
          if (oldCol && oldCol.maxScore !== edits.maxScore && oldCol.maxScore > 0) {
            for (const result of results) {
              if (result.gradebookColumnId !== colId) continue;
              const isDirtyScore = dirtyScores[result.studentId]?.[colId] !== undefined;
              if (!isDirtyScore) {
                const scaled = Math.round((result.score / oldCol.maxScore) * edits.maxScore);
                batch.update(doc(db, 'results', result.id), {
                  score: scaled,
                  maxScore: edits.maxScore,
                });
              }
            }
          }
        }

        // Sync columnWeight on all linked results
        if (edits.columnWeight !== undefined) {
          for (const result of results) {
            if (result.gradebookColumnId !== colId) continue;
            batch.update(doc(db, 'results', result.id), {
              columnWeight: edits.columnWeight,
              weight: edits.columnWeight,
            });
          }
        }
      }

      await batch.commit();

      // Commit pending edits into local column state
      setColumns((prev) =>
        prev.map((c) => ({ ...c, ...(pendingColumnEdits[c.id] ?? {}) })),
      );

      // Clear all dirty state
      setDirtyScores({});
      setDirtyConduct({});
      setDirtyComments({});
      setPendingColumnEdits({});
      setGradebookExists(true);

      // Re-fetch results to pick up IDs for newly created documents
      await reloadResults();
    } catch (err) {
      console.error('Gradebook save error:', err);
      setSaveError('Save failed — please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Column handlers
  // ---------------------------------------------------------------------------

  const handleColumnCreated = (col: GradebookColumnDocument & { id: string }) => {
    setColumns((prev) => [...prev, col].sort((a, b) => a.order - b.order));
  };

  const handleColumnEditSave = (colId: string, updates: Partial<GradebookColumnDocument>) => {
    setPendingColumnEdits((prev) => ({ ...prev, [colId]: { ...(prev[colId] ?? {}), ...updates } }));
    setColumns((prev) => prev.map((c) => (c.id === colId ? { ...c, ...updates } : c)));
    setEditingColumn(null);
  };

  const handleColumnDelete = async (colId: string) => {
    if (!gradebookId || !institutionId) throw new Error('Missing gradebook context');

    const deletedColumn = columns.find((c) => c.id === colId);
    if (!deletedColumn) throw new Error('Column not found');
    const deletedOrder = deletedColumn.order;

    const batch = writeBatch(db);

    batch.delete(doc(db, 'gradebooks', gradebookId, 'columns', colId));

    for (const result of results.filter((r) => r.gradebookColumnId === colId)) {
      batch.delete(doc(db, 'results', result.id));
    }

    for (const col of columns.filter((c) => c.order > deletedOrder)) {
      batch.update(doc(db, 'gradebooks', gradebookId, 'columns', col.id), {
        order: col.order - 1,
      });
    }

    await batch.commit();

    setColumns((prev) =>
      prev
        .filter((c) => c.id !== colId)
        .map((c) => (c.order > deletedOrder ? { ...c, order: c.order - 1 } : c)),
    );
    setResults((prev) => prev.filter((r) => r.gradebookColumnId !== colId));
    setDirtyScores((prev) => {
      const next: Record<string, Record<string, number | ''>> = {};
      for (const sid of Object.keys(prev)) {
        const colMap = { ...prev[sid] };
        delete colMap[colId];
        if (Object.keys(colMap).length > 0) next[sid] = colMap;
      }
      return next;
    });
    setPendingColumnEdits((prev) => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Comment picker handlers
  // ---------------------------------------------------------------------------

  const openCommentPicker = (studentId: string) => {
    setTempCommentSelection(getCommentNumbers(studentId));
    setOpenCommentPickerId(studentId);
  };

  const toggleTempComment = (num: number) => {
    setTempCommentSelection((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num);
      if (prev.length >= 5) return prev;
      return [...prev, num].sort((a, b) => a - b);
    });
  };

  const confirmCommentPicker = (studentId: string) => {
    setDirtyComments((prev) => ({ ...prev, [studentId]: tempCommentSelection }));
    setOpenCommentPickerId(null);
  };

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------

  const handleScoreKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    studentIdx: number,
    colIdx: number,
  ) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const nextStudentIdx = studentIdx + 1;
    if (nextStudentIdx < students.length) {
      inputRefs.current[nextStudentIdx]?.[colIdx]?.focus();
    } else {
      const nextColIdx = colIdx + 1;
      if (nextColIdx < effectiveColumns.length) {
        inputRefs.current[0]?.[nextColIdx]?.focus();
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const allSelected = !!(selectedTermId && selectedClassId && selectedSubjectId);
  const showAverage = effectiveColumns.length >= 2;
  const showWeightWarning =
    effectiveColumns.length > 0 && Math.abs(weightTotal - 100) > 0.01;

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4 overflow-auto">
      {/* Heading */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold dark:text-white">Gradebook</h1>
        <button
          onClick={() => startNextStep('gradebook')}
          className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Take a tour
        </button>
      </div>
      {allSelected && selectedSubjectDoc && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {selectedSubjectDoc.name} — {selectedClassName} — {selectedTerm?.name ?? ''}
        </p>
      )}

      {/* Dropdowns */}
      <div id="tour-gradebook-selectors" className="flex flex-wrap gap-3 mb-4">
        {/* Term */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Term</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer"
            value={selectedTermId}
            onChange={(e) => {
              setSelectedTermId(e.target.value);
              setSelectedSubjectId('');
            }}
          >
            <option value="">Select term</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Class */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Class</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
            value={selectedClassId}
            disabled={role === 'senior_teacher'}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setSelectedSubjectId('');
            }}
          >
            <option value="">Select class</option>
            {visibleClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Subject */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Subject</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
            value={selectedSubjectId}
            disabled={!selectedClassId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
          >
            <option value="">Select subject</option>
            {visibleSubjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Banners */}
      {allSelected && sharedTeacherNames.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300">
          This gradebook is shared with {sharedTeacherNames.join(' and ')}.
        </div>
      )}
      {allSelected && isDirty && (
        <div className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300">
          You have unsaved changes. Click Save to persist, or navigate away to auto-save.
        </div>
      )}

      {/* Action controls */}
      {allSelected && showEditControls && (
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <button
            onClick={performSave}
            disabled={!canEdit || saving || !isDirty}
            title={isCompletedTerm ? 'This term is completed.' : undefined}
            className="px-4 py-1.5 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            id="tour-gradebook-add-column"
            onClick={() => setShowColumnModal(true)}
            disabled={!canEdit || saving}
            title={isCompletedTerm ? 'This term is completed.' : undefined}
            className="px-4 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            + Column
          </button>
          {showWeightWarning && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Column weights sum to {weightTotal}% (must equal 100% for report cards)
            </span>
          )}
        </div>
      )}

      {saveError && (
        <p className="text-xs text-red-500 mb-3">{saveError}</p>
      )}

      {/* Load state */}
      {!allSelected && (
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-6">
          Select a term, class, and subject to load the gradebook.
        </p>
      )}
      {allSelected && loading && (
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-6">Loading…</p>
      )}
      {allSelected && loadError && (
        <p className="text-sm text-red-500 mt-6">{loadError}</p>
      )}

      {/* Table */}
      {allSelected && !loading && !loadError && (
        <div id="tour-gradebook-grid" className="overflow-x-auto">
          <table className="min-w-max w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                {/* Fixed headers */}
                <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                  Name
                </th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                  Gender
                </th>

                {/* User-defined column headers */}
                {effectiveColumns.map((col) => (
                  <th
                    key={col.id}
                    className="text-center px-2 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap group relative"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="flex items-center gap-1">
                        {col.label} / {col.maxScore}
                        {showEditControls && !isCompletedTerm && (
                          <button
                            onClick={() => setEditingColumn(col)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer"
                            title={`Edit column: ${col.label}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                      <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
                        {col.assessmentType === 'coursework' ? 'CW' : 'Exam'} · {col.columnWeight}%
                      </span>
                    </div>
                  </th>
                ))}

                {/* Average header */}
                {showAverage && (
                  <th className="text-center px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                    Average
                  </th>
                )}

                {/* Conduct header */}
                <th className="text-center px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                  Conduct
                </th>

                {/* Comments header */}
                <th className="text-center px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                  Comments
                </th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr>
                  <td
                    colSpan={
                      2 + effectiveColumns.length + (showAverage ? 1 : 0) + 2
                    }
                    className="px-3 py-6 text-center text-gray-400 dark:text-gray-500"
                  >
                    No students found in this class.
                  </td>
                </tr>
              )}
              {students.map((student, studentIdx) => (
                <>
                  <tr
                    key={student.id}
                    className="border-b border-gray-100 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/40 hover:bg-lamaPurpleLight dark:hover:bg-gray-700/40"
                  >
                    {/* Name */}
                    <td className="px-3 py-2 whitespace-nowrap dark:text-gray-200">
                      {student.name}
                    </td>
                    {/* Gender */}
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {student.gender ?? '—'}
                    </td>

                    {/* Score cells */}
                    {effectiveColumns.map((col, colIdx) => {
                      const scoreVal = getScore(student.id, col.id);
                      const hasError = hasScoreError(student.id, col.id, col.maxScore);
                      return (
                        <td key={col.id} className="px-2 py-1 text-center">
                          {canEdit ? (
                            <div className="flex flex-col items-center">
                              <input
                                ref={(el) => {
                                  if (!inputRefs.current[studentIdx]) {
                                    inputRefs.current[studentIdx] = [];
                                  }
                                  inputRefs.current[studentIdx][colIdx] = el;
                                }}
                                type="number"
                                min={0}
                                max={col.maxScore}
                                value={scoreVal}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : Number(e.target.value);
                                  setDirtyScores((prev) => ({
                                    ...prev,
                                    [student.id]: {
                                      ...(prev[student.id] ?? {}),
                                      [col.id]: val as number | '',
                                    },
                                  }));
                                }}
                                onKeyDown={(e) => handleScoreKeyDown(e, studentIdx, colIdx)}
                                className={`w-16 text-right p-1 rounded border text-sm dark:bg-gray-900 dark:text-gray-100 ${
                                  hasError
                                    ? 'border-red-400 ring-1 ring-red-400'
                                    : 'border-gray-300 dark:border-gray-600'
                                }`}
                              />
                              {hasError && (
                                <span className="text-[10px] text-red-500">
                                  Max {col.maxScore}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-700 dark:text-gray-300">
                              {scoreVal === '' ? '—' : scoreVal}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    {/* Average */}
                    {showAverage && (
                      <td className="px-3 py-2 text-center text-gray-700 dark:text-gray-300 font-medium">
                        {computeAverage(student.id)}%
                      </td>
                    )}

                    {/* Conduct */}
                    <td className="px-2 py-1 text-center">
                      {canEdit ? (
                        <select
                          value={getConductGrade(student.id)}
                          onChange={(e) =>
                            setDirtyConduct((prev) => ({
                              ...prev,
                              [student.id]: e.target.value,
                            }))
                          }
                          className="p-1 rounded border border-gray-300 dark:border-gray-600 text-sm dark:bg-gray-900 dark:text-gray-100 cursor-pointer"
                        >
                          <option value="">—</option>
                          <option value="G">G — Good</option>
                          <option value="S">S — Satisfactory</option>
                          <option value="F">F — Fair</option>
                          <option value="U">U — Unsatisfactory</option>
                          <option value="P">P — Poor</option>
                          <option value="D">D — Disruption</option>
                        </select>
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">
                          {getConductGrade(student.id) || '—'}
                        </span>
                      )}
                    </td>

                    {/* Comments */}
                    <td className="px-2 py-1 text-center">
                      {canEdit ? (
                        <button
                          onClick={() => openCommentPicker(student.id)}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          {getCommentNumbers(student.id).length > 0
                            ? getCommentNumbers(student.id).join(', ')
                            : 'Set…'}
                        </button>
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">
                          {getCommentNumbers(student.id).length > 0
                            ? getCommentNumbers(student.id).join(', ')
                            : '—'}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Comment picker row */}
                  {openCommentPickerId === student.id && (
                    <tr key={`${student.id}-picker`}>
                      <td
                        colSpan={2 + effectiveColumns.length + (showAverage ? 1 : 0) + 2}
                        className="px-4 py-3 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-700"
                      >
                        <div className="max-w-xl">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                            {tempCommentSelection.length > 0
                              ? `Selected: ${tempCommentSelection.join(', ')}`
                              : 'Select up to 5 comments'}
                          </p>
                          <div className="grid grid-cols-1 gap-0.5 max-h-48 overflow-y-auto pr-1">
                            {COMMENT_KEY.map((text, i) => {
                              const num = i + 1;
                              const isChecked = tempCommentSelection.includes(num);
                              const isDisabled =
                                !isChecked && tempCommentSelection.length >= 5;
                              return (
                                <label
                                  key={num}
                                  className={`flex items-start gap-2 text-xs py-1 px-1 rounded select-none ${
                                    isDisabled
                                      ? 'opacity-40 cursor-not-allowed'
                                      : 'hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={isDisabled}
                                    onChange={() => !isDisabled && toggleTempComment(num)}
                                    className="mt-0.5 shrink-0"
                                  />
                                  <span className="dark:text-gray-200">
                                    <span className="font-medium">{num}.</span> {text}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => confirmCommentPicker(student.id)}
                              className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer"
                            >
                              Done
                            </button>
                            <button
                              onClick={() => setOpenCommentPickerId(null)}
                              className="px-3 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-200 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Column Creation Modal */}
      {showColumnModal && gradebookId && (
        <ColumnCreationModal
          gradebookId={gradebookId}
          institutionId={institutionId ?? ''}
          subjectId={selectedSubjectId}
          userId={user?.uid ?? ''}
          existingWeightTotal={weightTotal}
          existingColumnCount={effectiveColumns.length}
          onCreated={handleColumnCreated}
          onClose={() => setShowColumnModal(false)}
        />
      )}

      {/* Column Edit Modal */}
      {editingColumn && (
        <ColumnEditModal
          column={editingColumn}
          otherColumnsWeightTotal={
            effectiveColumns
              .filter((c) => c.id !== editingColumn.id)
              .reduce((s, c) => s + (c.columnWeight ?? 0), 0)
          }
          affectedStudentCount={affectedCountForColumn(editingColumn.id)}
          onSave={handleColumnEditSave}
          onClose={() => setEditingColumn(null)}
          canDelete={
            !isCompletedTerm &&
            !saving &&
            (editingColumn.createdBy === user?.uid || role === 'institution_admin')
          }
          onDelete={handleColumnDelete}
        />
      )}
    </div>
  );
};

export default GradebookPage;
