// Which term a student's (or a parent's child's) attendance should be read for.
//
// Academic-calendar institutions have one active term. Custom-calendar
// institutions have none (activeTerm is deliberately always null there) and
// instead any number of concurrently active "time blocks" — but every class
// belongs to exactly one block through its termId, so a class's block is known
// without asking the user. Only when the class's own block isn't among the
// active ones (e.g. it ended) do we fall back to letting the user pick.

export type AttendanceTerm = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

export type AttendanceTermResolution = {
  term: AttendanceTerm | null;
  // True when several active blocks are possible and none is the class's own.
  needsPicker: boolean;
};

type BlockLike = { term: AttendanceTerm };

export function resolveAttendanceTerm(args: {
  isCustomMode: boolean;
  activeTerm: AttendanceTerm | null;
  activeTimeBlocks: BlockLike[];
  // The class's own termId (custom mode), when known.
  classTermId?: string | null;
  // The user's pick from the fallback picker.
  selectedTermId?: string | null;
}): AttendanceTermResolution {
  const { isCustomMode, activeTerm, activeTimeBlocks, classTermId, selectedTermId } = args;

  if (!isCustomMode) return { term: activeTerm, needsPicker: false };
  if (activeTimeBlocks.length === 0) return { term: null, needsPicker: false };

  const own = activeTimeBlocks.find((b) => b.term.id === classTermId);
  if (own) return { term: own.term, needsPicker: false };

  const picked = activeTimeBlocks.find((b) => b.term.id === selectedTermId) ?? activeTimeBlocks[0];
  return { term: picked.term, needsPicker: activeTimeBlocks.length > 1 };
}
