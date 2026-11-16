import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection } from "@/lib/paths";
import { onLoadError } from "@/lib/reportError";
import { subscribeSnapshot } from "@/lib/sharedSnapshot";
import type { RubricDocument } from "@/types/assessment";

export type ListedRubric = RubricDocument & { id: string };

// The school's rubrics, through the shared live listener (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D24). The Rubrics
// page and the assignment form's picker both use this, so they share one listener: opening the form after the page, or
// coming back within the keep-open window, reads nothing, and changes still arrive live. Memory only, like every shared
// listener; nothing is kept across a reload. A super admin's "*" isn't a school, so nothing is read for it.
export function useRubricsList({ quiet = false }: { quiet?: boolean } = {}): {
  rubrics: ListedRubric[];
  loading: boolean;
} {
  const { institutionId } = useAuth();
  const [rubrics, setRubrics] = useState<ListedRubric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    return subscribeSnapshot(
      `rubrics:${institutionId}`,
      institutionCollection(institutionId, "rubrics"),
      (snap) => {
        setRubrics(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ListedRubric),
        );
        setLoading(false);
      },
      // The assignment form's picker is optional, so a failure there stays quiet and leaves the list empty.
      quiet
        ? () => setLoading(false)
        : onLoadError("rubrics", () => setLoading(false)),
    );
  }, [institutionId, quiet]);

  return { rubrics, loading };
}
