import { lazy } from "react";
import { createIntentPrefetcher, createPrefetcher } from "./prefetch";

// Every dashboard and registration page is loaded on demand: the first page load downloads the
// shell and the page being opened, not the code of every page (on 2026-10-16 the single entry
// chunk was 3.9 MB). App.tsx renders these like normal components inside a <Suspense>.
//
// One loader per page lives here and is shared by React.lazy and by the sidebar, which calls
// prefetchRoute() on hover/focus so the chunk is usually in the cache by the time of the click.
// To add a page: add its loader, its lazy export, and (if it has a sidebar link) its ROUTE_LOADERS
// entry; routePrefetch.test.ts fails if a sidebar link has no entry. Keep the page itself out of
// any static import: bundleBoundaries.test.ts fails if App.tsx or the shell imports a scene again.

const load = {
  TeacherListPage: () => import("@/scenes/(dashboard)/list/teachers"),
  SingleTeacherPage: () => import("@/scenes/(dashboard)/list/teachers/[id]"),
  StudentListPage: () => import("@/scenes/(dashboard)/list/students"),
  SingleStudentPage: () => import("@/scenes/(dashboard)/list/students/[id]"),
  ParentListPage: () => import("@/scenes/(dashboard)/list/parents"),
  SpectatorListPage: () => import("@/scenes/(dashboard)/list/spectators"),
  SubjectListPage: () => import("@/scenes/(dashboard)/list/subjects"),
  ClassListPage: () => import("@/scenes/(dashboard)/list/classes"),
  LessonListPage: () => import("@/scenes/(dashboard)/list/lessons"),
  ExamListPage: () => import("@/scenes/(dashboard)/list/exams"),
  ExamBuilderPage: () => import("@/scenes/(dashboard)/list/exams/build"),
  ExamPreviewPage: () => import("@/scenes/(dashboard)/list/exams/preview"),
  ExamTakePage: () => import("@/scenes/(dashboard)/list/exams/take"),
  ExamResultsPage: () => import("@/scenes/(dashboard)/list/exams/results"),
  AssignmentListPage: () => import("@/scenes/(dashboard)/list/assignments"),
  AssignmentDetailPage: () => import("@/scenes/(dashboard)/list/assignments/[id]"),
  ResultListPage: () => import("@/scenes/(dashboard)/list/results"),
  EventListPage: () => import("@/scenes/(dashboard)/list/events"),
  AnnouncementListPage: () => import("@/scenes/(dashboard)/list/announcements"),
  TermListPage: () => import("@/scenes/(dashboard)/list/terms"),
  FeedbackCommentListPage: () => import("@/scenes/(dashboard)/list/feedback"),
  DepartmentListPage: () => import("@/scenes/(dashboard)/list/departments"),
  ProfilePage: () => import("@/scenes/(dashboard)/profile"),
  SettingsPage: () => import("@/scenes/(dashboard)/settings"),
  RegistrationInstitutionPickerPage: () => import("@/scenes/(auth)/register"),
  StudentRegistrationFormPage: () => import("@/scenes/(auth)/register/[institutionId]"),
  AdminPage: () => import("@/scenes/(dashboard)/admin"),
  SpectatorPage: () => import("@/scenes/(dashboard)/spectator"),
  SuperAdminPage: () => import("@/scenes/(dashboard)/super-admin"),
  SuperAdminCreateUserPage: () => import("@/scenes/(dashboard)/super-admin/create-user"),
  AuditLogPage: () => import("@/scenes/(dashboard)/admin/audit-log"),
  OnboardInstitutionPage: () => import("@/scenes/(dashboard)/super-admin/onboard-institution"),
  ManageAdminsPage: () => import("@/scenes/(dashboard)/super-admin/manage-admins"),
  SeniorTeacherPage: () => import("@/scenes/(dashboard)/senior-teacher"),
  RegularTeacherPage: () => import("@/scenes/(dashboard)/regular-teacher"),
  StudentPage: () => import("@/scenes/(dashboard)/student"),
  ParentPage: () => import("@/scenes/(dashboard)/parent"),
  SchedulePage: () => import("@/scenes/(dashboard)/schedule"),
  AcademicCalendarPage: () => import("@/scenes/(dashboard)/academic-calendar"),
  GeneralAttendanceRegisterPage: () => import("@/scenes/(dashboard)/attendance/general"),
  MyAttendancePage: () => import("@/scenes/(dashboard)/attendance/my"),
  ChildAttendancePage: () => import("@/scenes/(dashboard)/attendance/child"),
  SubjectAttendancePage: () => import("@/scenes/(dashboard)/attendance/subject"),
  BackfillStudentClassesPage: () => import("@/scenes/(dashboard)/admin/backfill-student-classes"),
  BrandSettingsPage: () => import("@/scenes/(dashboard)/brand-settings"),
  InstitutionProfilePage: () => import("@/scenes/(dashboard)/institution-profile"),
  HousesListPage: () => import("@/scenes/(dashboard)/list/houses"),
  HouseDetailPage: () => import("@/scenes/(dashboard)/list/houses/[id]"),
  ClassDetailPage: () => import("@/scenes/(dashboard)/list/classes/[id]"),
  SubjectDetailPage: () => import("@/scenes/(dashboard)/list/subjects/[id]"),
  TermDetailPage: () => import("@/scenes/(dashboard)/list/terms/[id]"),
  ReportCardCommentsPage: () => import("@/scenes/(dashboard)/report-card-comments"),
  RebuildAttendanceSummariesPage: () => import("@/scenes/(dashboard)/admin/rebuild-attendance-summaries"),
  ReportCardsPage: () => import("@/scenes/(dashboard)/report-cards"),
  ProgressReportsPage: () => import("@/scenes/(dashboard)/progress-reports"),
  AttendanceGridsheetPage: () => import("@/scenes/(dashboard)/attendance/gridsheet"),
  ReportBuilderPage: () => import("@/scenes/(dashboard)/reports/builder"),
  GradebookPage: () => import("@/scenes/(dashboard)/list/gradebook"),
  GradeEntryTrackingPage: () => import("@/scenes/(dashboard)/admin/grade-entry-tracking"),
  DisciplinaryActionsPage: () => import("@/scenes/(dashboard)/disciplinary-actions"),
  RegistrationReviewPage: () => import("@/scenes/(dashboard)/registrations"),
  ImportPage: () => import("@/scenes/(dashboard)/import"),
  RubricsListPage: () => import("@/scenes/(dashboard)/list/rubrics"),
  LessonNotesPage: () => import("@/scenes/(dashboard)/list/lesson-notes"),
};

export const TeacherListPage = lazy(load.TeacherListPage);
export const SingleTeacherPage = lazy(load.SingleTeacherPage);
export const StudentListPage = lazy(load.StudentListPage);
export const SingleStudentPage = lazy(load.SingleStudentPage);
export const ParentListPage = lazy(load.ParentListPage);
export const SpectatorListPage = lazy(load.SpectatorListPage);
export const SubjectListPage = lazy(load.SubjectListPage);
export const ClassListPage = lazy(load.ClassListPage);
export const LessonListPage = lazy(load.LessonListPage);
export const ExamListPage = lazy(load.ExamListPage);
export const ExamBuilderPage = lazy(load.ExamBuilderPage);
export const ExamPreviewPage = lazy(load.ExamPreviewPage);
export const ExamTakePage = lazy(load.ExamTakePage);
export const ExamResultsPage = lazy(load.ExamResultsPage);
export const AssignmentListPage = lazy(load.AssignmentListPage);
export const AssignmentDetailPage = lazy(load.AssignmentDetailPage);
export const ResultListPage = lazy(load.ResultListPage);
export const EventListPage = lazy(load.EventListPage);
export const AnnouncementListPage = lazy(load.AnnouncementListPage);
export const TermListPage = lazy(load.TermListPage);
export const FeedbackCommentListPage = lazy(load.FeedbackCommentListPage);
export const DepartmentListPage = lazy(load.DepartmentListPage);
export const ProfilePage = lazy(load.ProfilePage);
export const SettingsPage = lazy(load.SettingsPage);
export const RegistrationInstitutionPickerPage = lazy(load.RegistrationInstitutionPickerPage);
export const StudentRegistrationFormPage = lazy(load.StudentRegistrationFormPage);
export const AdminPage = lazy(load.AdminPage);
export const SpectatorPage = lazy(load.SpectatorPage);
export const SuperAdminPage = lazy(load.SuperAdminPage);
export const SuperAdminCreateUserPage = lazy(load.SuperAdminCreateUserPage);
export const AuditLogPage = lazy(load.AuditLogPage);
export const OnboardInstitutionPage = lazy(load.OnboardInstitutionPage);
export const ManageAdminsPage = lazy(load.ManageAdminsPage);
export const SeniorTeacherPage = lazy(load.SeniorTeacherPage);
export const RegularTeacherPage = lazy(load.RegularTeacherPage);
export const StudentPage = lazy(load.StudentPage);
export const ParentPage = lazy(load.ParentPage);
export const SchedulePage = lazy(load.SchedulePage);
export const AcademicCalendarPage = lazy(load.AcademicCalendarPage);
export const GeneralAttendanceRegisterPage = lazy(load.GeneralAttendanceRegisterPage);
export const MyAttendancePage = lazy(load.MyAttendancePage);
export const ChildAttendancePage = lazy(load.ChildAttendancePage);
export const SubjectAttendancePage = lazy(load.SubjectAttendancePage);
export const BackfillStudentClassesPage = lazy(load.BackfillStudentClassesPage);
export const BrandSettingsPage = lazy(load.BrandSettingsPage);
export const InstitutionProfilePage = lazy(load.InstitutionProfilePage);
export const HousesListPage = lazy(load.HousesListPage);
export const HouseDetailPage = lazy(load.HouseDetailPage);
export const ClassDetailPage = lazy(load.ClassDetailPage);
export const SubjectDetailPage = lazy(load.SubjectDetailPage);
export const TermDetailPage = lazy(load.TermDetailPage);
export const ReportCardCommentsPage = lazy(load.ReportCardCommentsPage);
export const RebuildAttendanceSummariesPage = lazy(load.RebuildAttendanceSummariesPage);
export const ReportCardsPage = lazy(load.ReportCardsPage);
export const ProgressReportsPage = lazy(load.ProgressReportsPage);
export const AttendanceGridsheetPage = lazy(load.AttendanceGridsheetPage);
export const ReportBuilderPage = lazy(load.ReportBuilderPage);
export const GradebookPage = lazy(load.GradebookPage);
export const GradeEntryTrackingPage = lazy(load.GradeEntryTrackingPage);
export const DisciplinaryActionsPage = lazy(load.DisciplinaryActionsPage);
export const RegistrationReviewPage = lazy(load.RegistrationReviewPage);
export const ImportPage = lazy(load.ImportPage);
export const RubricsListPage = lazy(load.RubricsListPage);
export const LessonNotesPage = lazy(load.LessonNotesPage);

// Sidebar link (href) -> loader. Only routes without a URL parameter can be linked from the sidebar.
const ROUTE_LOADERS = {
  "/dashboard/list/teachers": load.TeacherListPage,
  "/dashboard/list/students": load.StudentListPage,
  "/dashboard/list/parents": load.ParentListPage,
  "/dashboard/list/spectators": load.SpectatorListPage,
  "/dashboard/list/subjects": load.SubjectListPage,
  "/dashboard/list/classes": load.ClassListPage,
  "/dashboard/list/lessons": load.LessonListPage,
  "/dashboard/list/exams": load.ExamListPage,
  "/dashboard/list/assignments": load.AssignmentListPage,
  "/dashboard/list/rubrics": load.RubricsListPage,
  "/dashboard/list/lesson-notes": load.LessonNotesPage,
  "/dashboard/list/results": load.ResultListPage,
  "/dashboard/list/gradebook": load.GradebookPage,
  "/dashboard/list/events": load.EventListPage,
  "/dashboard/list/announcements": load.AnnouncementListPage,
  "/dashboard/list/terms": load.TermListPage,
  "/dashboard/list/feedback": load.FeedbackCommentListPage,
  "/dashboard/list/departments": load.DepartmentListPage,
  "/dashboard/list/houses": load.HousesListPage,
  "/dashboard/report-card-comments": load.ReportCardCommentsPage,
  "/dashboard/schedule": load.SchedulePage,
  "/dashboard/report-cards": load.ReportCardsPage,
  "/dashboard/progress-reports": load.ProgressReportsPage,
  "/dashboard/disciplinary-actions": load.DisciplinaryActionsPage,
  "/dashboard/import": load.ImportPage,
  "/dashboard/registrations": load.RegistrationReviewPage,
  "/dashboard/reports/builder": load.ReportBuilderPage,
  "/dashboard/create-user": load.SuperAdminCreateUserPage,
  "/dashboard/admin/audit-log": load.AuditLogPage,
  "/dashboard/onboard-institution": load.OnboardInstitutionPage,
  "/dashboard/manage-admins": load.ManageAdminsPage,
  "/dashboard/academic-calendar": load.AcademicCalendarPage,
  "/dashboard/attendance/general": load.GeneralAttendanceRegisterPage,
  "/dashboard/attendance/my": load.MyAttendancePage,
  "/dashboard/attendance/child": load.ChildAttendancePage,
  "/dashboard/attendance/subject": load.SubjectAttendancePage,
  "/dashboard/attendance/gridsheet": load.AttendanceGridsheetPage,
  "/dashboard/admin/backfill-student-classes": load.BackfillStudentClassesPage,
  "/dashboard/admin/rebuild-attendance-summaries": load.RebuildAttendanceSummariesPage,
  "/dashboard/admin/grade-entry-tracking": load.GradeEntryTrackingPage,
  "/dashboard/brand-settings": load.BrandSettingsPage,
  "/dashboard/institution-profile": load.InstitutionProfilePage,
  "/dashboard/profile": load.ProfilePage,
  "/dashboard/settings": load.SettingsPage,
};

const prefetchRoute = createPrefetcher(ROUTE_LOADERS);

// What the sidebar calls: prefetch after a short pause on a link, not on a mere pass-over.
export const prefetchIntent = createIntentPrefetcher(prefetchRoute);
