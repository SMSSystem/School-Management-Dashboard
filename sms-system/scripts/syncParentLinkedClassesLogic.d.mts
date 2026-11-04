type Student = { classId?: unknown; classIds?: unknown };

export function linkedClassList(children: readonly Student[]): string[];

export function planParentLists(input: {
  parents: readonly { id: string; institutionId?: unknown; linkedClassIds?: unknown }[];
  students: readonly ({ id: string; institutionId?: unknown } & Student)[];
  links: readonly { id?: unknown; parentId?: unknown; studentId?: unknown; institutionId?: unknown }[];
}): {
  changes: { parentId: string; linkedClassIds: string[] }[];
  linkFixes: { linkId: string; institutionId: string }[];
  report: {
    parentsChecked: number;
    toChange: number;
    alreadyRight: number;
    noChildren: number;
    linksToMissingParent: number;
    linksToMissingStudent: number;
    linksAcrossInstitutions: number;
    linksToCorrect: number;
  };
};
