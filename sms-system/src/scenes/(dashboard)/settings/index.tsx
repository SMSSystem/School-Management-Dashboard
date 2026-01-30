import type { ReactNode } from "react";
import { getRole, type Role } from "@/lib/auth";

const inputClassName =
  "w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/40 px-3 py-2 text-slate-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-sky-400";

const Section = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) => (
  <section className="bg-white dark:bg-gray-800 rounded-md p-4 shadow-sm">
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h2>
      {subtitle ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {subtitle}
        </p>
      ) : null}
    </div>
    {children}
  </section>
);

const ToggleRow = ({
  label,
  description,
  defaultChecked = false,
}: {
  label: string;
  description: string;
  defaultChecked?: boolean;
}) => (
  <label className="flex items-start justify-between gap-4 rounded-md border border-gray-100 dark:border-gray-700 p-3">
    <div>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
        {label}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
    <input type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 mt-1 accent-sky-600" />
  </label>
);

const SettingsPage = () => {
  const currentRole: Role = getRole() ?? "admin";
  const roleLabel = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);

  return (
    <div className="p-4 flex flex-col gap-4">
      <section className="bg-white dark:bg-gray-800 rounded-md p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              Settings
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage your account, preferences, and role-specific options.
            </p>
          </div>
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
            {roleLabel} view
          </span>
        </div>
      </section>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7 flex flex-col gap-4">
          <Section
            title="Account"
            subtitle="Password, 2FA, sessions, and security alerts."
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Password
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Last updated: Jan 10, 2026
                  </p>
                </div>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900 transition"
                >
                  Change password
                </button>
              </div>

              <ToggleRow
                label="Two-factor authentication"
                description="Protect your account with a second verification step."
                defaultChecked={false}
              />

              <div className="rounded-md border border-gray-100 dark:border-gray-700 p-3">
                <div className="flex items-center justify-between gap-3">
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

              <ToggleRow
                label="Security alerts"
                description="Email me when a new device signs in."
                defaultChecked
              />
            </div>
          </Section>

          <Section
            title="Notifications"
            subtitle="Email, SMS, push, and digest frequency."
          >
            <div className="grid grid-cols-1 gap-3">
              <ToggleRow
                label="Email notifications"
                description="Weekly summaries and important alerts."
                defaultChecked
              />
              <ToggleRow
                label="SMS alerts"
                description="Urgent notifications only."
                defaultChecked
              />
              <ToggleRow
                label="Push notifications"
                description="In-app and device notifications."
                defaultChecked
              />
            </div>
            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Digest frequency
              </label>
              <select defaultValue="Weekly" className={`${inputClassName} mt-1`}>
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </div>
          </Section>

          <Section title="Preferences" subtitle="Language, timezone, date format, theme.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Language
                </label>
                <select defaultValue="English (US)" className={`${inputClassName} mt-1`}>
                  <option>English (US)</option>
                  <option>English (UK)</option>
                  <option>Spanish</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Timezone
                </label>
                <select defaultValue="America/Chicago" className={`${inputClassName} mt-1`}>
                  <option>America/Chicago</option>
                  <option>America/New_York</option>
                  <option>America/Los_Angeles</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Date format
                </label>
                <select defaultValue="MM/DD/YYYY" className={`${inputClassName} mt-1`}>
                  <option>MM/DD/YYYY</option>
                  <option>DD/MM/YYYY</option>
                  <option>YYYY-MM-DD</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Theme
                </label>
                <select defaultValue="System" className={`${inputClassName} mt-1`}>
                  <option>System</option>
                  <option>Light</option>
                  <option>Dark</option>
                </select>
              </div>
            </div>
          </Section>
        </div>

        <div className="col-span-12 xl:col-span-5 flex flex-col gap-4">
          <Section title="Privacy" subtitle="Profile visibility and data sharing.">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Profile visibility
                </label>
                <select defaultValue="School only" className={`${inputClassName} mt-1`}>
                  <option>Public</option>
                  <option>School only</option>
                  <option>Private</option>
                </select>
              </div>
              <ToggleRow
                label="Share data with guardians"
                description="Allow guardians to view performance and attendance."
                defaultChecked={currentRole !== "teacher"}
              />
              <ToggleRow
                label="Data sharing consent"
                description="Share anonymized data for school analytics."
                defaultChecked
              />
            </div>
          </Section>

          <Section title="Accessibility" subtitle="Text size, contrast, and motion.">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Text size
                </label>
                <select defaultValue="Default" className={`${inputClassName} mt-1`}>
                  <option>Small</option>
                  <option>Default</option>
                  <option>Large</option>
                </select>
              </div>
              <ToggleRow
                label="High contrast"
                description="Increase color contrast for readability."
              />
              <ToggleRow
                label="Reduced motion"
                description="Minimize animations across the dashboard."
              />
            </div>
          </Section>

          {currentRole === "teacher" && (
            <Section title="Gradebook preferences" subtitle="Teacher-only settings.">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Grade scale view
                  </label>
                  <select defaultValue="Letter (A-F)" className={`${inputClassName} mt-1`}>
                    <option>Letter (A-F)</option>
                    <option>Percentage</option>
                    <option>GPA</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Default categories
                  </label>
                  <input
                    className={`${inputClassName} mt-1`}
                    defaultValue="Homework, Quizzes, Exams"
                  />
                </div>
              </div>
            </Section>
          )}

          {currentRole === "teacher" && (
            <Section title="Class defaults" subtitle="Attendance rules and late work policy.">
              <div className="space-y-3">
                <ToggleRow
                  label="Auto-close attendance"
                  description="Close attendance 10 minutes after class starts."
                  defaultChecked
                />
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Late work policy
                  </label>
                  <select defaultValue="10% per day" className={`${inputClassName} mt-1`}>
                    <option>No penalty</option>
                    <option>10% per day</option>
                    <option>Accept until 1 week</option>
                  </select>
                </div>
              </div>
            </Section>
          )}

          {currentRole === "teacher" && (
            <Section title="Assignment notifications" subtitle="Teacher-only alerts.">
              <div className="space-y-3">
                <ToggleRow
                  label="Notify on missing work"
                  description="Send reminders to students automatically."
                  defaultChecked
                />
                <ToggleRow
                  label="Daily submission summary"
                  description="Receive a digest at 6 PM."
                />
              </div>
            </Section>
          )}

          {currentRole === "student" && (
            <Section title="Student notifications" subtitle="Assignments, exams, and results.">
              <div className="space-y-3">
                <ToggleRow
                  label="Assignments due"
                  description="Remind me 24 hours before deadlines."
                  defaultChecked
                />
                <ToggleRow
                  label="Exam schedules"
                  description="Notify me when exams are scheduled."
                  defaultChecked
                />
                <ToggleRow
                  label="Results published"
                  description="Alert me when grades are posted."
                  defaultChecked
                />
              </div>
            </Section>
          )}

          {currentRole === "student" && (
            <Section title="Student privacy" subtitle="Control who can see your info.">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Profile visibility
                  </label>
                  <select defaultValue="School only" className={`${inputClassName} mt-1`}>
                    <option>School only</option>
                    <option>Teachers only</option>
                    <option>Private</option>
                  </select>
                </div>
                <ToggleRow
                  label="Share achievements"
                  description="Allow teachers to highlight progress."
                />
              </div>
            </Section>
          )}

          {currentRole === "student" && (
            <Section
              title="Parent / guardian visibility"
              subtitle="Allow guardians to view attendance and grades."
            >
              <ToggleRow
                label="Share attendance"
                description="Guardians can view attendance summaries."
                defaultChecked
              />
              <ToggleRow
                label="Share grades"
                description="Guardians can view report cards."
                defaultChecked
              />
            </Section>
          )}

          {currentRole === "parent" && (
            <Section title="Child notifications" subtitle="Attendance, grades, announcements.">
              <div className="space-y-3">
                <ToggleRow
                  label="Attendance alerts"
                  description="Notify me when attendance changes."
                  defaultChecked
                />
                <ToggleRow
                  label="Grades posted"
                  description="Receive updates when grades are published."
                  defaultChecked
                />
                <ToggleRow
                  label="Announcements"
                  description="School and teacher announcements."
                  defaultChecked
                />
              </div>
            </Section>
          )}

          {currentRole === "parent" && (
            <Section title="Contact preferences" subtitle="Preferred times and channels.">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Preferred contact window
                  </label>
                  <select defaultValue="Evenings" className={`${inputClassName} mt-1`}>
                    <option>Mornings</option>
                    <option>Afternoons</option>
                    <option>Evenings</option>
                  </select>
                </div>
                <ToggleRow
                  label="Allow phone calls"
                  description="Enable urgent calls from staff."
                  defaultChecked
                />
              </div>
            </Section>
          )}

          {currentRole === "admin" && (
            <Section title="User management defaults" subtitle="Onboarding and approvals.">
              <div className="space-y-3">
                <ToggleRow
                  label="Require admin approval"
                  description="Manually approve new accounts."
                  defaultChecked
                />
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Default role
                  </label>
                  <select defaultValue="Student" className={`${inputClassName} mt-1`}>
                    <option>Student</option>
                    <option>Teacher</option>
                    <option>Parent</option>
                    <option>Staff</option>
                  </select>
                </div>
              </div>
            </Section>
          )}

          {currentRole === "admin" && (
            <Section title="Permissions templates" subtitle="Role-based permission presets.">
              <div className="space-y-3">
                <ToggleRow
                  label="Apply strict student template"
                  description="Limit access to results and attendance."
                  defaultChecked
                />
                <ToggleRow
                  label="Apply teacher leadership template"
                  description="Enable reports and class management."
                />
              </div>
            </Section>
          )}

          {currentRole === "admin" && (
            <Section title="School profile" subtitle="School identity and contacts.">
              <div className="space-y-3">
                <input className={inputClassName} defaultValue="Lighthouse Academy" />
                <input className={inputClassName} defaultValue="123 Main St, Anytown, USA" />
                <input className={inputClassName} defaultValue="contact@lighthouse.edu" />
              </div>
            </Section>
          )}

          {currentRole === "admin" && (
            <Section title="Academic structure" subtitle="Terms, grading, attendance policy.">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Current term
                  </label>
                  <select defaultValue="Spring 2026" className={`${inputClassName} mt-1`}>
                    <option>Spring 2026</option>
                    <option>Fall 2025</option>
                    <option>Summer 2025</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Grading scale
                  </label>
                  <select defaultValue="A-F" className={`${inputClassName} mt-1`}>
                    <option>A-F</option>
                    <option>Percentage</option>
                    <option>Standards-based</option>
                  </select>
                </div>
                <ToggleRow
                  label="Require attendance notes"
                  description="Notes required for absences."
                  defaultChecked
                />
              </div>
            </Section>
          )}

          {currentRole === "admin" && (
            <Section title="Integrations" subtitle="LMS/SIS and messaging providers.">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    LMS / SIS
                  </label>
                  <select defaultValue="Google Classroom" className={`${inputClassName} mt-1`}>
                    <option>Google Classroom</option>
                    <option>Canvas</option>
                    <option>Schoology</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Email provider
                  </label>
                  <select defaultValue="Google Workspace" className={`${inputClassName} mt-1`}>
                    <option>Google Workspace</option>
                    <option>Microsoft 365</option>
                    <option>SMTP relay</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    SMS provider
                  </label>
                  <select defaultValue="Twilio" className={`${inputClassName} mt-1`}>
                    <option>Twilio</option>
                    <option>MessageBird</option>
                    <option>Vonage</option>
                  </select>
                </div>
              </div>
            </Section>
          )}

          {currentRole === "admin" && (
            <Section title="Security and audit" subtitle="Retention and policy controls.">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Audit log retention
                  </label>
                  <select defaultValue="12 months" className={`${inputClassName} mt-1`}>
                    <option>6 months</option>
                    <option>12 months</option>
                    <option>24 months</option>
                  </select>
                </div>
                <ToggleRow
                  label="Require 2FA for staff"
                  description="Enforce 2FA for admin and teachers."
                  defaultChecked
                />
                <ToggleRow
                  label="Lock accounts after 5 failed logins"
                  description="Prevent brute-force attempts."
                  defaultChecked
                />
              </div>
            </Section>
          )}

          {currentRole === "admin" && (
            <Section title="Billing & subscription" subtitle="Plan, invoices, and limits.">
              <div className="space-y-3">
                <div className="rounded-md border border-gray-100 dark:border-gray-700 p-3">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    Plan: District Plus
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    1,200 users • Next renewal: Feb 15, 2026
                  </p>
                </div>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900 transition"
                >
                  View invoices
                </button>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
