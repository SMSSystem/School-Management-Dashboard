import type { ReactNode } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getRoleLabel, type Role } from "@/lib/firebase";
import { parentsData, studentsData, teachersData } from "@/lib/data";

type ProfileData = {
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

const inputClassName =
  "w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/40 px-3 py-2 text-slate-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-sky-400";
const readOnlyClassName =
  "w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 px-3 py-2 text-gray-700 dark:text-gray-200";

const Field = ({
  label,
  value,
  editable = false,
  type = "text",
}: {
  label: string;
  value: string;
  editable?: boolean;
  type?: string;
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {label}
    </span>
    {editable ? (
      <input type={type} defaultValue={value} className={inputClassName} />
    ) : (
      <input type={type} value={value} readOnly className={readOnlyClassName} />
    )}
  </div>
);

const Section = ({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="bg-white dark:bg-gray-800 rounded-md p-4 shadow-sm">
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        {subtitle ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
    {children}
  </section>
);

const ProfilePage = () => {
  const { role } = useAuth();
  const currentRole: Role = role ?? "institution_admin";
  const teacher = teachersData[0] ?? { name: "", email: "", phone: "", photo: "/avatar.png", teacherId: "", subjects: [] as string[], classes: [] as string[], address: "" };
  const student = studentsData[0] ?? { name: "", email: "", phone: "", photo: "/avatar.png", studentId: "", grade: 0, class: "", address: "" };
  const parent  = parentsData[0]  ?? { name: "", email: "", phone: "", address: "", students: [] as string[] };

  const profileByRole: Record<Role, ProfileData> = {
    super_admin: {
      name: "Platform Admin",
      email: "admin@platform.com",
      phone: "—",
      photo: "/avatar.png",
      userId: "SA-0001",
      status: "Active",
      createdAt: "Jan 01, 2024",
      lastLogin: "Jan 29, 2026 - 10:00 AM",
      linkedAccounts: "Platform Dashboard",
      emergencyContact: "—",
      timezone: "UTC",
      language: "English (US)",
      address: "—",
    },
    institution_admin: {
      name: "John Doe",
      email: "admin@school.com",
      phone: "1234567890",
      photo: "/avatar.png",
      userId: "ADM-0012",
      status: "Active",
      createdAt: "Jan 10, 2025",
      lastLogin: "Jan 29, 2026 - 09:12 AM",
      linkedAccounts: "Google Workspace, Microsoft 365",
      emergencyContact: "Sarah Doe - 5550100",
      timezone: "America/Chicago",
      language: "English (US)",
      address: "123 Main St, Anytown, USA",
    },
    regular_teacher: {
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone,
      photo: teacher.photo,
      userId: `T-${teacher.teacherId}`,
      status: "Active",
      createdAt: "Aug 18, 2023",
      lastLogin: "Jan 29, 2026 - 08:05 AM",
      linkedAccounts: "Google Classroom",
      emergencyContact: "Alex Rivera - 5550138",
      timezone: "America/Chicago",
      language: "English (US)",
      address: teacher.address,
    },
    senior_teacher: {
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone,
      photo: teacher.photo,
      userId: `T-${teacher.teacherId}`,
      status: "Active",
      createdAt: "Aug 18, 2023",
      lastLogin: "Jan 29, 2026 - 08:05 AM",
      linkedAccounts: "Google Classroom",
      emergencyContact: "Alex Rivera - 5550138",
      timezone: "America/Chicago",
      language: "English (US)",
      address: teacher.address,
    },
    student: {
      name: student.name,
      email: student.email,
      phone: student.phone,
      photo: student.photo,
      userId: `S-${student.studentId}`,
      status: "Active",
      createdAt: "Sep 02, 2024",
      lastLogin: "Jan 28, 2026 - 04:20 PM",
      linkedAccounts: "Student Portal",
      emergencyContact: "John Doe - 5550102",
      timezone: "America/Chicago",
      language: "English (US)",
      address: student.address,
    },
    parent: {
      name: parent.name,
      email: parent.email,
      phone: parent.phone,
      photo: "/avatar.png",
      userId: "P-1008",
      status: "Active",
      createdAt: "Oct 05, 2024",
      lastLogin: "Jan 29, 2026 - 07:45 AM",
      linkedAccounts: "Family Portal",
      emergencyContact: "Mara Doe - 5550191",
      timezone: "America/Chicago",
      language: "English (US)",
      address: parent.address,
    },
  };

  const profile = profileByRole[currentRole];
  const roleLabel = getRoleLabel(currentRole);

  const roleDetails: Record<Role, { label: string; value: string }[]> = {
    super_admin: [
      { label: "Access level", value: "Platform-wide" },
      { label: "Institutions managed", value: "All" },
      { label: "Permissions", value: "Full platform access" },
    ],
    institution_admin: [
      { label: "Department", value: "Operations" },
      { label: "Campus", value: "Main Campus" },
      { label: "Permissions", value: "Full access, User management, Reports" },
      { label: "Linked relationships", value: "District leadership, IT" },
    ],
    regular_teacher: [
      { label: "Employee ID", value: teacher.teacherId },
      { label: "Department", value: "Science" },
      { label: "Subjects", value: teacher.subjects.join(", ") },
      { label: "Assigned classes", value: teacher.classes.join(", ") },
      { label: "Schedule", value: "Mon-Fri, 08:00 AM - 03:00 PM" },
      { label: "Metrics", value: "Avg score 86%, Attendance 94%" },
    ],
    senior_teacher: [
      { label: "Employee ID", value: teacher.teacherId },
      { label: "Department", value: "Science" },
      { label: "Department Head", value: "Yes" },
      { label: "Subjects", value: teacher.subjects.join(", ") },
      { label: "Assigned classes", value: teacher.classes.join(", ") },
      { label: "Schedule", value: "Mon-Fri, 08:00 AM - 03:00 PM" },
      { label: "Metrics", value: "Avg score 86%, Attendance 94%" },
    ],
    student: [
      { label: "Student ID", value: student.studentId },
      { label: "Grade and class", value: `Grade ${student.grade} - ${student.class}` },
      { label: "Homeroom", value: "Room 12B" },
      { label: "Guardians", value: "John Doe, Sarah Doe" },
      { label: "Attendance summary", value: "96% YTD" },
      { label: "GPA / grades", value: "3.6 GPA" },
    ],
    parent: [
      { label: "Linked students", value: parent.students.join(", ") },
      { label: "Relationship", value: "Parent / Guardian" },
      { label: "Student performance", value: "On track (last term)" },
      { label: "Attendance", value: "Average 95%" },
    ],
  };

  const activity = [
    {
      title: "Signed in",
      detail: "Chrome on Windows - Houston, TX",
      time: "Jan 29, 2026 - 09:12 AM",
    },
    {
      title: "Updated profile photo",
      detail: "Profile header",
      time: "Jan 25, 2026 - 02:10 PM",
    },
    {
      title: "Changed notification preferences",
      detail: "Email + SMS enabled",
      time: "Jan 20, 2026 - 11:05 AM",
    },
  ];

  const auditEvents = [
    {
      title: "Password reset issued",
      detail: "User: Sarah Brewer",
      time: "Jan 28, 2026 - 04:45 PM",
    },
    {
      title: "Role updated",
      detail: "Teacher to Department Lead",
      time: "Jan 18, 2026 - 10:05 AM",
    },
  ];

  return (
    <div className="p-4 flex flex-col gap-4">
      <section className="bg-white dark:bg-gray-800 rounded-md p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative w-20 h-20">
            <img
              src={profile.photo}
              alt={`${profile.name} avatar`}
              className="w-20 h-20 rounded-full object-cover ring-4 ring-sky-100 dark:ring-gray-700"
            />
            <button
              type="button"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-sky-600 text-white flex items-center justify-center shadow-sm hover:bg-sky-700 transition"
              aria-label="Change profile photo"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path d="M9 4a1 1 0 0 0-.8.4L7.2 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.2l-1-1.6A1 1 0 0 0 13 4H9zm3 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" />
              </svg>
            </button>
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {profile.name}
              </h1>
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
                {roleLabel}
              </span>
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                {profile.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              User ID: {profile.userId} | Created: {profile.createdAt} | Last
              login: {profile.lastLogin}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900 transition"
            >
              Edit profile
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition"
            >
              Save changes
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7 flex flex-col gap-4">
          <Section
            title="Contact info"
            subtitle="Editable: name, phone, emergency contact. View-only: email."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Display name" value={profile.name} editable />
              <Field label="Email" value={profile.email} type="email" />
              <Field label="Phone" value={profile.phone} editable />
              <Field
                label="Emergency contact"
                value={profile.emergencyContact}
                editable
              />
              <Field label="Address" value={profile.address} />
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition"
              >
                Save contact info
              </button>
            </div>
          </Section>

          <Section title="Security" subtitle="Manage password, 2FA, and sessions.">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Password
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Last changed: Jan 10, 2026
                  </p>
                </div>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900 transition"
                >
                  Change password
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Two-factor authentication
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Not enabled
                  </p>
                </div>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200 hover:bg-sky-200 dark:hover:bg-sky-900 transition"
                >
                  Enable 2FA
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Active sessions
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    2 devices signed in
                  </p>
                </div>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-900/30 transition"
                >
                  Sign out all
                </button>
              </div>
            </div>
          </Section>

          <Section
            title="Preferences"
            subtitle="Timezone, language, and notification settings."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Timezone
                </span>
                <select defaultValue={profile.timezone} className={inputClassName}>
                  <option value="America/Chicago">America/Chicago</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Language
                </span>
                <select defaultValue={profile.language} className={inputClassName}>
                  <option value="English (US)">English (US)</option>
                  <option value="English (UK)">English (UK)</option>
                  <option value="Spanish">Spanish</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Notifications
              </p>
              <div className="mt-2 flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-200">
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-sky-600" />
                  Email notifications
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-sky-600" />
                  SMS alerts
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-sky-600" />
                  Push notifications
                </label>
              </div>
            </div>
          </Section>
        </div>

        <div className="col-span-12 xl:col-span-5 flex flex-col gap-4">
          <Section title="Account details" subtitle="View-only account metadata.">
            <div className="grid grid-cols-1 gap-4">
              <Field label="Role" value={roleLabel} />
              <Field label="Status" value={profile.status} />
              <Field label="User ID" value={profile.userId} />
              <Field label="Created date" value={profile.createdAt} />
              <Field label="Last login" value={profile.lastLogin} />
              <Field label="Linked accounts" value={profile.linkedAccounts} />
            </div>
          </Section>

          <Section title="Role-specific details" subtitle="Assigned information for this role.">
            <div className="space-y-3">
              {roleDetails[currentRole].map((item) => (
                <div key={item.label} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {item.label}
                  </span>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Activity" subtitle="Recent logins and profile updates.">
            <div className="space-y-3">
              {activity.map((item) => (
                <div
                  key={`${item.title}-${item.time}`}
                  className="rounded-md border border-gray-100 dark:border-gray-700 p-3"
                >
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {item.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.detail}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {item.time}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          {(currentRole === "institution_admin" || currentRole === "super_admin") && (
            <Section title="Audit and security events" subtitle="Visible to admins only.">
              <div className="space-y-3">
                {auditEvents.map((item) => (
                  <div
                    key={`${item.title}-${item.time}`}
                    className="rounded-md border border-gray-100 dark:border-gray-700 p-3"
                  >
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {item.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {item.detail}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {item.time}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(currentRole === "institution_admin" || currentRole === "super_admin") && (
            <Section
              title="Admin controls"
              subtitle="Edit other users: contact info, status, permissions, and relationships."
            >
              <div className="space-y-4">
                <Field label="Selected user" value="Sarah Brewer" />
                <Field label="Role (managed in user admin)" value="Student" />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Status
                  </span>
                  <select defaultValue="Active" className={inputClassName}>
                    <option value="Active">Active</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Locked">Locked</option>
                  </select>
                </div>
                <Field label="Department" value="Grade 5" editable />
                <Field label="Campus" value="North Campus" editable />
                <Field label="Contact phone" value="555-0102" editable />
                <Field label="Linked relationships" value="Parent: John Doe" editable />

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Permissions
                  </p>
                  <div className="mt-2 flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked className="h-4 w-4 accent-sky-600" />
                      View grades
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked className="h-4 w-4 accent-sky-600" />
                      Submit assignments
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="h-4 w-4 accent-sky-600" />
                      Access extracurriculars
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition"
                  >
                    Save admin changes
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-semibold rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-900/30 transition"
                  >
                    Reset password
                  </button>
                </div>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
