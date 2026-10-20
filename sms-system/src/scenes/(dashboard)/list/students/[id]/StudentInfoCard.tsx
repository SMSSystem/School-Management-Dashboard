import FormModal from "@/components/FormModal";
import type { Role } from "@/types/people";
import type { Student } from "@/lib/studentDetailLogic";

// The student card: photo, name, the edit form (institution admin only) and the information rows.
export function StudentInfoCard({
  student,
  photoUrl,
  role,
  refreshPhoto,
  infoRows,
}: {
  student: Student;
  photoUrl: string | null;
  role: Role | null;
  refreshPhoto: () => void;
  infoRows: { label: string; value: string | null | undefined }[];
}) {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-md flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="w-16 h-16 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-sky-500 flex items-center justify-center text-white text-lg font-semibold shrink-0">
              {(student.name[0] ?? "?").toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold">{student.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Student
            </p>
          </div>
        </div>
        {role === "institution_admin" && (
          // UserDocument's optional fields are typed `| null`; FormModal's
          // generic FormRecord doesn't allow null (matching how every
          // other page's own narrower row types satisfy it naturally). A
          // null here means exactly the same thing to StudentForm's own
          // defaultValues fallbacks (`?? ""`) as undefined does.
          <FormModal
            table="student"
            type="update"
            data={student as unknown as Record<string, string | number | readonly string[] | undefined>}
            onClose={refreshPhoto}
          />
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
        {infoRows.map(({ label, value }) => (
          <div key={label} className="flex gap-2">
            <dt className="font-medium text-gray-500 dark:text-gray-400 w-32 shrink-0">
              {label}
            </dt>
            <dd className="text-gray-900 dark:text-gray-100">
              {value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
