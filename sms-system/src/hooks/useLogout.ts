import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useConfirmLeave } from "@/hooks/useNavigationGuard";
import { unsentCount } from "@/lib/offline/unsentCount";

/**
 * The header's Logout button. Signing out is a button, not a link, so it asks through the unsaved-changes guard itself
 * (when a page has changes), and first warns about register saves not yet sent (the outbox tray, slice C2).
 */
export function useLogout() {
  const navigate = useNavigate();
  const confirmLeave = useConfirmLeave();
  const { signOut } = useAuth();
  const [askSignOut, setAskSignOut] = useState(false);

  const signOutNow = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleLogout = () =>
    confirmLeave(() => {
      if (unsentCount() > 0) setAskSignOut(true);
      else void signOutNow();
    });

  return {
    handleLogout,
    askSignOut,
    cancelSignOut: () => setAskSignOut(false),
    signOutNow: () => void signOutNow(),
  };
}
