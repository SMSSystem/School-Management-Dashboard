// Routes for report cards, progress reports, the report builder, feedback and disciplinary actions.
// Each route keeps its own role rule next to it. App.tsx puts the result inside <Routes>, which
// only accepts <Route> elements or a fragment of them, so this is a function, not a component.

import { Navigate, Route } from "react-router-dom";
import type { Role } from "@/lib/firebase";
import { hasAdminView } from "@/lib/roleCapabilities";
import {
  FeedbackCommentListPage,
  ReportCardCommentsPage,
  ReportCardsPage,
  ProgressReportsPage,
  DisciplinaryActionsPage,
  ReportBuilderPage,
} from "@/routes/lazyPages";

export function reportingRoutes(role: Role | null) {
  return (
    <>
      <Route
        path="/dashboard/list/feedback"
        element={<FeedbackCommentListPage />}
      />
      <Route
        path="/dashboard/report-card-comments"
        element={
          role === "institution_admin" || role === "spectator" ? (
            <ReportCardCommentsPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/report-cards"
        element={<ReportCardsPage />}
      />
      <Route
        path="/dashboard/progress-reports"
        element={<ProgressReportsPage />}
      />
      <Route
        path="/dashboard/disciplinary-actions"
        element={<DisciplinaryActionsPage />}
      />
      <Route
        path="/dashboard/reports/builder"
        element={
          hasAdminView(role) ||
          role === "senior_teacher" ? (
            <ReportBuilderPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
    </>
  );
}
