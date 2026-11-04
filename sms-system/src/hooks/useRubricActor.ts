import { useAuth } from "@/lib/AuthContext";
import { actorName, staffFallback } from "@/lib/auditEntry";
import type { RubricActor } from "@/lib/rubricFileStore";

/** The signed-in person as a rubric file's uploader and its audit entry name them, or null when signed out. */
export function useRubricActor(): RubricActor | null {
  const { user, role, displayName } = useAuth();
  if (!user || !role) return null;
  return {
    uid: user.uid,
    name: actorName(displayName, user.email, staffFallback(role)),
    role,
  };
}
