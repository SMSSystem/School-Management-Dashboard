import { useState } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { writeBatch, doc, collection } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { db, getRoleLabel, type Role, type ActivityLogEntry } from "@/lib/firebase";
import {
  parentsData,
  studentsData,
  teachersData,
  activityLogData,
  auditLogData,
  USE_MOCK,
} from "@/lib/data";

const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().optional(),
  emergencyContact: z.string().optional(),
});
type ContactFormValues = z.infer<typeof contactSchema>;

const toFormValue = (v: string) => (v === "—" ? "" : v);

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
  type = "text",
}: {
  label: string;
  value: string;
  type?: string;
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {label}
    </span>
    <input type={type} value={value} readOnly className={readOnlyClassName} />
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
  const {
    user,
    role,
    institutionId,
    displayName,
    phone: authPhone,
    address: authAddress,
    userStatus,
    department: authDepartment,
    emergencyContact: authEmergencyContact,
    linkedAccounts: authLinkedAccounts,
    refreshProfile,
  } = useAuth();
  const currentRole: Role = role ?? "institution_admin";
  const teacher = teachersData[0] ?? {
    name: "—",
    email: "—",
    phone: "—",
    photo: "/avatar.png",
    teacherId: "—",
    subjects: [] as string[],
    classes: [] as string[],
    address: "—",
    department: "—",
    emergencyContact: "—",
    schedule: "—",
    metrics: "—",
    status: "—",
    linkedAccounts: "—",
  };
  const student = studentsData[0] ?? {
    name: "—",
    email: "—",
    phone: "—",
    photo: "/avatar.png",
    studentId: "—",
    grade: 0,
    class: "—",
    address: "—",
    homeroom: "—",
    guardians: [] as string[],
    attendanceSummary: "—",
    gpa: "—",
    emergencyContact: "—",
    status: "—",
    linkedAccounts: "—",
  };
  const parent = parentsData[0] ?? {
    name: "—",
    email: "—",
    phone: "—",
    address: "—",
    students: [] as string[],
    photo: "/avatar.png",
    parentId: "—",
    relationship: "—",
    studentPerformance: "—",
    childAttendance: "—",
    emergencyContact: "—",
    status: "—",
    linkedAccounts: "—",
  };

  const fmtDate = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
        })
      : "—";
  const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })} - ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
  };
  const createdAt = fmtDate(user?.metadata?.creationTime);
  const lastLogin = fmtDateTime(user?.metadata?.lastSignInTime);
  const displayStatus = (s: string | null) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";

  const profileByRole: Record<Role, ProfileData> = {
    super_admin: {
      name: displayName ?? user?.displayName ?? "—",
      email: user?.email ?? "—",
      phone: "—",
      photo: user?.photoURL ?? "/avatar.png",
      userId: user?.uid ?? "—",
      status: displayStatus(userStatus),
      createdAt,
      lastLogin,
      linkedAccounts: USE_MOCK
        ? "Platform Dashboard"
        : (authLinkedAccounts ?? "—"),
      emergencyContact: "—",
      timezone: "UTC",
      language: "English (US)",
      address: "—",
    },
    institution_admin: {
      name: displayName ?? user?.displayName ?? "—",
      email: user?.email ?? "—",
      phone: USE_MOCK ? "555-0001" : (authPhone ?? "—"),
      photo: user?.photoURL ?? "/avatar.png",
      userId: user?.uid ?? "—",
      status: displayStatus(userStatus),
      createdAt,
      lastLogin,
      linkedAccounts: USE_MOCK
        ? "Google Workspace, Microsoft 365"
        : (authLinkedAccounts ?? "—"),
      emergencyContact: USE_MOCK
        ? "Sarah Doe - 555-0051"
        : (authEmergencyContact ?? "—"),
      timezone: "America/Chicago",
      language: "English (US)",
      address: USE_MOCK ? "123 Main St, Anytown, USA" : (authAddress ?? "—"),
    },
    regular_teacher: {
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone,
      photo: teacher.photo,
      userId:
        teacher.teacherId !== "—" ? teacher.teacherId : (user?.uid ?? "—"),
      status: teacher.status,
      createdAt,
      lastLogin,
      linkedAccounts: teacher.linkedAccounts,
      emergencyContact: teacher.emergencyContact,
      timezone: "America/Chicago",
      language: "English (US)",
      address: teacher.address,
    },
    senior_teacher: {
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone,
      photo: teacher.photo,
      userId:
        teacher.teacherId !== "—" ? teacher.teacherId : (user?.uid ?? "—"),
      status: teacher.status,
      createdAt,
      lastLogin,
      linkedAccounts: teacher.linkedAccounts,
      emergencyContact: teacher.emergencyContact,
      timezone: "America/Chicago",
      language: "English (US)",
      address: teacher.address,
    },
    student: {
      name: student.name,
      email: student.email,
      phone: student.phone,
      photo: student.photo,
      userId:
        student.studentId !== "—" ? student.studentId : (user?.uid ?? "—"),
      status: student.status,
      createdAt,
      lastLogin,
      linkedAccounts: student.linkedAccounts,
      emergencyContact: student.emergencyContact,
      timezone: "America/Chicago",
      language: "English (US)",
      address: student.address,
    },
    parent: {
      name: parent.name,
      email: parent.email,
      phone: parent.phone,
      photo: parent.photo,
      userId: parent.parentId !== "—" ? parent.parentId : (user?.uid ?? "—"),
      status: parent.status,
      createdAt,
      lastLogin,
      linkedAccounts: parent.linkedAccounts,
      emergencyContact: parent.emergencyContact,
      timezone: "America/Chicago",
      language: "English (US)",
      address: parent.address,
    },
  };

  const profile = profileByRole[currentRole];
  const roleLabel = getRoleLabel(currentRole);

  const canEditContactInfo =
    currentRole === "super_admin" || currentRole === "institution_admin";

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: toFormValue(profile.name),
      phone: toFormValue(profile.phone),
      emergencyContact: toFormValue(profile.emergencyContact),
    },
  });

  const [saveError, setSaveError] = useState<string | null>(null);

  const onSubmit = async (values: ContactFormValues) => {
    if (!user?.uid) return;
    setSaveError(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", user.uid), {
        name: values.name,
        phone: values.phone ?? "",
        emergencyContact: values.emergencyContact ?? "",
      });
      const logRef = doc(collection(db, "users", user.uid, "activity_log"));
      const logInstitutionId =
        institutionId === "*" ? "" : (institutionId ?? "");
      batch.set(logRef, {
        eventType: "profile_update",
        detail: "Contact info updated",
        timestamp: new Date().toISOString(),
        uid: user.uid,
        institutionId: logInstitutionId,
      });
      await batch.commit();
      await refreshProfile();
      reset(values);
    } catch {
      setSaveError("Failed to save. Please try again.");
    }
  };

  const roleDetails: Record<Role, { label: string; value: string }[]> = {
    super_admin: [
      { label: "Access level", value: "Platform-wide" },
      { label: "Institutions managed", value: "All" },
      { label: "Permissions", value: "Full platform access" },
    ],
    institution_admin: [
      {
        label: "Department",
        value: USE_MOCK ? "Operations" : (authDepartment ?? "—"),
      },
      { label: "Campus", value: USE_MOCK ? "Main Campus" : "—" },
      { label: "Permissions", value: "Full access, User management, Reports" },
      {
        label: "Linked relationships",
        value: USE_MOCK ? "District leadership, IT" : "—",
      },
    ],
    regular_teacher: [
      { label: "Employee ID", value: teacher.teacherId },
      { label: "Department", value: teacher.department },
      { label: "Subjects", value: teacher.subjects.join(", ") || "—" },
      { label: "Assigned classes", value: teacher.classes.join(", ") || "—" },
      { label: "Schedule", value: teacher.schedule },
      { label: "Metrics", value: teacher.metrics },
    ],
    senior_teacher: [
      { label: "Employee ID", value: teacher.teacherId },
      { label: "Department", value: teacher.department },
      { label: "Department Head", value: "Yes" },
      { label: "Subjects", value: teacher.subjects.join(", ") || "—" },
      { label: "Assigned classes", value: teacher.classes.join(", ") || "—" },
      { label: "Schedule", value: teacher.schedule },
      { label: "Metrics", value: teacher.metrics },
    ],
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

  const signInEntry: ActivityLogEntry[] =
    USE_MOCK && user?.metadata?.lastSignInTime
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

  const activity = [...signInEntry, ...activityLogData];
  const auditEvents = auditLogData;

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
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {profile.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
                {roleLabel}
              </span>
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                {profile.status}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7 flex flex-col gap-4">
          <Section
            title="Contact info"
            subtitle={
              canEditContactInfo
                ? "Editable: name, phone, emergency contact. View-only: email and address."
                : "View-only account contact information."
            }
          >
            {canEditContactInfo ? (
              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      Display name
                    </span>
                    <input
                      type="text"
                      className={inputClassName}
                      {...register("name")}
                    />
                    {errors.name && (
                      <span className="text-xs text-red-500 mt-0.5">
                        {errors.name.message}
                      </span>
                    )}
                  </div>
                  <Field label="Email" value={profile.email} type="email" />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      Phone
                    </span>
                    <input
                      type="text"
                      className={inputClassName}
                      {...register("phone")}
                    />
                    {errors.phone && (
                      <span className="text-xs text-red-500 mt-0.5">
                        {errors.phone.message}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      Emergency contact
                    </span>
                    <input
                      type="text"
                      className={inputClassName}
                      {...register("emergencyContact")}
                    />
                    {errors.emergencyContact && (
                      <span className="text-xs text-red-500 mt-0.5">
                        {errors.emergencyContact.message}
                      </span>
                    )}
                  </div>
                  <Field label="Address" value={profile.address} />
                </div>
                {saveError && (
                  <p className="mt-3 text-xs text-red-500">{saveError}</p>
                )}
                {isDirty && (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? "Saving…" : "Save contact info"}
                    </button>
                  </div>
                )}
              </form>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Display name" value={profile.name} />
                <Field label="Email" value={profile.email} type="email" />
                <Field label="Phone" value={profile.phone} />
                <Field
                  label="Emergency contact"
                  value={profile.emergencyContact}
                />
                <Field label="Address" value={profile.address} />
              </div>
            )}
          </Section>

          <Section
            title="Role-specific details"
            subtitle="Assigned information for this role."
          >
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
        </div>

        <div className="col-span-12 xl:col-span-5 flex flex-col gap-4">
          <Section
            title="Account details"
            subtitle="View-only account metadata."
          >
            <div className="grid grid-cols-1 gap-4">
              <Field label="Role" value={roleLabel} />
              <Field label="Status" value={profile.status} />
              <Field label="User ID" value={profile.userId} />
              <Field label="Created date" value={profile.createdAt} />
              <Field label="Last login" value={profile.lastLogin} />
              <Field label="Linked accounts" value={profile.linkedAccounts} />
            </div>
          </Section>

          {activity.length > 0 && (
            <Section
              title="Activity"
              subtitle="Recent logins and profile updates."
            >
              <div className="space-y-3">
                {activity.map((item) => (
                  <div
                    key={`${item.eventType}-${item.timestamp}`}
                    className="rounded-md border border-gray-100 dark:border-gray-700 p-3"
                  >
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {item.eventType === "sign_in"
                        ? "Signed in"
                        : item.eventType === "photo_update"
                          ? "Updated profile photo"
                          : item.eventType === "notification_change"
                            ? "Changed notification preferences"
                            : item.eventType}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {item.detail}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {fmtDateTime(item.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      {(currentRole === "institution_admin" || currentRole === "super_admin") &&
        (auditEvents.length > 0 ? (
          <Section
            title="Audit and security events"
            subtitle="Visible to admins only."
            action={
              currentRole === "super_admin" ? (
                <a
                  href="/admin/audit-log"
                  className="text-xs font-semibold text-sky-600 hover:underline"
                >
                  View full audit log →
                </a>
              ) : null
            }
          >
            <div className="space-y-3">
              {auditEvents.map((item) => (
                <div
                  key={`${item.eventType}-${item.timestamp}`}
                  className="rounded-md border border-gray-100 dark:border-gray-700 p-3"
                >
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {item.detail}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.eventType}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {fmtDateTime(item.timestamp)}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        ) : currentRole === "super_admin" ? (
          <Section
            title="Audit and security events"
            subtitle="Visible to admins only."
          >
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Platform-wide access — query audit events by institution on the
              audit log page.
            </p>
            <a
              href="/admin/audit-log"
              className="inline-block px-4 py-2 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition"
            >
              View audit log
            </a>
          </Section>
        ) : null)}
    </div>
  );
};

export default ProfilePage;
