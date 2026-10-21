// Routes for the school year: subjects, classes, terms, lessons, exams, assignments, results, gradebook, houses, calendar and schedule.
// Each route keeps its own role rule next to it. App.tsx puts the result inside <Routes>, which
// only accepts <Route> elements or a fragment of them, so this is a function, not a component.

import { Navigate, Route } from "react-router-dom";
import type { Role } from "@/lib/firebase";
import { hasAdminView, hasStaffView } from "@/lib/roleCapabilities";
import {
  SubjectListPage,
  SubjectDetailPage,
  ClassListPage,
  ClassDetailPage,
  TermDetailPage,
  LessonListPage,
  ExamListPage,
  ExamBuilderPage,
  ExamPreviewPage,
  ExamTakePage,
  ExamResultsPage,
  AssignmentListPage,
  AssignmentDetailPage,
  RubricsListPage,
  LessonNotesPage,
  ResultListPage,
  GradebookPage,
  TermListPage,
  HousesListPage,
  HouseDetailPage,
  SchedulePage,
  AcademicCalendarPage,
  GradeEntryTrackingPage,
} from "@/routes/lazyPages";

export function academicRoutes(role: Role | null) {
  return (
    <>
      <Route
        path="/dashboard/list/subjects"
        element={<SubjectListPage />}
      />
      {/* Detail pages opened from the eye button on each list row.
          Same audience as the sidebar entry for the list: subjects
          and terms are admin-only, classes also open to teachers. */}
      <Route
        path="/dashboard/list/subjects/:id"
        element={
          hasAdminView(role) ? (
            <SubjectDetailPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/list/classes"
        element={<ClassListPage />}
      />
      <Route
        path="/dashboard/list/classes/:id"
        element={
          hasStaffView(role) ? (
            <ClassDetailPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/list/terms/:id"
        element={
          hasAdminView(role) ? (
            <TermDetailPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/list/lessons"
        element={<LessonListPage />}
      />
      <Route
        path="/dashboard/list/exams"
        element={<ExamListPage />}
      />
      {/* The builder is for staff (a spectator reads it); the page itself checks access to the exam. */}
      <Route
        path="/dashboard/list/exams/:examId/build"
        element={
          hasStaffView(role) ? (
            <ExamBuilderPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/list/exams/:examId/preview"
        element={
          hasStaffView(role) ? (
            <ExamPreviewPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      {/* Results and grading are for the staff who run the exam (a spectator reads them); the page checks access to the exam. */}
      <Route
        path="/dashboard/list/exams/:examId/results"
        element={
          hasStaffView(role) ? (
            <ExamResultsPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      {/* Sitting an exam is for students only; the page checks the exam is for their class. */}
      <Route
        path="/dashboard/list/exams/:examId/take"
        element={
          role === "student" ? (
            <ExamTakePage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/list/assignments"
        element={<AssignmentListPage />}
      />
      <Route
        path="/dashboard/list/assignments/:id"
        element={<AssignmentDetailPage />}
      />
      <Route
        path="/dashboard/list/rubrics"
        element={
          hasStaffView(role) ? (
            <RubricsListPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      {/* super_admin is excluded in v1: there is no institution
          picker yet, so the page would have nothing to load. */}
      <Route
        path="/dashboard/list/lesson-notes"
        element={
          role === "institution_admin" ||
          role === "spectator" ||
          role === "senior_teacher" ||
          role === "regular_teacher" ||
          role === "student" ||
          role === "parent" ? (
            <LessonNotesPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/list/results"
        element={<ResultListPage />}
      />
      <Route
        path="/dashboard/list/gradebook"
        element={
          hasStaffView(role) ? (
            <GradebookPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/list/terms"
        element={<TermListPage />}
      />
      <Route
        path="/dashboard/list/houses"
        element={
          role === "institution_admin" || role === "spectator" ? (
            <HousesListPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/list/houses/:id"
        element={
          role === "institution_admin" || role === "spectator" ? (
            <HouseDetailPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route path="/dashboard/schedule" element={<SchedulePage />} />
      <Route
        path="/dashboard/academic-calendar"
        element={
          role === "institution_admin" || role === "spectator" ? (
            <AcademicCalendarPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/admin/grade-entry-tracking"
        element={
          hasAdminView(role) ? (
            <GradeEntryTrackingPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
    </>
  );
}
