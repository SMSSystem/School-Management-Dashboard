import { useState, useEffect, useRef, useMemo } from "react";
import type { GradebookColumnDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useNextStep } from "nextstepjs";
import { useSidebar } from "@/lib/SidebarContext";
import ColumnCreationModal from "./ColumnCreationModal";
import ColumnEditModal from "./ColumnEditModal";
import { GradebookFilters } from "./GradebookFilters";
import { GradebookTable } from "./GradebookTable";
import { GradebookToolbar } from "./GradebookToolbar";
import { canWrite } from "@/lib/roleCapabilities";
import { useGradebookScope } from "@/hooks/useGradebookScope";
import { useGradebookState } from "@/hooks/useGradebookState";
import { useGradebookTourBridge } from "@/hooks/useGradebookTourBridge";
import { deleteGradebookColumn, saveGradebookChanges } from "@/lib/gradebookSave";
import {
  affectedCountOf,
  averageOf,
  commentNumbersOf,
  conductOf,
  effectiveColumnsOf,
  gradebookIdOf,
  hasScoreError,
  isDirtyOf,
  scoreOf,
  sharedTeacherNamesOf,
  weightTotalOf,
} from "@/lib/gradebookLogic";

// ---------------------------------------------------------------------------
// GradebookPage
// ---------------------------------------------------------------------------

const GradebookPage = () => {
  const { user, role, institutionId, displayName } = useAuth();
  const { startNextStep } = useNextStep();
  const { collapseForTour } = useSidebar();

  const {
    terms,
    classes,
    subjects,
    selectedTermId,
    setSelectedTermId,
    selectedClassId,
    setSelectedClassId,
    selectedSubjectId,
    setSelectedSubjectId,
    visibleClasses,
    visibleSubjects,
  } = useGradebookScope();

  const gradebookId = gradebookIdOf(selectedClassId, selectedSubjectId, selectedTermId);

  // Per-selection data, the unsaved changes and the save state live in useGradebookState.
  const {
    students,
    columns,
    setColumns,
    results,
    setResults,
    feedback,
    gradebookExists,
    setGradebookExists,
    loading,
    loadError,
    dirtyScores,
    setDirtyScores,
    dirtyConduct,
    setDirtyConduct,
    dirtyComments,
    setDirtyComments,
    pendingColumnEdits,
    setPendingColumnEdits,
    saving,
    setSaving,
    saveError,
    setSaveError,
    reloadResults,
  } = useGradebookState({ institutionId, gradebookId, selectedClassId, selectedSubjectId, selectedTermId });

  // Modal state
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingColumn, setEditingColumn] = useState<
    (GradebookColumnDocument & { id: string }) | null
  >(null);

  // Comment picker state
  const [openCommentPickerId, setOpenCommentPickerId] = useState<string | null>(
    null,
  );
  const [tempCommentSelection, setTempCommentSelection] = useState<number[]>(
    [],
  );

  // Keyboard nav refs
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

  // Refs for auto-save
  const isDirtyRef = useRef(false);
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useGradebookTourBridge({
    showColumnModal,
    setShowColumnModal,
    selectedTermId,
    selectedClassId,
    selectedSubjectId,
  });

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const effectiveColumns = useMemo(
    () => effectiveColumnsOf(columns, pendingColumnEdits),
    [columns, pendingColumnEdits],
  );

  const weightTotal = useMemo(() => weightTotalOf(effectiveColumns), [effectiveColumns]);

  const isDirty = isDirtyOf({ dirtyScores, dirtyConduct, dirtyComments, pendingColumnEdits });

  const selectedTerm = terms.find((t) => t.id === selectedTermId);
  const isCompletedTerm = selectedTerm?.status === "completed";
  const canEdit =
    (role === "institution_admin" ||
      role === "senior_teacher" ||
      role === "regular_teacher") &&
    !isCompletedTerm;
  // Save, "+ Column" and the per-column edit buttons. A spectator (read-only) and
  // a super admin (no institution) never get them; canEdit above additionally
  // keys the editable cells.
  const showEditControls = role !== "super_admin" && canWrite(role);

  const selectedSubjectDoc = subjects.find((s) => s.id === selectedSubjectId);
  const selectedClassName =
    classes.find((c) => c.id === selectedClassId)?.name ?? "";

  // Shared gradebook banner — show when subject has multiple teachers
  const sharedTeacherNames = useMemo(
    () => sharedTeacherNamesOf(selectedSubjectDoc, role, user?.uid),
    [selectedSubjectDoc, role, user?.uid],
  );
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
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const getScore = (studentId: string, colId: string): number | "" =>
    scoreOf(dirtyScores, results, studentId, colId);

  const getConductGrade = (studentId: string): string => conductOf(dirtyConduct, feedback, studentId);

  const getCommentNumbers = (studentId: string): number[] =>
    commentNumbersOf(dirtyComments, feedback, studentId);

  const hasScoreErrorFor = (studentId: string, colId: string, maxScore: number): boolean =>
    hasScoreError(dirtyScores, studentId, colId, maxScore);

  const computeAverage = (studentId: string): number => averageOf(effectiveColumns, getScore, studentId);

  const affectedCountForColumn = (colId: string): number => affectedCountOf(results, colId);

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
        if (score !== "" && Number(score) > col.maxScore) {
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
      await saveGradebookChanges({
        user,
        role,
        displayName,
        institutionId,
        gradebookId,
        gradebookExists,
        selectedClassId,
        selectedSubjectId,
        selectedTermId,
        selectedClassName,
        termName: selectedTerm?.name ?? "",
        subjects,
        students,
        columns,
        effectiveColumns,
        results,
        feedback,
        dirtyScores,
        dirtyConduct,
        dirtyComments,
        pendingColumnEdits,
      });

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
      console.error("Gradebook save error:", err);
      setSaveError("Save failed — please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Column handlers
  // ---------------------------------------------------------------------------

  const handleColumnCreated = (
    col: GradebookColumnDocument & { id: string },
  ) => {
    setColumns((prev) => [...prev, col].sort((a, b) => a.order - b.order));
  };

  const handleColumnEditSave = (
    colId: string,
    updates: Partial<GradebookColumnDocument>,
  ) => {
    setPendingColumnEdits((prev) => ({
      ...prev,
      [colId]: { ...(prev[colId] ?? {}), ...updates },
    }));
    setColumns((prev) =>
      prev.map((c) => (c.id === colId ? { ...c, ...updates } : c)),
    );
    setEditingColumn(null);
  };

  const handleColumnDelete = async (colId: string) => {
    if (!gradebookId || !institutionId)
      throw new Error("Missing gradebook context");

    const deletedColumn = columns.find((c) => c.id === colId);
    if (!deletedColumn) throw new Error("Column not found");
    const deletedOrder = deletedColumn.order;

    await deleteGradebookColumn({
      user,
      role,
      displayName,
      institutionId,
      gradebookId,
      deletedColumn,
      columns,
      results,
      selectedClassId,
      selectedClassName,
      subjectName: selectedSubjectDoc?.name ?? "",
      termName: selectedTerm?.name ?? "",
    });

    setColumns((prev) =>
      prev
        .filter((c) => c.id !== colId)
        .map((c) =>
          c.order > deletedOrder ? { ...c, order: c.order - 1 } : c,
        ),
    );
    setResults((prev) => prev.filter((r) => r.gradebookColumnId !== colId));
    setDirtyScores((prev) => {
      const next: Record<string, Record<string, number | "">> = {};
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
    setDirtyComments((prev) => ({
      ...prev,
      [studentId]: tempCommentSelection,
    }));
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
    if (e.key !== "Enter") return;
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

  const allSelected = !!(
    selectedTermId &&
    selectedClassId &&
    selectedSubjectId
  );
  const showAverage = effectiveColumns.length >= 2;
  const showWeightWarning =
    effectiveColumns.length > 0 && Math.abs(weightTotal - 100) > 0.01;

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4 overflow-auto">
      <GradebookFilters
        collapseForTour={collapseForTour}
        startNextStep={startNextStep}
        allSelected={allSelected}
        selectedSubjectDoc={selectedSubjectDoc}
        selectedClassName={selectedClassName}
        selectedTerm={selectedTerm}
        terms={terms}
        selectedTermId={selectedTermId}
        setSelectedTermId={setSelectedTermId}
        setSelectedSubjectId={setSelectedSubjectId}
        selectedClassId={selectedClassId}
        setSelectedClassId={setSelectedClassId}
        role={role}
        visibleClasses={visibleClasses}
        selectedSubjectId={selectedSubjectId}
        visibleSubjects={visibleSubjects}
      />

      <GradebookToolbar
        allSelected={allSelected}
        sharedTeacherNames={sharedTeacherNames}
        isDirty={isDirty}
        showEditControls={showEditControls}
        performSave={performSave}
        canEdit={canEdit}
        saving={saving}
        isCompletedTerm={isCompletedTerm}
        setShowColumnModal={setShowColumnModal}
        showWeightWarning={showWeightWarning}
        weightTotal={weightTotal}
        saveError={saveError}
        loading={loading}
        loadError={loadError}
      />

      <GradebookTable
        allSelected={allSelected}
        loading={loading}
        loadError={loadError}
        effectiveColumns={effectiveColumns}
        showEditControls={showEditControls}
        isCompletedTerm={isCompletedTerm}
        setEditingColumn={setEditingColumn}
        showAverage={showAverage}
        students={students}
        canEdit={canEdit}
        getScore={getScore}
        hasScoreErrorFor={hasScoreErrorFor}
        inputRefs={inputRefs}
        setDirtyScores={setDirtyScores}
        handleScoreKeyDown={handleScoreKeyDown}
        computeAverage={computeAverage}
        getConductGrade={getConductGrade}
        setDirtyConduct={setDirtyConduct}
        getCommentNumbers={getCommentNumbers}
        openCommentPicker={openCommentPicker}
        openCommentPickerId={openCommentPickerId}
        tempCommentSelection={tempCommentSelection}
        toggleTempComment={toggleTempComment}
        confirmCommentPicker={confirmCommentPicker}
        setOpenCommentPickerId={setOpenCommentPickerId}
        selectedSubjectDoc={selectedSubjectDoc}
      />

      {/* Column Creation Modal */}
      {showColumnModal && gradebookId && (
        <ColumnCreationModal
          gradebookId={gradebookId}
          institutionId={institutionId ?? ""}
          subjectId={selectedSubjectId}
          userId={user?.uid ?? ""}
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
          otherColumnsWeightTotal={effectiveColumns
            .filter((c) => c.id !== editingColumn.id)
            .reduce((s, c) => s + (c.columnWeight ?? 0), 0)}
          affectedStudentCount={affectedCountForColumn(editingColumn.id)}
          onSave={handleColumnEditSave}
          onClose={() => setEditingColumn(null)}
          canDelete={
            !isCompletedTerm &&
            !saving &&
            (editingColumn.createdBy === user?.uid ||
              role === "institution_admin")
          }
          onDelete={handleColumnDelete}
        />
      )}
    </div>
  );
};

export default GradebookPage;
