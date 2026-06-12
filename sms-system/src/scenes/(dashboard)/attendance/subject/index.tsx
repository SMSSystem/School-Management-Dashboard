import { useAuth } from '@/lib/AuthContext';

export default function SubjectAttendancePage() {
  const { role } = useAuth();
  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Subject Attendance</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Subject-level attendance registers are coming in a future release.
      </p>
      {role === 'institution_admin' && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Subject Attendance is a Phase 2 feature. Once enabled, you will be able to view and manage subject-level registers for all teachers.
        </p>
      )}
    </div>
  );
}
