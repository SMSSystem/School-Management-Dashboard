import { useEffect } from 'react';
import { useNextStep } from 'nextstepjs';
import { tourBridge } from '@/lib/tourBridge';
import { GRADEBOOK_COLUMN_MODAL_OPEN_STEP_INDICES } from '@/lib/useTourSteps';

// The Gradebook page's side of its product tour: publishes the modal and the selection to tourBridge, and
// closes the "Add column" modal once the tour steps outside the range that needs it.
export function useGradebookTourBridge({
  showColumnModal,
  setShowColumnModal,
  selectedTermId,
  selectedClassId,
  selectedSubjectId,
}: {
  showColumnModal: boolean;
  setShowColumnModal: (open: boolean) => void;
  selectedTermId: string;
  selectedClassId: string;
  selectedSubjectId: string;
}) {
  const { currentTour, currentStep, isNextStepVisible } = useNextStep();

  // ---------------------------------------------------------------------------
  // Tour integration — the "Add column" walkthrough steps only make sense while
  // this modal is open. tourBridge lets the (hook-free) tour validation read live
  // modal state; the second effect closes the modal once the tour steps outside
  // the range that needs it (Next past the last field, Prev back out, or the tour
  // ending/skipping/switching).
  // ---------------------------------------------------------------------------

  useEffect(() => {
    tourBridge.gradebookColumnModalOpen = showColumnModal;
  }, [showColumnModal]);

  useEffect(() => {
    tourBridge.gradebookSelectedTermId = selectedTermId;
  }, [selectedTermId]);

  useEffect(() => {
    tourBridge.gradebookSelectedClassId = selectedClassId;
  }, [selectedClassId]);

  useEffect(() => {
    tourBridge.gradebookSelectedSubjectId = selectedSubjectId;
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!showColumnModal) return;
    // Only a tour drives this modal closed automatically — leave modals opened
    // through normal (non-tour) use alone.
    const gradebookTourActive =
      isNextStepVisible && currentTour === "gradebook";
    if (!gradebookTourActive) return;
    if (!GRADEBOOK_COLUMN_MODAL_OPEN_STEP_INDICES.includes(currentStep)) {
      setShowColumnModal(false);
    }
  // setShowColumnModal is the page's useState setter, so it never changes; listed to satisfy the lint rule.
  }, [currentTour, currentStep, isNextStepVisible, showColumnModal, setShowColumnModal]);
}
