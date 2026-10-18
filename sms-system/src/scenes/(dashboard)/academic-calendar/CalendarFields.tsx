// The Academic Calendar page's small shared pieces: the not-set-up and loading states, and the field
// wrappers every wizard and form on the page uses.

// ─── Spinner ──────────────────────────────────────────────────────────────────

// What a read-only role (a spectator) sees where an editor would otherwise be
// shown the set-up wizard: the wizards only write, so there is nothing to view.
export function CalendarNotSetUp() {
  return (
    <div className="p-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        The academic calendar has not been set up yet.
      </p>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="h-8 w-8 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-gray-200">
      {children}
    </label>
  );
}

export function DateInput({ id, value, onChange, min, max }: { id?: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return (
    <input
      id={id}
      type="date"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
    />
  );
}

export function TextInput({ id, value, onChange, placeholder, maxLength }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number }) {
  return (
    <input
      id={id}
      type="text"
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
    />
  );
}

export function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 max-w-2xl">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h2>
      {children}
    </div>
  );
}
