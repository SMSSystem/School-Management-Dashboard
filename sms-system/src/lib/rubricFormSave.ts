import { addDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { criteriaChanged } from "@/lib/rubricCriteria";
import type { RubricCriterion } from "@/types/assessment";

// What the rubric form writes (components/forms/RubricForm.tsx), moved from the form as it was. A new rubric records who
// made it; an edit records `updatedAt` only when the grid changed, so the page can say a stored file may no longer match it.

export type RubricFormSave = {
  type: "create" | "update";
  institutionId: string;
  id: unknown;
  title: string;
  description?: string;
  criteria: RubricCriterion[];
  savedCriteria?: RubricCriterion[];
  createdBy: string;
  createdByRole: string;
};

/** Saves the rubric. Returns false, writing nothing, when an edit has no record id. */
export async function saveRubric(p: RubricFormSave): Promise<boolean> {
  const payload = {
    institutionId: p.institutionId,
    title: p.title,
    ...(p.description && { description: p.description }),
    criteria: p.criteria,
  };
  if (p.type === "create") {
    await addDoc(institutionCollection(p.institutionId, "rubrics"), {
      ...payload,
      createdBy: p.createdBy,
      createdByRole: p.createdByRole,
      createdAt: serverTimestamp(),
    });
    return true;
  }
  if (typeof p.id !== "string") return false;
  const gridChanged = criteriaChanged(p.criteria, p.savedCriteria);
  await updateDoc(institutionDoc(p.institutionId, "rubrics", p.id), {
    ...payload,
    ...(gridChanged && { updatedAt: serverTimestamp() }),
  });
  return true;
}
