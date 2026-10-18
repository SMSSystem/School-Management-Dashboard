import FormModal from "@/components/FormModal";
import { DISCIPLINARY_ACTION_LABELS } from "@/lib/firebase";
import { canWrite } from "@/lib/roleCapabilities";
import type { Role } from "@/types/people";
import { DISCIPLINARY_BADGE_CLS, formatLongDate, type DisciplinaryEntry, type Student } from "@/lib/studentDetailLogic";

// The term's disciplinary record (staff and a spectator see it), with the entry forms for those who may write.
export function DisciplinarySection({
  disciplinaryActions,
  isAdmin,
  role,
  student,
  id,
  selectedTermId,
}: {
  disciplinaryActions: DisciplinaryEntry[];
  isAdmin: boolean;
  role: Role | null;
  student: Student;
  id: string | undefined;
  selectedTermId: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Disciplinary Record</h2>
        {canWrite(role) && (
          <FormModal
            table="disciplinary_action"
            type="create"
            data={{
              studentId: id ?? "",
              studentName: student.name,
              classId: student.classId ?? "",
              termId: selectedTermId,
            }}
          />
        )}
      </div>

      {disciplinaryActions.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">
          No disciplinary entries recorded for this term.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
          {disciplinaryActions.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DISCIPLINARY_BADGE_CLS[a.type]}`}
                  >
                    {DISCIPLINARY_ACTION_LABELS[a.type]}
                  </span>
                  <span className="text-gray-900 dark:text-gray-100 truncate">
                    {a.reason}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {formatLongDate(a.date)}
                  {" · Issued by "}
                  {a.issuedByName}
                </span>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2 shrink-0">
                  <FormModal
                    table="disciplinary_action"
                    type="update"
                    data={
                      a as unknown as Record<
                        string,
                        string | number | readonly string[] | undefined
                      >
                    }
                  />
                  <FormModal
                    table="disciplinary_action"
                    type="delete"
                    id={a.id}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
