import type { Dispatch, SetStateAction } from 'react';
import type { TermDocument } from '@/lib/firebase';
import { formatDate } from '@/lib/academicCalendarLogic';
import { DateInput, Label, TextInput } from './CalendarFields';

// The management view's list of terms, each with an inline edit form.

export function TermsSection({
  sortedTerms,
  editingTermId,
  setEditingTermId,
  termEdits,
  setTermEdits,
  savingTerm,
  saveTerm,
  today,
  mayEdit,
}: {
  sortedTerms: (TermDocument & { id: string })[];
  editingTermId: string | null;
  setEditingTermId: (id: string | null) => void;
  termEdits: Partial<TermDocument>;
  setTermEdits: Dispatch<SetStateAction<Partial<TermDocument>>>;
  savingTerm: boolean;
  saveTerm: (termId: string) => Promise<void>;
  today: string;
  mayEdit: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Terms</h2>
      <div className="space-y-3">
        {sortedTerms.map((t) => (
          <div key={t.id} className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            {editingTermId === t.id ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Label>
                  Name
                  <TextInput
                    id="tour-academic-calendar-term-edit-name"
                    value={termEdits.name ?? t.name}
                    onChange={(v) => setTermEdits((prev) => ({ ...prev, name: v }))}
                    maxLength={80}
                  />
                </Label>
                <Label>
                  Start date
                  <DateInput
                    id="tour-academic-calendar-term-edit-start"
                    value={(termEdits.startDate ?? t.startDate) as string}
                    onChange={(v) => setTermEdits((prev) => ({ ...prev, startDate: v }))}
                  />
                </Label>
                <Label>
                  End date
                  <DateInput
                    id="tour-academic-calendar-term-edit-end"
                    value={(termEdits.endDate ?? t.endDate) as string}
                    onChange={(v) => setTermEdits((prev) => ({ ...prev, endDate: v }))}
                  />
                </Label>
                <div className="sm:col-span-3 flex gap-2 mt-1">
                  <button id="tour-academic-calendar-term-edit-save" type="button" onClick={() => saveTerm(t.id)} disabled={savingTerm} className="text-xs font-medium text-sky-600 hover:underline disabled:text-gray-400">
                    {savingTerm ? 'Saving…' : 'Save'}
                  </button>
                  <button id="tour-academic-calendar-term-edit-cancel" type="button" onClick={() => { setEditingTermId(null); setTermEdits({}); }} className="text-xs text-gray-500 hover:underline">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t.name}</p>
                    {today >= (t.startDate as string) && today <= (t.endDate as string) && (
                      <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(t.startDate)} → {formatDate(t.endDate)}</p>
                </div>
                {mayEdit && (
                  <button
                    id={`tour-academic-calendar-term-${t.termNumber}-edit`}
                    type="button"
                    onClick={() => { setEditingTermId(t.id); setTermEdits({}); }}
                    className="text-xs text-sky-600 hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
