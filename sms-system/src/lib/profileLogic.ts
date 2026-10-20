import { z } from "@/lib/zod";
import type { User } from "firebase/auth";
import type { ActivityLogEntry, Role } from "@/lib/firebase";
import type { parentsData, studentsData, teachersData } from "@/lib/data";

// The profile page's rules that need no screen or database (scenes/(dashboard)/profile): the contact form's
// validation, how dates and statuses are shown, the record shown for each role (the mock record when there is
// one, else what the signed-in account carries), the two tables with the page's fields for every role, and the
// sample activity shown in mock mode.

export const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().optional(),
  emergencyContact: z.string().optional(),
});
export type ContactFormValues = z.infer<typeof contactSchema>;

export const toFormValue = (v: string) => (v === "—" ? "" : v);

export type ProfileData = {
  name: string;
  email: string;
  phone: string;
  photo: string;
  userId: string;
  status: string;
  createdAt: string;
  lastLogin: string;
  linkedAccounts: string;
  emergencyContact: string;
  timezone: string;
  language: string;
  address: string;
};

/** What the signed-in account carries (from useAuth and the Firebase user). */
export type AuthProfileValues = {
  uid: string | undefined;
  email: string | null | undefined;
  authDisplayName: string | null | undefined;
  displayName: string | null;
  phone: string | null;
  address: string | null;
  department: string | null;
  emergencyContact: string | null;
  linkedAccounts: string | null;
  photoUrl: string | null;
  userStatus: string | null;
};

/** A status as shown: first letter capitalised, "—" when there is none. */
export const displayStatus = (s: string | null | undefined) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";

export const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      })
    : "—";

export const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })} - ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
};

/** The teacher record shown: the mock one when there is one, else built from the account. */
export function teacherRecordFor(mock: (typeof teachersData)[number] | undefined, a: AuthProfileValues) {
  return (
    mock ?? {
      name: a.displayName ?? "—",
      email: a.email ?? "—",
      phone: a.phone ?? "—",
      photo: a.photoUrl ?? "/avatar.png",
      teacherId: a.uid ?? "—",
      subjects: [] as string[],
      classes: [] as string[],
      address: a.address ?? "—",
      department: a.department ?? "—",
      emergencyContact: a.emergencyContact ?? "—",
      schedule: "—",
      metrics: "—",
      status: displayStatus(a.userStatus),
      linkedAccounts: a.linkedAccounts ?? "—",
    }
  );
}

/** The student record shown: the mock one when there is one, else built from the account. */
export function studentRecordFor(mock: (typeof studentsData)[number] | undefined, a: AuthProfileValues) {
  return (
    mock ?? {
      name: a.displayName ?? "—",
      email: a.email ?? "—",
      phone: a.phone ?? "—",
      photo: a.photoUrl ?? "/avatar.png",
      studentId: a.uid ?? "—",
      grade: 0,
      class: "—",
      address: a.address ?? "—",
      homeroom: "—",
      guardians: [] as string[],
      attendanceSummary: "—",
      gpa: "—",
      emergencyContact: a.emergencyContact ?? "—",
      status: displayStatus(a.userStatus),
      linkedAccounts: a.linkedAccounts ?? "—",
    }
  );
}

/** The parent record shown: the mock one when there is one, else built from the account. */
export function parentRecordFor(mock: (typeof parentsData)[number] | undefined, a: AuthProfileValues) {
  return (
    mock ?? {
      name: a.displayName ?? "—",
      email: a.email ?? "—",
      phone: a.phone ?? "—",
      address: a.address ?? "—",
      students: [] as string[],
      photo: a.photoUrl ?? "/avatar.png",
      parentId: a.uid ?? "—",
      relationship: "—",
      studentPerformance: "—",
      childAttendance: "—",
      emergencyContact: a.emergencyContact ?? "—",
      status: displayStatus(a.userStatus),
      linkedAccounts: a.linkedAccounts ?? "—",
    }
  );
}

type Teacher = ReturnType<typeof teacherRecordFor>;
type Student = ReturnType<typeof studentRecordFor>;
type Parent = ReturnType<typeof parentRecordFor>;

/** What a teacher, student or parent record gives the profile page. */
type RecordShown = {
  name: string;
  email: string;
  phone: string;
  photo: string;
  status: string;
  linkedAccounts: string;
  emergencyContact: string;
  address: string;
};

/** The profile shown for each role. */
export function buildProfileByRole({
  a,
  teacher,
  student,
  parent,
  createdAt,
  lastLogin,
  useMock,
}: {
  a: AuthProfileValues;
  teacher: Teacher;
  student: Student;
  parent: Parent;
  createdAt: string;
  lastLogin: string;
  useMock: boolean;
}): Record<Role, ProfileData> {
  // The administrator and the spectator are shown the same fields.
  const staff = (): ProfileData => ({
    name: a.displayName ?? a.authDisplayName ?? "—",
    email: a.email ?? "—",
    phone: useMock ? "555-0001" : (a.phone ?? "—"),
    photo: a.photoUrl ?? "/avatar.png",
    userId: a.uid ?? "—",
    status: displayStatus(a.userStatus),
    createdAt,
    lastLogin,
    linkedAccounts: useMock
      ? "Google Workspace, Microsoft 365"
      : (a.linkedAccounts ?? "—"),
    emergencyContact: useMock
      ? "Sarah Doe - 555-0051"
      : (a.emergencyContact ?? "—"),
    timezone: "America/Chicago",
    language: "English (US)",
    address: useMock ? "123 Main St, Anytown, USA" : (a.address ?? "—"),
  });
  // A teacher, student or parent is shown the record they carry (the mock one when there is one).
  const fromRecord = (r: RecordShown, ownId: string): ProfileData => ({
    name: r.name,
    email: r.email,
    phone: r.phone,
    photo: r.photo,
    userId: ownId !== "—" ? ownId : (a.uid ?? "—"),
    status: r.status,
    createdAt,
    lastLogin,
    linkedAccounts: r.linkedAccounts,
    emergencyContact: r.emergencyContact,
    timezone: "America/Chicago",
    language: "English (US)",
    address: r.address,
  });

  return {
    super_admin: {
      name: a.displayName ?? a.authDisplayName ?? "—",
      email: a.email ?? "—",
      phone: "—",
      photo: a.photoUrl ?? "/avatar.png",
      userId: a.uid ?? "—",
      status: displayStatus(a.userStatus),
      createdAt,
      lastLogin,
      linkedAccounts: useMock
        ? "Platform Dashboard"
        : (a.linkedAccounts ?? "—"),
      emergencyContact: "—",
      timezone: "UTC",
      language: "English (US)",
      address: "—",
    },
    institution_admin: staff(),
    spectator: staff(),
    regular_teacher: fromRecord(teacher, teacher.teacherId),
    senior_teacher: fromRecord(teacher, teacher.teacherId),
    student: fromRecord(student, student.studentId),
    parent: fromRecord(parent, parent.parentId),
  };
}

/** The "Role-specific Details" rows shown for each role. */
export function buildRoleDetails({
  teacher,
  student,
  parent,
  authDepartment,
  useMock,
}: {
  teacher: Teacher;
  student: Student;
  parent: Parent;
  authDepartment: string | null;
  useMock: boolean;
}): Record<Role, { label: string; value: string }[]> {
  // A senior teacher has the regular teacher's rows with "Department Head" after Department.
  const teacherRows = (head: boolean) => [
    { label: "Employee ID", value: teacher.teacherId },
    { label: "Department", value: teacher.department },
    ...(head ? [{ label: "Department Head", value: "Yes" }] : []),
    { label: "Subjects", value: teacher.subjects.join(", ") || "—" },
    { label: "Assigned classes", value: teacher.classes.join(", ") || "—" },
    { label: "Schedule", value: teacher.schedule },
    { label: "Metrics", value: teacher.metrics },
  ];
  return {
    super_admin: [
      { label: "Access level", value: "Platform-wide" },
      { label: "Institutions managed", value: "All" },
      { label: "Permissions", value: "Full platform access" },
    ],
    institution_admin: [
      {
        label: "Department",
        value: useMock ? "Operations" : (authDepartment ?? "—"),
      },
      { label: "Permissions", value: "Full access, User management, Reports" },
    ],
    spectator: [
      { label: "Access level", value: "Read-only" },
      { label: "Permissions", value: "View-only access to institution data" },
    ],
    regular_teacher: teacherRows(false),
    senior_teacher: teacherRows(true),
    student: [
      { label: "Student ID", value: student.studentId },
      {
        label: "Grade and class",
        value: student.grade
          ? `Grade ${student.grade} - ${student.class}`
          : "—",
      },
      { label: "Homeroom", value: student.homeroom },
      { label: "Guardians", value: student.guardians.join(", ") || "—" },
      { label: "Attendance summary", value: student.attendanceSummary },
      { label: "GPA / grades", value: student.gpa },
    ],
    parent: [
      { label: "Linked students", value: parent.students.join(", ") || "—" },
      { label: "Relationship", value: parent.relationship },
      { label: "Student performance", value: parent.studentPerformance },
      { label: "Attendance", value: parent.childAttendance },
    ],
  };
}

/** The sample activity shown in mock mode: a sign-in entry for the current session, then the sample log. */
export function mockActivityFor({
  useMock,
  user,
  activityLog,
}: {
  useMock: boolean;
  user: Pick<User, "uid" | "metadata"> | null;
  activityLog: ActivityLogEntry[];
}): ActivityLogEntry[] {
  const signInEntry: ActivityLogEntry[] =
    useMock && user?.metadata?.lastSignInTime
      ? [
          {
            eventType: "sign_in" as const,
            detail: "Chrome on Windows",
            timestamp: user.metadata.lastSignInTime,
            uid: user.uid,
            institutionId: "",
          },
        ]
      : [];

  return useMock ? [...signInEntry, ...activityLog] : [];
}
