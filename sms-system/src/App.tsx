import { Routes, Route, useLocation } from "react-router-dom";
import { Suspense } from "react";
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
import LoginPage from "@/scenes/(auth)/login";
import { getRole } from "@/lib/auth";
import AdminPage from "@/scenes/(dashboard)/admin";
import TeacherPage from "@/scenes/(dashboard)/teacher";
import StudentPage from "@/scenes/(dashboard)/student";
import ParentPage from "@/scenes/(dashboard)/parent";

function App() {
  const location = useLocation();
  const isAuthRoute = location.pathname.startsWith('/login');
  const currentRole = getRole();
  const defaultPath =
    currentRole === 'admin' ? <AdminPage /> :
    currentRole === 'teacher' ? <TeacherPage /> :
    currentRole === 'student' ? <StudentPage /> :
    currentRole === 'parent' ? <ParentPage /> : <AdminPage />;

  if (isAuthRoute) {
    return (
      <Suspense fallback={<h1>Loading...</h1>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <DashboardLayout>
      <Suspense fallback={<h1>Loading...</h1>}>
        <Routes>
          <Route path="/" element={defaultPath} />
          <Route path="/list/teachers" element={<TeacherListPage />} />
          <Route path="/list/teachers/:id" element={<SingleTeacherPage />} />
          <Route path="/list/students" element={<StudentListPage />} />
          <Route path="/list/students/:id" element={<SingleStudentPage />} />
          <Route path="/list/parents" element={<ParentListPage />} />
          <Route path="/list/subjects" element={<SubjectListPage />} />
          <Route path="/list/classes" element={<ClassListPage />} />
          <Route path="/list/lessons" element={<LessonListPage />} />
          <Route path="/list/exams" element={<ExamListPage />} />
          <Route path="/list/assignments" element={<AssignmentListPage />} />
          <Route path="/list/results" element={<ResultListPage />} />
          <Route path="/list/events" element={<EventListPage />} />
          <Route path="/list/announcements" element={<AnnouncementListPage />} />
        </Routes>
      </Suspense>
    </DashboardLayout>
  );
}

export default App
