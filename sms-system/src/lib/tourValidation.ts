import { tourBridge } from '@/lib/tourBridge';
import {
  GRADEBOOK_TERM_STEP_INDEX,
  GRADEBOOK_CLASS_STEP_INDEX,
  GRADEBOOK_SUBJECT_STEP_INDEX,
  GRADEBOOK_ADD_COLUMN_STEP_INDEX,
} from '@/lib/useTourSteps';

type ValidationStep = {
  validation: () => boolean | Promise<boolean>;
  validationMessage: string;
};

// Keyed by tour name, then step index. Consulted by TourCard.tsx before it allows
// "Next" to advance the tour.
type ValidationConfig = Record<string, Record<number, ValidationStep>>;

export const tourValidation: ValidationConfig = {
  gradebook: {
    [GRADEBOOK_TERM_STEP_INDEX]: {
      validation: () => tourBridge.gradebookSelectedTermId !== '',
      validationMessage: 'Select a term to continue.',
    },
    [GRADEBOOK_CLASS_STEP_INDEX]: {
      validation: () => tourBridge.gradebookSelectedClassId !== '',
      validationMessage: 'Select a class to continue.',
    },
    [GRADEBOOK_SUBJECT_STEP_INDEX]: {
      validation: () => tourBridge.gradebookSelectedSubjectId !== '',
      validationMessage: 'Select a subject to continue.',
    },
    [GRADEBOOK_ADD_COLUMN_STEP_INDEX]: {
      validation: () => tourBridge.gradebookColumnModalOpen,
      validationMessage: 'Click "+ Column" to open the form before continuing.',
    },
  },
};
