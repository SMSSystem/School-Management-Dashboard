import FilterSelect from "@/components/FilterSelect";
import ResultCount from "@/components/ResultCount";
import SubjectFilterChips from "@/components/SubjectFilterChips";

// The Subject filter above a list (Assignments, Exams, a student's or parent's Exams): the Subject dropdown and the
// count on one line, the chips under them from the md width up. The value and the remembering live in
// hooks/useSubjectFilter.ts; the page shows this only when there are two or more subjects to choose between.
export default function SubjectFilterBar({
  subjects,
  active,
  onChange,
  matching,
  total,
  page,
  singular,
  plural,
  loading,
}: {
  subjects: readonly string[];
  active: string;
  onChange: (subject: string) => void;
  matching: number;
  total: number;
  page: number;
  singular: string;
  plural: string;
  loading: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterSelect
          label="Subject"
          allLabel="All subjects"
          options={subjects.map((s) => ({ value: s, label: s }))}
          value={active}
          onChange={onChange}
        />
        <ResultCount
          matching={matching}
          total={total}
          page={page}
          singular={singular}
          plural={plural}
          loading={loading}
        />
      </div>
      <SubjectFilterChips
        subjects={subjects}
        active={active}
        onChange={onChange}
      />
    </div>
  );
}
