import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GradebookColumnDocument } from '@/lib/firebase';

const columnSchema = z.object({
  label: z.string().min(1, 'Label is required.').max(100),
  assessmentType: z.enum(['coursework', 'exam'] as const, {
    errorMap: () => ({ message: 'Type is required.' }),
  }),
  maxScore: z.coerce.number().int().min(1, 'Max score must be at least 1.'),
  columnWeight: z.coerce.number().int().min(0).max(100),
  date: z.string().optional(),
});

type ColumnFormData = z.infer<typeof columnSchema>;

type Props = {
  gradebookId: string;
  institutionId: string;
  subjectId: string;
  userId: string;
  existingWeightTotal: number;
  existingColumnCount: number;
  onCreated: (col: GradebookColumnDocument & { id: string }) => void;
  onClose: () => void;
};

const ColumnCreationModal = ({
  gradebookId,
  institutionId,
  subjectId,
  userId,
  existingWeightTotal,
  existingColumnCount,
  onCreated,
  onClose,
}: Props) => {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ColumnFormData>({ resolver: zodResolver(columnSchema) });

  const watchedWeight = Number(watch('columnWeight') ?? 0);
  const remaining = 100 - existingWeightTotal;
  const wouldExceed = watchedWeight + existingWeightTotal > 100;

  const onSubmit = handleSubmit(async (data) => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const colPayload = {
        label: data.label,
        assessmentType: data.assessmentType,
        maxScore: data.maxScore,
        columnWeight: data.columnWeight,
        order: existingColumnCount + 1,
        ...(data.date ? { date: data.date } : {}),
        institutionId,
        subjectId,
        createdBy: userId,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(
        collection(db, 'gradebooks', gradebookId, 'columns'),
        colPayload,
      );
      onCreated({ id: ref.id, ...colPayload } as GradebookColumnDocument & { id: string });
      onClose();
    } catch (err) {
      console.error('ColumnCreationModal error:', err);
      setSubmitError('Failed to create column. Please try again.');
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold mb-4 dark:text-white">Add column</h2>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>

          {/* Label */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-300">Label</label>
            <input
              type="text"
              {...register('label')}
              placeholder="e.g. Week 3 Test"
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            {errors.label && <p className="text-xs text-red-400">{errors.label.message}</p>}
          </div>

          {/* Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-300">Type</label>
            <select
              {...register('assessmentType')}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer"
            >
              <option value="">Select type</option>
              <option value="coursework">Coursework</option>
              <option value="exam">Exam</option>
            </select>
            {errors.assessmentType && (
              <p className="text-xs text-red-400">{errors.assessmentType.message}</p>
            )}
          </div>

          {/* Max Score */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-300">Max Score</label>
            <input
              type="number"
              {...register('maxScore')}
              min={1}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            {errors.maxScore && <p className="text-xs text-red-400">{errors.maxScore.message}</p>}
          </div>

          {/* Weight */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-300">Weight (%)</label>
            <input
              type="number"
              {...register('columnWeight')}
              min={0}
              max={100}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            {errors.columnWeight && (
              <p className="text-xs text-red-400">{errors.columnWeight.message}</p>
            )}
            <p className={`text-xs ${wouldExceed ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
              Remaining: {remaining}%
              {wouldExceed ? ' — weight total would exceed 100%' : ''}
            </p>
          </div>

          {/* Date (optional) */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-300">Date (optional)</label>
            <input
              type="date"
              {...register('date')}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>

          {submitError && <p className="text-xs text-red-500">{submitError}</p>}

          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Creating…' : 'Add Column'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ColumnCreationModal;
