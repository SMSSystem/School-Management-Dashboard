// The Firebase-free part of migrate-register-ids.mjs: each register's fixed id, and which registers can move. The ids
// are a copy of src/lib/attendanceRegisters.ts, and a test runs both over the same values.

export const COLLECTION_IDS = {
  generalAttendance: (d) => parts("ga", d.classId, d.date, d.session),
  subjectAttendance: (d) => parts("sa", d.subjectId, d.classId, d.sessionDate),
};

function parts(prefix, ...values) {
  if (values.some((value) => typeof value !== "string" || value === ""))
    return null;
  return [prefix, ...values].join("_");
}

/**
 * Decides what happens to one collection's registers ({ id, data }). A register moves only when it alone claims its
 * fixed id: duplicates, and anything already at that id, are left for a person to look at.
 */
export function planMigration(collection, rows) {
  const fixedIdOf = COLLECTION_IDS[collection];
  const claims = new Map();
  const missingKey = [];
  for (const row of rows) {
    const fixedId = fixedIdOf(row.data);
    if (fixedId === null) {
      missingKey.push(row.id);
      continue;
    }
    const claim = claims.get(fixedId) ?? [];
    claim.push(row);
    claims.set(fixedId, claim);
  }

  const moves = [];
  const conflicts = [];
  let alreadyFixed = 0;
  for (const [fixedId, claim] of claims) {
    if (claim.length > 1)
      conflicts.push({ fixedId, documentIds: claim.map((row) => row.id) });
    else if (claim[0].id === fixedId) alreadyFixed += 1;
    else moves.push({ from: claim[0].id, to: fixedId });
  }
  return { moves, conflicts, alreadyFixed, missingKey };
}

/** Whether reading this many documents is allowed. */
export function withinBudget(totalDocuments, maxReads) {
  return totalDocuments <= maxReads;
}

/**
 * Moves one register: creates it at its fixed id and deletes the old one in one batch. It fails, moving nothing, when a
 * document already sits at the new id, or the old one changed since it was read, so a save during the run is never lost.
 * Run the script again to pick up anything that failed.
 */
export async function moveRegister(db, collectionRef, move, snapshot) {
  const batch = db.batch();
  batch.create(collectionRef.doc(move.to), snapshot.data());
  batch.delete(snapshot.ref, { lastUpdateTime: snapshot.updateTime });
  await batch.commit();
}
