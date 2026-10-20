import { useInactivityLogout } from "@/hooks/useInactivityLogout";

// Mounts the inactivity logout where the dashboard layout is not: the forced change-password page that
// Protected.tsx renders full-screen for an account whose mustChangePassword flag is still on. Without it a
// browser left on that page was never signed out.
export default function InactivityGuard() {
  useInactivityLogout();
  return null;
}
