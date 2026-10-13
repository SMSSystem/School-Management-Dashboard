import { useParams } from "react-router-dom";
import { useAllInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import { formatSubjectFrequency } from "@/lib/subjectFrequency";
import { assistantOf, subjectTeacherList } from "@/lib/subjectTeachers";
import {
  DetailBackLink,
  DetailCard,
  DetailFields,
  DetailLoading,
  DetailNotFound,
  DetailSection,
} from "@/components/detail/DetailParts";

const LIST_PATH = "/dashboard/list/subjects";

// Read-only subject detail, opened from the eye button on the Subjects list: the
// summary, the teachers, and the classes it covers. Everything is on the subject
// document (names are denormalised onto it), so this reads nothing beyond the
// shared cached subjects list.
const SubjectDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: subjects, isLoading } = useAllInstitutionSubjects();
  const subject = subjects?.find((s) => s.id === id);

  if (isLoading) return <DetailLoading />;
  if (!subject) return <DetailNotFound what="Subject" backTo={LIST_PATH} backLabel="Back to Subjects" />;

  const teachers = subjectTeacherList(subject);
  const assistantId = assistantOf(subject)?.id;
  const classNames = subject.classNames ?? [];

  return (
    <div className="p-4 flex flex-col gap-4">
      <DetailBackLink to={LIST_PATH} label="Back to Subjects" />

      <DetailCard title={subject.name}>
        {subject.description ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">{subject.description}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">No description.</p>
        )}
        <DetailFields
          rows={[
            { label: "Attendance", value: formatSubjectFrequency(subject) },
            { label: "Coursework weight", value: `${subject.cwWeight}%` },
            { label: "Exam weight", value: `${subject.examWeight}%` },
          ]}
        />
      </DetailCard>

      <DetailSection title={`Teachers (${teachers.length})`}>
        {teachers.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No teachers are assigned to this subject yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
            {[...teachers]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <li key={t.id} className="py-2 text-sm">
                  {t.name}
                  {t.id === assistantId && <span className="ml-2 text-xs text-gray-400">Assistant</span>}
                </li>
              ))}
          </ul>
        )}
      </DetailSection>

      <DetailSection title="Classes">
        {subject.classScope === "institution" ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Every class in the institution.</p>
        ) : classNames.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No classes are assigned to this subject yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {[...classNames]
              .sort((a, b) => a.localeCompare(b))
              .map((name, i) => (
                <li
                  key={`${name}-${i}`}
                  className="rounded-full bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-200 px-3 py-1 text-xs font-medium"
                >
                  {name}
                </li>
              ))}
          </ul>
        )}
      </DetailSection>
    </div>
  );
};

export default SubjectDetailPage;
