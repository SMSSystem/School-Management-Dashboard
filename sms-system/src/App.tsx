import { Routes, useLocation } from "react-router-dom";
import { Suspense } from "react";
import { NextStepProvider, NextStepReact } from "nextstepjs";
import { useReactRouterAdapter } from "nextstepjs/adapters/react-router";
import { useIsDark } from "@/lib/useTheme";
import { useTourSteps } from "@/lib/useTourSteps";
import TourCard from "@/components/TourCard";
import TourAutoTrigger from "@/components/TourAutoTrigger";
import { markTourSeen } from "@/lib/markTourSeen";
import DashboardLayout from "@/scenes/(dashboard)";
import PageErrorBoundary from "@/components/PageErrorBoundary";
import RouteFallback from "@/components/RouteFallback";
import { useAuth } from "@/lib/AuthContext";
import Protected from "@/components/Protected";
import DevDataModeToggle from "@/components/DevDataModeToggle";
import AuthRoutes from "@/routes/AuthRoutes";
import { generalRoutes } from "@/routes/generalRoutes";
import { peopleRoutes } from "@/routes/peopleRoutes";
import { academicRoutes } from "@/routes/academicRoutes";
import { attendanceRoutes } from "@/routes/attendanceRoutes";
import { reportingRoutes } from "@/routes/reportingRoutes";

function App() {
  const location = useLocation();
  const { user, role, institutionId } = useAuth();
  const isDark = useIsDark();
  const { tours, isLoading: stepsLoading } = useTourSteps(institutionId);
  const isAuthRoute =
    location.pathname.startsWith("/login") || location.pathname.startsWith("/register");

  if (isAuthRoute) return <AuthRoutes />;

  return (
    <NextStepProvider>
      <NextStepReact
        steps={tours}
        cardComponent={TourCard}
        navigationAdapter={useReactRouterAdapter}
        shadowRgb={isDark ? '255, 255, 255' : '0, 0, 0'}
        shadowOpacity={isDark ? '0.15' : '0.2'}
        onComplete={(tourName) => {
          if (user && tourName) markTourSeen(user.uid, tourName);
        }}
        onSkip={(_step, tourName) => {
          if (user && tourName) markTourSeen(user.uid, tourName);
        }}
      >
        <TourAutoTrigger stepsReady={!stepsLoading} />
        <Protected>
          <DevDataModeToggle />
          <DashboardLayout>
            <PageErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<RouteFallback />}>
              {/* The routes live in src/routes, one file per area; each keeps its role rule beside it. */}
              <Routes>
                {generalRoutes(role)}
                {peopleRoutes(role)}
                {academicRoutes(role)}
                {attendanceRoutes(role)}
                {reportingRoutes(role)}
              </Routes>
            </Suspense>
            </PageErrorBoundary>
          </DashboardLayout>
        </Protected>
      </NextStepReact>
    </NextStepProvider>
  );
}

export default App;
