import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Suspense, useEffect } from "react";
import { NextStepProvider, NextStepReact, useNextStep } from 'nextstepjs';
import { useReactRouterAdapter } from 'nextstepjs/adapters/react-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, UserDocument } from '@/lib/firebase';
import { tourSteps } from '@/lib/tourSteps'
import TourCard from '@/components/TourCard';
import DashboardLayout from "@/scenes/(dashboard)"
import TeacherListPage from "@/scenes/(dashboard)/list/teachers";
import SingleTeacherPage from "@/scenes/(dashboard)/list/teachers/[id]";
import StudentListPage from "@/scenes/(dashboard)/list/students";
import SingleStudentPage from "@/scenes/(dashboard)/list/students/[id]";
import ParentListPage from "@/scenes/(dashboard)/list/parents";
import SubjectListPage from "@/scenes/(dashboard)/list/subjects";
import ClassListPage from "@/scenes/(dashboard)/list/classes";
import LessonListPage from "@/scenes/(dashboard)/list/lessons";
import ExamListPage from "@/scenes/(dashboard)/list/exams";
import AssignmentListPage from "@/scenes/(dashboard)/list/assignments";
import ResultListPage from "@/scenes/(dashboard)/list/results";
import EventListPage from "@/scenes/(dashboard)/list/events";
import AnnouncementListPage from "@/scenes/(dashboard)/list/announcements";
import TermListPage from "@/scenes/(dashboard)/list/terms";
import FeedbackCommentListPage from "@/scenes/(dashboard)/list/feedback";
import DepartmentListPage from "@/scenes/(dashboard)/list/departments";
import ProfilePage from "@/scenes/(dashboard)/profile";
import SettingsPage from "@/scenes/(dashboard)/settings";
import LoginPage from "@/scenes/(auth)/login";
import { useAuth } from "@/lib/AuthContext";
import Protected from "@/components/Protected";
import DevDataModeToggle from "@/components/DevDataModeToggle";
import AdminPage from "@/scenes/(dashboard)/admin";
import SuperAdminPage from "@/scenes/(dashboard)/super-admin";
import SuperAdminCreateUserPage from "@/scenes/(dashboard)/super-admin/create-user";
import AuditLogPage from "@/scenes/(dashboard)/admin/audit-log";
import OnboardInstitutionPage from "@/scenes/(dashboard)/super-admin/onboard-institution";
import ManageAdminsPage from "@/scenes/(dashboard)/super-admin/manage-admins";
import SeniorTeacherPage from "@/scenes/(dashboard)/senior-teacher";
import RegularTeacherPage from "@/scenes/(dashboard)/regular-teacher";
import StudentPage from "@/scenes/(dashboard)/student";
import ParentPage from "@/scenes/(dashboard)/parent";
import SchedulePage from "@/scenes/(dashboard)/schedule";
import AcademicCalendarPage from "@/scenes/(dashboard)/academic-calendar";
import GeneralAttendanceRegisterPage from "@/scenes/(dashboard)/attendance/general";
import MyAttendancePage from "@/scenes/(dashboard)/attendance/my";
import ChildAttendancePage from "@/scenes/(dashboard)/attendance/child";
import SubjectAttendancePage from "@/scenes/(dashboard)/attendance/subject";
import BackfillStudentClassesPage from "@/scenes/(dashboard)/admin/backfill-student-classes";
import BrandSettingsPage from '@/scenes/(dashboard)/brand-settings';
import InstitutionProfilePage from '@/scenes/(dashboard)/institution-profile';
import HousesListPage from '@/scenes/(dashboard)/list/houses';
import HouseDetailPage from '@/scenes/(dashboard)/list/houses/[id]';
import ReportCardCommentsPage from '@/scenes/(dashboard)/report-card-comments';
import RebuildAttendanceSummariesPage from '@/scenes/(dashboard)/admin/rebuild-attendance-summaries';
import ReportCardsPage from '@/scenes/(dashboard)/report-cards';
import AttendanceGridsheetPage from '@/scenes/(dashboard)/attendance/gridsheet';
import ReportBuilderPage from '@/scenes/(dashboard)/reports/builder';
import GradebookPage from '@/scenes/(dashboard)/list/gradebook';

async function markTourSeen(uid: string, role: string) {
  await updateDoc(doc(db, 'users', uid), {
    [`toursCompleted.${role}`]: true,
  });
}

function TourAutoTrigger() {
  const { user, role } = useAuth();
  const { startNextStep } = useNextStep();

  useEffect(() => {
    if (!user || !role) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      const data = snap.data() as UserDocument | undefined;
      if (!data?.toursCompleted?.[role]) {
        startNextStep(role);
      }
    });
  }, [user?.uid, role]);

  return null;
}

function App() {
  const location = useLocation();
  const { user, role, loading } = useAuth();
  const isAuthRoute = location.pathname.startsWith('/login');

  const defaultPath =
    role === 'super_admin' ? <SuperAdminPage /> :
    role === 'institution_admin' ? <AdminPage /> :
    role === 'senior_teacher' ? <SeniorTeacherPage /> :
    role === 'regular_teacher' ? <RegularTeacherPage /> :
    role === 'student' ? <StudentPage /> :
    role === 'parent' ? <ParentPage /> : <AdminPage />;

  if (isAuthRoute) {
    return (
      <Suspense fallback={<h1>Loading...</h1>}>
        <Routes>
          <Route path="/login" element={(!loading && user) ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <NextStepProvider>
      <NextStepReact
        steps={tourSteps}
        cardComponent={TourCard}
        navigationAdapter={useReactRouterAdapter}
        onComplete={() => { if (user && role) markTourSeen(user.uid, role); }}
        onSkip={() => { if (user && role) markTourSeen(user.uid, role); }}
      >
        <TourAutoTrigger />
        <Protected>
          <DevDataModeToggle />
          <DashboardLayout>
            <Suspense fallback={<h1>Loading...</h1>}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={defaultPath} />
                <Route path="/dashboard/list/teachers" element={<TeacherListPage />} />
                <Route path="/dashboard/list/teachers/:id" element={<SingleTeacherPage />} />
                <Route path="/dashboard/list/students" element={<StudentListPage />} />
                <Route path="/dashboard/list/students/:id" element={<SingleStudentPage />} />
                <Route path="/dashboard/list/parents" element={<ParentListPage />} />
                <Route path="/dashboard/list/subjects" element={<SubjectListPage />} />
                <Route path="/dashboard/list/classes" element={<ClassListPage />} />
                <Route path="/dashboard/list/lessons" element={<LessonListPage />} />
                <Route path="/dashboard/list/exams" element={<ExamListPage />} />
                <Route path="/dashboard/list/assignments" element={<AssignmentListPage />} />
                <Route path="/dashboard/list/results" element={<ResultListPage />} />
                <Route
                  path="/dashboard/list/gradebook"
                  element={
                    (role === 'super_admin' || role === 'institution_admin' || role === 'senior_teacher' || role === 'regular_teacher')
                      ? <GradebookPage />
                      : <Navigate to="/dashboard" replace />
                  }
                />
                <Route path="/dashboard/list/events" element={<EventListPage />} />
                <Route path="/dashboard/list/announcements" element={<AnnouncementListPage />} />
                <Route path="/dashboard/list/terms" element={<TermListPage />} />
                <Route path="/dashboard/list/feedback" element={<FeedbackCommentListPage />} />
                <Route path="/dashboard/list/departments" element={<DepartmentListPage />} />
                <Route path="/dashboard/list/houses" element={role === 'institution_admin' ? <HousesListPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/list/houses/:id" element={role === 'institution_admin' ? <HouseDetailPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/report-card-comments" element={role === 'institution_admin' ? <ReportCardCommentsPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/schedule" element={<SchedulePage />} />
                <Route path="/dashboard/report-cards" element={<ReportCardsPage />} />
                <Route path="/dashboard/reports/builder" element={(role === 'super_admin' || role === 'institution_admin' || role === 'senior_teacher') ? <ReportBuilderPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/create-user" element={(role === 'super_admin' || role === 'institution_admin') ? <SuperAdminCreateUserPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/admin/audit-log" element={role === 'super_admin' ? <AuditLogPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/onboard-institution" element={role === 'super_admin' ? <OnboardInstitutionPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/manage-admins" element={role === 'super_admin' ? <ManageAdminsPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/academic-calendar" element={role === 'institution_admin' ? <AcademicCalendarPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/attendance/general" element={(role === 'super_admin' || role === 'institution_admin' || role === 'senior_teacher') ? <GeneralAttendanceRegisterPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/attendance/my" element={role === 'student' ? <MyAttendancePage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/attendance/child" element={role === 'parent' ? <ChildAttendancePage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/attendance/subject" element={(role === 'super_admin' || role === 'institution_admin' || role === 'regular_teacher') ? <SubjectAttendancePage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/attendance/gridsheet" element={(role === 'super_admin' || role === 'institution_admin' || role === 'senior_teacher') ? <AttendanceGridsheetPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/admin/backfill-student-classes" element={(role === 'super_admin' || role === 'institution_admin') ? <BackfillStudentClassesPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/dashboard/admin/rebuild-attendance-summaries" element={role === 'institution_admin' ? <RebuildAttendanceSummariesPage /> : <Navigate to="/dashboard" replace />} />
                <Route
                  path="/dashboard/brand-settings"
                  element={
                    (role === 'super_admin' || role === 'institution_admin')
                      ? <BrandSettingsPage />
                      : <Navigate to="/dashboard" replace />
                  }
                />
                <Route
                  path="/dashboard/institution-profile"
                  element={
                    ['institution_admin', 'senior_teacher', 'regular_teacher', 'student', 'parent'].includes(role ?? '')
                      ? <InstitutionProfilePage />
                      : <Navigate to="/dashboard" replace />
                  }
                />
                <Route path="/dashboard/profile" element={<ProfilePage />} />
                <Route path="/dashboard/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </DashboardLayout>
        </Protected>
      </NextStepReact>
    </NextStepProvider>
  );
}

export default App
