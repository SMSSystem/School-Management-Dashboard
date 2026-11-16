import { useMemo } from "react";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useInstitutionSubjects } from "@/hooks/useInstitutionSubjects";

/** The terms (by name), subjects and classes the assignment form offers, from the shared cached lists. */
export function useAssignmentFormLists() {
  const { data: rawTerms = [] } = useInstitutionTerms();
  const terms = useMemo(
    () => [...rawTerms].sort((a, b) => a.name.localeCompare(b.name)),
    [rawTerms],
  );
  const { data: subjects = [] } = useInstitutionSubjects();
  const { data: classes = [] } = useInstitutionClasses();
  return { terms, subjects, classes };
}
