import { useCallback, useEffect, useState } from 'react';
import type { GradebookColumnDocument } from '@/types/assessment';
import { loadGradebookData, reloadGradebookResults } from '@/lib/gradebookSave';
import type { FeedbackDoc, ResultDoc, StudentDoc } from '@/lib/gradebookLogic';

// The Gradebook page's data for the chosen class, subject and term, the changes not yet saved, and the
// save state. Choosing something else loads a fresh gradebook and drops every unsaved change.
export function useGradebookState({
  institutionId,
  gradebookId,
  selectedClassId,
  selectedSubjectId,
  selectedTermId,
}: {
  institutionId: string | null;
  gradebookId: string | null;
  selectedClassId: string;
  selectedSubjectId: string;
  selectedTermId: string;
}) {
  // Per-selection data (one-time fetch)
  const [students, setStudents] = useState<StudentDoc[]>([]);
  const [columns, setColumns] = useState<
    (GradebookColumnDocument & { id: string })[]
  >([]);
  const [results, setResults] = useState<ResultDoc[]>([]);
  const [feedback, setFeedback] = useState<FeedbackDoc[]>([]);
  const [gradebookExists, setGradebookExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Dirty / pending state
  const [dirtyScores, setDirtyScores] = useState<
    Record<string, Record<string, number | "">>
  >({});
  const [dirtyConduct, setDirtyConduct] = useState<Record<string, string>>({});
  const [dirtyComments, setDirtyComments] = useState<Record<string, number[]>>(
    {},
  );
  const [pendingColumnEdits, setPendingColumnEdits] = useState<
    Record<string, Partial<GradebookColumnDocument>>
  >({});

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
      const data = await loadGradebookData({
        institutionId,
        gradebookId,
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        termId: selectedTermId,
      });
      setStudents(data.students);
      setColumns(data.columns);
      setResults(data.results);
      setFeedback(data.feedback);
      setGradebookExists(data.exists);
    } catch (err) {
      console.error("GradebookPage load error:", err);
      setLoadError(
        "Failed to load gradebook data. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    institutionId,
    gradebookId,
    selectedClassId,
    selectedSubjectId,
    selectedTermId,
  ]);

  useEffect(() => {
    if (
      selectedClassId &&
      selectedSubjectId &&
      selectedTermId &&
      institutionId
    ) {
      loadGradebook();
    }
  }, [
    selectedClassId,
    selectedSubjectId,
    selectedTermId,
    institutionId,
    loadGradebook,
  ]);

  // Re-fetch only results (after save, to pick up new doc IDs)
  const reloadResults = useCallback(async () => {
    if (
      !institutionId ||
      !selectedClassId ||
      !selectedSubjectId ||
      !selectedTermId
    )
      return;
    try {
      setResults(
        await reloadGradebookResults({
          institutionId,
          classId: selectedClassId,
          subjectId: selectedSubjectId,
          termId: selectedTermId,
        }),
      );
    } catch (err) {
      console.error("reloadResults error:", err);
    }
  }, [institutionId, selectedClassId, selectedSubjectId, selectedTermId]);

  return {
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
  };
}
