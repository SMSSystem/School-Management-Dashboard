import type { ReactNode } from "react";
import { SELECT_CLS, BTN_CLS } from "./importStyles";

type Option = { id: string; name: string };

// The Gradebook target's extra step: the one class, subject and term the file belongs to.
export function GradebookSetupStep({
  resetAll,
  gbClassId,
  setGbClassId,
  gbClasses,
  gbSubjectId,
  setGbSubjectId,
  gbSubjects,
  gbTermId,
  setGbTermId,
  gbTerms,
  gbSetupError,
  busy,
  confirmGradebookSetup,
}: {
  resetAll: () => void;
  gbClassId: string;
  setGbClassId: (id: string) => void;
  gbClasses: Option[];
  gbSubjectId: string;
  setGbSubjectId: (id: string) => void;
  gbSubjects: Option[];
  gbTermId: string;
  setGbTermId: (id: string) => void;
  gbTerms: Option[];
  gbSetupError: ReactNode;
  busy: boolean;
  confirmGradebookSetup: () => Promise<void>;
}) {
  return (
    <div>
      <button type="button" className="text-sm text-sky-600 dark:text-sky-400 underline mb-3" onClick={resetAll}>
        &larr; Change target
      </button>
      <p className="text-base mb-2">
        Pick the gradebook this import will fill in — the same Class, Subject, and Term you'd pick to open it on
        the Gradebook page. Every row in the file must belong to this one gradebook.
      </p>
      <div className="flex flex-col gap-2">
        <select className={SELECT_CLS} value={gbClassId} onChange={(e) => setGbClassId(e.target.value)}>
          <option value="">Select a class…</option>
          {gbClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className={SELECT_CLS} value={gbSubjectId} onChange={(e) => setGbSubjectId(e.target.value)}>
          <option value="">Select a subject…</option>
          {gbSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className={SELECT_CLS} value={gbTermId} onChange={(e) => setGbTermId(e.target.value)}>
          <option value="">Select a term…</option>
          {gbTerms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      {gbSetupError && <p className="text-sm text-red-500 mt-2">{gbSetupError}</p>}
      <button
        type="button"
        className={`${BTN_CLS} mt-3`}
        disabled={!gbClassId || !gbSubjectId || !gbTermId || busy}
        onClick={() => void confirmGradebookSetup()}
      >
        {busy ? "Checking…" : "Continue"}
      </button>
    </div>
  );
}
