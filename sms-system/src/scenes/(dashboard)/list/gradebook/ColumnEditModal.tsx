import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { GradebookColumnDocument } from '@/lib/firebase';

const columnSchema = z.object({
  label: z.string().min(1, 'Label is required.').max(100),
  assessmentType: z.enum(['coursework', 'exam'] as const, {
    error: 'Type is required.',
  }),
  maxScore: z.number().int().min(1, 'Max score must be at least 1.'),
  columnWeight: z.number().int().min(0).max(100),
  date: z.string().optional(),
});

type ColumnFormData = z.infer<typeof columnSchema>;

type PendingWarning = {
  field: 'assessmentType' | 'maxScore' | 'columnWeight';
  label: string;
  affectedCount: number;
};

type Props = {
  column: GradebookColumnDocument & { id: string };
  otherColumnsWeightTotal: number;
  affectedStudentCount: number;
  onSave: (colId: string, updates: Partial<GradebookColumnDocument>) => void;
  onClose: () => void;
};

const ColumnEditModal = ({
  column,
  otherColumnsWeightTotal,
  affectedStudentCount,
  onSave,
  onClose,
}: Props) => {
  const [pendingWarning, setPendingWarning] = useState<PendingWarning | null>(null);
  const [prevFieldValue, setPrevFieldValue] = useState<number | string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ColumnFormData>({
    resolver: zodResolver(columnSchema),
    defaultValues: {
      label: column.label,
      assessmentType: column.assessmentType,
      maxScore: column.maxScore,
      columnWeight: column.columnWeight,
      date: column.date ?? '',
    },
  });

  const watchedWeight = Number(watch('columnWeight') ?? column.columnWeight);
  const totalWeight = otherColumnsWeightTotal + watchedWeight;
  const weightIsOff = Math.abs(totalWeight - 100) > 0.01;

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value as 'coursework' | 'exam';
    if (newVal !== column.assessmentType && affectedStudentCount > 0) {
      setPrevFieldValue(watch('assessmentType'));
      setValue('assessmentType', newVal);
      setPendingWarning({ field: 'assessmentType', label: 'Type', affectedCount: affectedStudentCount });
    } else {
      setValue('assessmentType', newVal);
    }
  };

  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = Number(e.target.value);
    if (newVal !== column.columnWeight && affectedStudentCount > 0 && pendingWarning === null) {
      setPrevFieldValue(watch('columnWeight'));
      setValue('columnWeight', newVal);
      setPendingWarning({ field: 'columnWeight', label: 'Weight', affectedCount: affectedStudentCount });
    } else {
      setValue('columnWeight', newVal);
    }
  };

  const handleMaxScoreBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const newVal = Number(e.target.value);
    if (newVal !== column.maxScore && affectedStudentCount > 0 && pendingWarning === null) {
      setPrevFieldValue(watch('maxScore'));
      setValue('maxScore', newVal);
      setPendingWarning({
        field: 'maxScore',
        label: 'Max Score',
        affectedCount: affectedStudentCount,
      });
    }
  };

  const confirmWarning = () => {
    setPendingWarning(null);
    setPrevFieldValue(null);
  };

  const cancelWarning = () => {
    if (pendingWarning && prevFieldValue !== null) {
      setValue(pendingWarning.field, prevFieldValue as never);
    }
    setPendingWarning(null);
    setPrevFieldValue(null);
  };

  const onSubmit = handleSubmit((data) => {
    onSave(column.id, {
      label: data.label,
      assessmentType: data.assessmentType,
      maxScore: data.maxScore,
      columnWeight: data.columnWeight,
      ...(data.date ? { date: data.date } : { date: undefined }),
    });
    onClose();
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold mb-4 dark:text-white">Edit column</h2>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>

          {/* Warning dialog */}
          {pendingWarning && (
            <div className="bg-amber-50 border border-amber-300 rounded-md p-3 dark:bg-amber-900/30 dark:border-amber-600">
              <p className="text-sm text-amber-800 dark:text-amber-300 mb-2">
                {pendingWarning.field === 'maxScore'
                  ? `Changing Max Score will update ${pendingWarning.affectedCount} existing score record(s). Existing scores will be proportionally scaled. Continue?`
                  : `Changing ${pendingWarning.label} will update ${pendingWarning.affectedCount} existing score record(s). Continue?`}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmWarning}
                  className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 cursor-pointer"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={cancelWarning}
                  className="px-3 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Label */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-300">Label</label>
            <input
              type="text"
              {...register('label')}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            {errors.label && <p className="text-xs text-red-400">{errors.label.message}</p>}
          </div>

          {/* Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-300">Type</label>
            <select
              value={watch('assessmentType')}
              onChange={handleTypeChange}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer"
            >
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
              {...register('maxScore', { valueAsNumber: true })}
              min={1}
              onBlur={handleMaxScoreBlur}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            {errors.maxScore && <p className="text-xs text-red-400">{errors.maxScore.message}</p>}
          </div>

          {/* Weight */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-300">Weight (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={watch('columnWeight') ?? column.columnWeight}
              onChange={handleWeightChange}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            {errors.columnWeight && (
              <p className="text-xs text-red-400">{errors.columnWeight.message}</p>
            )}
            <p className={`text-xs ${weightIsOff ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
              Total: {totalWeight}%{weightIsOff ? ' — weight total is not 100%' : ''}
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
              disabled={pendingWarning !== null}
              className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
            >
              Update
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ColumnEditModal;
