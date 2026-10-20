import { getDocs } from 'firebase/firestore';
import { institutionSubcollection } from '@/lib/paths';
import { assignmentGradebookId, conversionColumnsOf, type Assignment } from '@/lib/assignmentDetailLogic';

// The one read of the assignment detail page that is not a listener (scenes/(dashboard)/list/assignments/[id]):
// the gradebook columns the Convert dialog offers, read fresh each time the dialog opens, in the same shape
// AssignmentForm.tsx's own picker uses. A failed read is the caller's to turn into an empty list.
export async function fetchConversionColumns(institutionId: string, assignment: Pick<Assignment, 'classId' | 'subjectId' | 'termId'>) {
  const snap = await getDocs(institutionSubcollection(institutionId, "gradebooks", assignmentGradebookId(assignment), "columns"));
  return conversionColumnsOf(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
}
