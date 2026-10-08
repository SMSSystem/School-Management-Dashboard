import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { writeBatch, doc, collection, getDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import {
  auth,
  db,
  getRoleLabel,
  type Role,
  type ActivityLogEntry,
} from "@/lib/firebase";
import {
  parentsData,
  studentsData,
  teachersData,
  activityLogData,
  USE_MOCK,
  DATA_MODE,
} from "@/lib/data";
import ProfilePageSkeleton from "@/components/ProfilePageSkeleton";
import ProfileSection from "@/components/profile/ProfileSection";
import ProfileActivitySection from "@/components/profile/ProfileActivitySection";
import ProfileAuditSection from "@/components/profile/ProfileAuditSection";
import { formatPhone, formatPhoneForDisplay } from "@/lib/phone";
import { usePhoneCanonicalizer } from "@/hooks/usePhoneCanonicalizer";

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
  "w-full min-h-11 sm:min-h-0 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/40 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-sky-400";
const readOnlyClassName =
  "w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 wrap-anywhere";

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {label}
    </span>
    <p className={readOnlyClassName}>{value || "—"}</p>
  </div>
);

const ProfileLoadError = ({ onRetry }: { onRetry: () => void }) => (
  <div className="p-4 flex flex-col items-center justify-center min-h-[60vh]">
    <div className="bg-white dark:bg-gray-800 rounded-md p-8 shadow-sm max-w-md w-full flex flex-col items-center gap-4 text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-12 h-12 text-red-500"
      >
        <path
          fillRule="evenodd"
          d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z"
          clipRule="evenodd"
        />
      </svg>
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Failed to load profile
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          There was a problem loading your profile data. Please try again.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition"
      >
        Retry
      </button>
    </div>
  </div>
);

const ProfilePage = () => {
  const {
    user,
    role,
    institutionId,
    institution,
    displayName,
    phone: authPhone,
    address: authAddress,
    userStatus,
    department: authDepartment,
    emergencyContact: authEmergencyContact,
    linkedAccounts: authLinkedAccounts,
    photoUrl,
    refreshProfile,
  } = useAuth();

  const [profileLoading, setProfileLoading] = useState(DATA_MODE === 'live');
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [freshLastSignIn, setFreshLastSignIn] = useState<string | null>(null);

  useEffect(() => {
    if (DATA_MODE !== 'live' || !user?.uid) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    setProfileLoadError(false);
    auth.currentUser?.reload().then(() => {
      setFreshLastSignIn(auth.currentUser?.metadata?.lastSignInTime ?? null);
    }).catch(() => {});
    getDoc(doc(db, 'users', user.uid))
      .then(() => setProfileLoading(false))
      .catch(() => {
        setProfileLoading(false);
        setProfileLoadError(true);
      });
  }, [user?.uid, retryCount]);

  // The Activity and "Audit and security events" sections (below) fetch and page
  // their own data (components/profile/): the account's own activity_log, the
  // audit_log entries the account performed (staff), and an institution_admin's
  // security events. The Retry button bumps `retryCount`, which restarts them.

  const currentRole: Role = role ?? "institution_admin";
  const liveStatus = (s: string | null | undefined) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
  const teacher = teachersData[0] ?? {
    name: displayName ?? "—",
    email: user?.email ?? "—",
    phone: authPhone ?? "—",
    photo: photoUrl ?? "/avatar.png",
    teacherId: user?.uid ?? "—",
    subjects: [] as string[],
    classes: [] as string[],
    address: authAddress ?? "—",
    department: authDepartment ?? "—",
    emergencyContact: authEmergencyContact ?? "—",
    schedule: "—",
    metrics: "—",
    status: liveStatus(userStatus),
    linkedAccounts: authLinkedAccounts ?? "—",
  };
  const student = studentsData[0] ?? {
    name: displayName ?? "—",
    email: user?.email ?? "—",
    phone: authPhone ?? "—",
    photo: photoUrl ?? "/avatar.png",
    studentId: user?.uid ?? "—",
    grade: 0,
    class: "—",
    address: authAddress ?? "—",
    homeroom: "—",
    guardians: [] as string[],
    attendanceSummary: "—",
    gpa: "—",
    emergencyContact: authEmergencyContact ?? "—",
    status: liveStatus(userStatus),
    linkedAccounts: authLinkedAccounts ?? "—",
  };
  const parent = parentsData[0] ?? {
    name: displayName ?? "—",
    email: user?.email ?? "—",
    phone: authPhone ?? "—",
    address: authAddress ?? "—",
    students: [] as string[],
    photo: photoUrl ?? "/avatar.png",
    parentId: user?.uid ?? "—",
    relationship: "—",
    studentPerformance: "—",
    childAttendance: "—",
    emergencyContact: authEmergencyContact ?? "—",
    status: liveStatus(userStatus),
    linkedAccounts: authLinkedAccounts ?? "—",
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
  const lastLogin = fmtDateTime(freshLastSignIn ?? user?.metadata?.lastSignInTime);
  const displayStatus = (s: string | null) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";

  const profileByRole: Record<Role, ProfileData> = {
    super_admin: {
      name: displayName ?? user?.displayName ?? "—",
      email: user?.email ?? "—",
      phone: "—",
      photo: photoUrl ?? "/avatar.png",
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
      photo: photoUrl ?? "/avatar.png",
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
    spectator: {
      name: displayName ?? user?.displayName ?? "—",
      email: user?.email ?? "—",
      phone: USE_MOCK ? "555-0001" : (authPhone ?? "—"),
      photo: photoUrl ?? "/avatar.png",
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

  const canEditContactInfo = currentRole === "super_admin";

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
  const canonicalizePhone = usePhoneCanonicalizer();
  const { onChange: onPhoneChange, onBlur: onPhoneBlur, ...phoneReg } = register("phone");

  if (profileLoading) return <ProfilePageSkeleton />;
  if (profileLoadError) return <ProfileLoadError onRetry={() => setRetryCount(c => c + 1)} />;

  const onSubmit = async (values: ContactFormValues) => {
    if (!user?.uid) return;
    setSaveError(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", user.uid), {
        name: values.name,
        phone: values.phone ? canonicalizePhone(values.phone) : "",
        emergencyContact: values.emergencyContact ?? "",
      });
      const logRef = doc(collection(db, "users", user.uid, "activity_log"));
      const logInstitutionId =
        institutionId === "*" ? "" : (institutionId ?? "");
      batch.set(logRef, {
        eventType: "profile_update",
        detail: "Contact info updated",
        timestamp: new Date().toISOString(),
        recordedAt: serverTimestamp(),
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
      { label: "Permissions", value: "Full access, User management, Reports" },
    ],
    spectator: [
      { label: "Access level", value: "Read-only" },
      { label: "Permissions", value: "View-only access to institution data" },
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

  const mockActivity = USE_MOCK ? [...signInEntry, ...activityLogData] : [];

  return (
    <div className="p-3 sm:p-4 flex flex-col gap-3 sm:gap-4">
      <section className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-md p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:text-left sm:gap-4">
          <img
            src={profile.photo}
            alt={`${profile.name} avatar`}
            className="w-20 h-20 rounded-full object-cover ring-4 ring-sky-100 dark:ring-gray-700 shrink-0"
          />

          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 wrap-break-word">
              {profile.name}
            </h1>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1">
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
                {roleLabel}
              </span>
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                {profile.status}
              </span>
            </div>
          </div>
          {institution?.logoUrl && (
            <img
              src={institution.logoUrl}
              alt={institution.name}
              // Not shown on phones (below md): the header already carries the logo.
              className="hidden md:block w-16 h-16 object-contain rounded shrink-0 self-center"
            />
          )}
        </div>
      </section>

      <div className="grid grid-cols-12 gap-4 items-start">
        <div className="col-span-12 xl:col-span-7 flex flex-col gap-4">
          <ProfileSection
            title="Contact Information"
            subtitle={
              canEditContactInfo
                ? "Editable: name, phone, emergency contact. View-only: email."
                : "Contact information assigned to this account"
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
                      autoComplete="off"
                      className={inputClassName}
                      {...register("name")}
                    />
                    {errors.name && (
                      <span className="text-xs text-red-500 mt-0.5">
                        {errors.name.message}
                      </span>
                    )}
                  </div>
                  <Field label="Email" value={profile.email} />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      Phone
                    </span>
                    <input
                      type="text"
                      autoComplete="off"
                      inputMode="tel"
                      className={inputClassName}
                      {...phoneReg}
                      onChange={(e) => {
                        e.target.value = formatPhone(e.target.value);
                        onPhoneChange(e);
                      }}
                      onBlur={(e) => {
                        e.target.value = canonicalizePhone(e.target.value);
                        onPhoneBlur(e);
                      }}
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
                      autoComplete="off"
                      className={inputClassName}
                      {...register("emergencyContact")}
                    />
                    {errors.emergencyContact && (
                      <span className="text-xs text-red-500 mt-0.5">
                        {errors.emergencyContact.message}
                      </span>
                    )}
                  </div>
                </div>
                {saveError && (
                  <p className="mt-3 text-xs text-red-500">{saveError}</p>
                )}
                {isDirty && (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full sm:w-auto min-h-11 sm:min-h-0 px-4 py-2 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? "Saving…" : "Save contact info"}
                    </button>
                  </div>
                )}
              </form>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Display name" value={profile.name} />
                <Field label="Email" value={profile.email} />
                <Field label="Phone" value={formatPhoneForDisplay(profile.phone)} />
                <Field
                  label="Emergency contact"
                  value={profile.emergencyContact}
                />
              </div>
            )}
          </ProfileSection>

          <ProfileSection
            title="Role-specific Details"
            subtitle="Information assigned for the role of this account."
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
          </ProfileSection>
        </div>

        <div className="col-span-12 xl:col-span-5 flex flex-col gap-4">
          <ProfileSection
            title="Account Details"
            subtitle="Metadata specific to this account."
          >
            <div className="grid grid-cols-1 gap-4">
              <Field label="Role" value={roleLabel} />
              <Field label="Status" value={profile.status} />
              <Field label="User ID" value={profile.userId} />
              <Field label="Created date" value={profile.createdAt} />
              <Field label="Last login" value={profile.lastLogin} />
              <Field label="Linked accounts" value={profile.linkedAccounts} />
            </div>
          </ProfileSection>

          <ProfileActivitySection
            uid={user?.uid}
            role={role}
            institutionId={institutionId}
            retryKey={retryCount}
            mockActivity={mockActivity}
          />
        </div>
      </div>

      <ProfileAuditSection role={role} institutionId={institutionId} retryKey={retryCount} />
    </div>
  );
};

export default ProfilePage;
