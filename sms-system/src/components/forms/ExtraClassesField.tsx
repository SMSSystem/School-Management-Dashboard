import { useEffect, useState } from "react";
import { fetchInstitutionSubjects, type InstitutionSubject } from "@/hooks/useInstitutionSubjects";
import { onLoadError } from "@/lib/reportError";
import { subjectsForClass } from "@/lib/classSubjects";

// "Additional classes" for a student (see lib/studentClasses.ts): besides the home class, the student can
// be in further classes. For each one the admin chooses between every subject of that class (the default)
// and only chosen subjects. `classSubjects[id]` being an array, even an empty one, is "chosen subjects"
// while editing; the form's membershipError() refuses an empty one on save.
export type ExtraClassesValue = {
  extraClassIds: string[];
  classSubjects: Record<string, string[]>;
};

type Props = {
  institutionId: string;
  classes: { id: string; name: string }[];
  homeClassId: string;
  value: ExtraClassesValue;
  onChange: (next: ExtraClassesValue) => void;
  error?: string;
};

const labelCls = "text-sm font-medium text-gray-700 dark:text-gray-200";

export default function ExtraClassesField({ institutionId, classes, homeClassId, value, onChange, error }: Props) {
  const [subjects, setSubjects] = useState<InstitutionSubject[]>([]);

  // Only needed to list a class's subjects once "Chosen subjects" is picked; read once, from the cache.
  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    let cancelled = false;
    fetchInstitutionSubjects(institutionId, null, undefined).then((rows) => {
      if (!cancelled) setSubjects(rows);
    }, onLoadError("subjects", undefined, { quiet: true }));
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  const candidates = classes.filter((c) => c.id !== homeClassId);

  const toggleClass = (id: string, on: boolean) => {
    const extraClassIds = on ? [...value.extraClassIds, id] : value.extraClassIds.filter((x) => x !== id);
    const classSubjects = { ...value.classSubjects };
    if (!on) delete classSubjects[id];
    onChange({ extraClassIds, classSubjects });
  };

  const setMode = (id: string, chosen: boolean) => {
    const classSubjects = { ...value.classSubjects };
    if (chosen) classSubjects[id] = classSubjects[id] ?? [];
    else delete classSubjects[id];
    onChange({ ...value, classSubjects });
  };

  const toggleSubject = (classId: string, subjectId: string, on: boolean) => {
    const current = value.classSubjects[classId] ?? [];
    const next = on ? [...current, subjectId] : current.filter((s) => s !== subjectId);
    onChange({ ...value, classSubjects: { ...value.classSubjects, [classId]: next } });
  };

  return (
    <fieldset className="flex flex-col gap-2 w-full" aria-describedby="extra-classes-help">
      <legend className={labelCls}>
        Additional classes <span className="font-normal text-gray-400">(optional)</span>
      </legend>
      <p id="extra-classes-help" className="text-xs text-gray-500 dark:text-gray-400">
        {homeClassId
          ? "The student also belongs to these classes, for rosters, registers, gradebooks and what they see. Report cards and the general register stay with the class above."
          : "Choose a class above first."}
      </p>
      {homeClassId && candidates.length === 0 && <p className="text-xs text-gray-400">There are no other classes.</p>}
      {homeClassId &&
        candidates.map((c) => {
          const checked = value.extraClassIds.includes(c.id);
          const chosen = checked && Array.isArray(value.classSubjects[c.id]);
          const classSubjectList = subjectsForClass(subjects, c.id);
          return (
            <div key={c.id} className="flex flex-col gap-1 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={checked} onChange={(e) => toggleClass(c.id, e.target.checked)} />
                {c.name}
              </label>
              {checked && (
                <div className="ml-6 flex flex-col gap-1 text-sm">
                  <div className="flex gap-4" role="radiogroup" aria-label={`Subjects in ${c.name}`}>
                    <label className="flex items-center gap-1">
                      <input type="radio" name={`mode-${c.id}`} checked={!chosen} onChange={() => setMode(c.id, false)} />
                      All subjects
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" name={`mode-${c.id}`} checked={chosen} onChange={() => setMode(c.id, true)} />
                      Chosen subjects
                    </label>
                  </div>
                  {chosen && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {classSubjectList.length === 0 && <span className="text-xs text-gray-400">This class has no subjects yet.</span>}
                      {classSubjectList.map((s) => (
                        <label key={s.id} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={(value.classSubjects[c.id] ?? []).includes(s.id)}
                            onChange={(e) => toggleSubject(c.id, s.id, e.target.checked)}
                          />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </fieldset>
  );
}
