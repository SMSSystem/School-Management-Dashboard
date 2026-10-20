// Which students the Edit House form writes. The form shows the shared cached students list (up to five minutes old),
// so it writes only the students the person actually ticked or unticked, and checks each one's current house just
// before the batch: a student another admin has already moved is left alone instead of being moved back.

/** The students whose box differs from how it was when the form first showed the list. */
export function toggledStudentIds(initialIds: ReadonlySet<string>, checkedIds: ReadonlySet<string>): string[] {
  const changed: string[] = [];
  for (const uid of checkedIds) if (!initialIds.has(uid)) changed.push(uid);
  for (const uid of initialIds) if (!checkedIds.has(uid)) changed.push(uid);
  return changed;
}

/**
 * @param freshHouseIds the toggled students' houseId as read just now; a student missing from the map no longer
 *   exists (or could not be read) and is skipped, and `null` means they are in no house.
 */
export function planHouseChanges({
  initialIds,
  checkedIds,
  freshHouseIds,
  houseId,
}: {
  initialIds: ReadonlySet<string>;
  checkedIds: ReadonlySet<string>;
  freshHouseIds: ReadonlyMap<string, string | null | undefined>;
  houseId: string;
}): { toAssign: string[]; toRemove: string[] } {
  const toAssign: string[] = [];
  const toRemove: string[] = [];
  for (const uid of toggledStudentIds(initialIds, checkedIds)) {
    if (!freshHouseIds.has(uid)) continue;
    const current = freshHouseIds.get(uid) ?? null;
    if (checkedIds.has(uid)) {
      // ticked: move into this house unless they are already in it
      if (current !== houseId) toAssign.push(uid);
    } else if (current === houseId) {
      // unticked: take them out only if they are still in this house (not moved to another since)
      toRemove.push(uid);
    }
  }
  return { toAssign, toRemove };
}
