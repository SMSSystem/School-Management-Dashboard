import type { FieldErrors } from "react-hook-form";
import { DAY_OPTIONS, type Frequency, type SubjectFormValues } from "@/lib/subjectFormLogic";

// How often the subject's attendance is taken: daily (with or without Saturdays), weekly or fortnightly on the
// ticked days, and for fortnightly which weeks of the term it starts on.
export default function FrequencyFields({
  frequency,
  includeSaturday,
  selectedDays,
  fortnightlyOffset,
  errors,
  handleFrequencyChange,
  handleIncludeSaturdayChange,
  toggleDay,
  handleOffsetChange,
}: {
  frequency: Frequency;
  includeSaturday: boolean;
  selectedDays: number[];
  fortnightlyOffset: 0 | 1;
  errors: FieldErrors<SubjectFormValues>;
  handleFrequencyChange: (f: Frequency) => void;
  handleIncludeSaturdayChange: (include: boolean) => void;
  toggleDay: (day: number) => void;
  handleOffsetChange: (offset: 0 | 1) => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="text-xs text-gray-500 dark:text-gray-300">Attendance Frequency</label>
      <div className="flex gap-6">
        {(['daily', 'weekly', 'fortnightly'] as const).map((f) => (
          <label key={f} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              checked={frequency === f}
              onChange={() => handleFrequencyChange(f)}
            />
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </label>
        ))}
      </div>

      {frequency === 'daily' && (
        <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={includeSaturday}
            onChange={(e) => handleIncludeSaturdayChange(e.target.checked)}
          />
          Include Saturdays
        </label>
      )}

      {frequency === 'weekly' && (
        <div className="flex flex-wrap gap-4 mt-1">
          {DAY_OPTIONS.map(({ label, value }) => (
            <label key={value} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectedDays.includes(value)}
                onChange={() => toggleDay(value)}
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {frequency === 'fortnightly' && (
        <>
          <div className="flex flex-wrap gap-4 mt-1">
            {DAY_OPTIONS.map(({ label, value }) => (
              <label key={value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDays.includes(value)}
                  onChange={() => toggleDay(value)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-6 mt-2">
            {([0, 1] as const).map((offset) => (
              <label key={offset} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={fortnightlyOffset === offset}
                  onChange={() => handleOffsetChange(offset)}
                />
                {offset === 0 ? 'Starts week 1 of term (odd weeks)' : 'Starts week 2 of term (even weeks)'}
              </label>
            ))}
          </div>
        </>
      )}

      {errors.sessionDayOfWeek?.message && (
        <p className="text-xs text-red-400">{errors.sessionDayOfWeek.message.toString()}</p>
      )}
    </div>
  );
}
