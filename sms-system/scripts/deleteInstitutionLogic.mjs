// The pure side of scripts/delete-real-institution.mjs: which collections an institution owns, what the script refuses,
// how the budget and the checkpoint behave. No I/O, so it is tested in Node (src/lib/__tests__/deleteInstitution.test.ts).
//
// Why a tree and not listCollections(): Firestore does not delete the subcollections of a deleted document, and asking a
// document for its subcollections costs a request for every document. The tree below is the list of every collection that
// firestore.rules gives an institution; a test reads firestore.rules and fails when a collection there is not in this tree,
// so a collection added later cannot be forgotten silently.

import { isValidInstitutionId } from "./sweepOrphanBlobsLogic.mjs";

export { isValidInstitutionId };

/** Documents that are not institutions (rename-institution.mjs refuses the same ones). */
export const SYSTEM_INSTITUTION_IDS = ["_placeholder", "_platform", "master"];

/** Deletes in one batch, and the size of a page read while draining (Firestore allows 500 writes in a batch). */
export const BATCH_LIMIT = 450;

/**
 * Deletes a run may spend. Spark allows 20,000 deletes and 50,000 reads a day for the whole project, and draining a
 * collection reads about one document per delete, so a run is kept well under both. The owner sets it from the dry run's counts.
 */
export const DEFAULT_BUDGET = 5000;

/** The most reads the counting dry run may spend before it stops and says so. */
export const DEFAULT_COUNT_READ_CAP = 20_000;

/** Each value is the subcollections of a document of that collection ({} for none). */
export const INSTITUTION_TREE = {
  email_settings: {},
  audit_log: {},
  houses: {},
  departments: {},
  events: {},
  announcements: {},
  nonSchoolDays: {},
  academicYears: {},
  subjects: {},
  classes: {},
  terms: {},
  lessons: {},
  lessonNotes: { attachment: {} },
  exams: {
    content: {},
    private: {},
    attempts: {},
    grades: {},
    accommodations: {},
  },
  assignments: { submissions: { attempts: {} }, submissionTombstones: {} },
  rubrics: { file: {} },
  results: {},
  feedback_comments: {},
  subjectEnrollments: {},
  timetable_slots: {},
  gradebooks: { columns: {} },
  generalAttendance: {},
  subjectAttendance: {},
  attendanceSummaries: {},
  studentActivities: {},
  studentResponsibilities: {},
  reportCardComments: {},
  reportCards: {},
  progressReports: {},
  disciplinaryActions: {},
  enrollmentRegistrations: {},
};

/** The subcollections of a user document (the document is deleted with `users`). */
export const USER_SUBCOLLECTIONS = ["photo", "activity_log"];

/**
 * The old flat top-level collections firestore.rules still lists as LEGACY. The app no longer uses them, but a document
 * there that carries this institution's id is swept too. `gradebooks` keeps its `columns`.
 */
export const LEGACY_TREE = {
  subjects: {},
  classes: {},
  terms: {},
  academicYears: {},
  nonSchoolDays: {},
  houses: {},
  departments: {},
  teachers: {},
  students: {},
  lessons: {},
  exams: {},
  assignments: {},
  results: {},
  feedback_comments: {},
  subjectEnrollments: {},
  timetable_slots: {},
  gradebooks: { columns: {} },
  generalAttendance: {},
  subjectAttendance: {},
  attendanceSummaries: {},
  studentActivities: {},
  studentResponsibilities: {},
  reportCardComments: {},
  reportCards: {},
  disciplinaryActions: {},
  events: {},
  announcements: {},
};

/** Every collection chain in a tree: `exams`, `exams/content`, `assignments/submissions/attempts` ... */
export function collectionPaths(tree, prefix = "") {
  const out = [];
  for (const [name, children] of Object.entries(tree)) {
    const here = prefix ? `${prefix}/${name}` : name;
    out.push(here, ...collectionPaths(children, here));
  }
  return out;
}

/**
 * The institution-owned collection chains named by firestore.rules: every `match /institutions/{institutionId}/<path>`,
 * with the document ids dropped (`exams/{examId}/content/questions` is the chain `exams/content`).
 */
export function rulesCollectionPaths(rulesText) {
  const found = new Set();
  const segment = String.raw`(?:[\w-]+|\{[\w=*]+\})`;
  const re = new RegExp(
    String.raw`match\s+\/institutions\/\{institutionId\}\/(${segment}(?:\/${segment})*)\s*\{`,
    "g",
  );
  let m;
  while ((m = re.exec(rulesText)) !== null) {
    const parts = m[1].split("/");
    const names = parts.filter((_, i) => i % 2 === 0);
    for (let n = 1; n <= names.length; n += 1)
      found.add(names.slice(0, n).join("/"));
  }
  return [...found].sort();
}

/** Every phase, in the order it runs (parents last). The checkpoint keeps the status of each. */
export function phaseOrder() {
  return [
    "directory",
    "auth",
    "rtdb",
    ...Object.keys(INSTITUTION_TREE).map((n) => `nested:${n}`),
    "userSubcollections",
    "student_parents",
    "users",
    ...Object.keys(LEGACY_TREE).map((n) => `legacy:${n}`),
    "institution",
  ];
}

/** Can this id and name be deleted? Returns the reasons it cannot (empty when it can). */
export function checkTarget({
  institutionId,
  confirmName,
  exists,
  storedName,
}) {
  const problems = [];
  if (!isValidInstitutionId(institutionId ?? ""))
    problems.push(
      "--institution-id must be one institution id (no slashes, dots or spaces).",
    );
  else if (SYSTEM_INSTITUTION_IDS.includes(institutionId))
    problems.push(
      `"${institutionId}" is a system document, not an institution.`,
    );
  if (typeof confirmName !== "string" || confirmName.trim() === "")
    problems.push(
      "--confirm-name is required (the institution’s exact current name).",
    );
  if (exists === false)
    problems.push(
      "There is no institution document with that id (nothing to delete, or it was already deleted).",
    );
  else if (
    exists &&
    typeof confirmName === "string" &&
    confirmName !== storedName
  ) {
    problems.push(
      `The name does not match: the institution is called "${storedName}" and --confirm-name is "${confirmName}" (exact, case-sensitive).`,
    );
  }
  return problems;
}

/** What is wrong with the people found for the institution. `users` is [{ uid, role, institutionId }]. */
export function rosterProblems(users, institutionId) {
  const problems = [];
  const platform = users.filter((u) => u.role === "super_admin");
  if (platform.length > 0)
    problems.push(
      `${platform.length} account(s) are super_admin; a platform administrator must never be deleted with an institution.`,
    );
  const strangers = users.filter((u) => u.institutionId !== institutionId);
  if (strangers.length > 0)
    problems.push(
      `${strangers.length} account(s) found belong to another institution.`,
    );
  return problems;
}

/** Counts per role, for the report. */
export function roleCounts(users) {
  const counts = {};
  for (const u of users)
    counts[u.role ?? "unknown"] = (counts[u.role ?? "unknown"] ?? 0) + 1;
  return counts;
}

/** The phrase the operator types before a live run. */
export const confirmationPhrase = (total, institutionId) =>
  `DELETE ${total} ${institutionId}`;

/** How many daily runs the deletes need at this budget (at least 1 when there is anything to delete). */
export function estimateRuns(totalDeletes, budget) {
  if (totalDeletes <= 0) return 0;
  return Math.ceil(totalDeletes / Math.max(1, budget));
}

/** Delete budget of one run. */
export function createBudget(limit) {
  let spent = 0;
  return {
    limit,
    spend(n) {
      spent += n;
    },
    spent: () => spent,
    remaining: () => Math.max(0, limit - spent),
    exhausted: () => spent >= limit,
  };
}

export function newCheckpoint({ institutionId, name }) {
  return {
    institutionId,
    name,
    createdAt: new Date().toISOString(),
    uids: null,
    progress: {},
    phases: Object.fromEntries(
      phaseOrder().map((p) => [p, { status: "pending" }]),
    ),
  };
}

/** A saved checkpoint is used only for the same institution and name; a phase added since is pending. */
export function resumeCheckpoint(saved, { institutionId, name }) {
  const problems = [];
  if (saved.institutionId !== institutionId)
    problems.push(
      `The checkpoint is for institution ${saved.institutionId}, not ${institutionId}.`,
    );
  if (name !== undefined && saved.name !== name)
    problems.push(
      `The checkpoint was made for "${saved.name}", not "${name}".`,
    );
  if (problems.length > 0) return { problems, checkpoint: null };
  for (const p of phaseOrder())
    if (!saved.phases[p]) saved.phases[p] = { status: "pending" };
  return { problems, checkpoint: saved };
}

export const checkpointPathFor = (institutionId) =>
  `.delete-institution-${institutionId}.checkpoint.json`;

export const isComplete = (checkpoint) =>
  phaseOrder().every((p) => checkpoint.phases[p]?.status === "complete");

/** The options of the command line, or the reason they are wrong. */
export function parseDeleteArgs(argv) {
  const opts = {
    institutionId: null,
    confirmName: null,
    project: null,
    keyPath: null,
    databaseUrl: null,
    budget: DEFAULT_BUDGET,
    maxReads: DEFAULT_COUNT_READ_CAP,
    live: false,
    verify: false,
    listMatches: null,
    help: false,
  };
  for (const arg of argv) {
    const value = (flag) => arg.slice(flag.length);
    if (arg === "--live") opts.live = true;
    else if (arg === "--verify") opts.verify = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg.startsWith("--institution-id="))
      opts.institutionId = value("--institution-id=");
    else if (arg.startsWith("--confirm-name="))
      opts.confirmName = value("--confirm-name=");
    else if (arg.startsWith("--project=")) opts.project = value("--project=");
    else if (arg.startsWith("--key=")) opts.keyPath = value("--key=");
    else if (arg.startsWith("--database-url="))
      opts.databaseUrl = value("--database-url=");
    else if (arg.startsWith("--list-matches="))
      opts.listMatches = value("--list-matches=");
    else if (arg.startsWith("--budget=") || arg.startsWith("--max-reads=")) {
      const flag = arg.startsWith("--budget=") ? "--budget=" : "--max-reads=";
      const n = Number(value(flag));
      if (!Number.isInteger(n) || n <= 0)
        return { error: `Invalid ${flag.slice(0, -1)} value: ${arg}` };
      if (flag === "--budget=") opts.budget = n;
      else opts.maxReads = n;
    } else return { error: `Unrecognized argument: ${arg}` };
  }
  if (opts.help) return { opts };
  if (!opts.keyPath)
    return { error: "--key=<path to the service-account JSON> is required." };
  if (!opts.project)
    return {
      error:
        "--project=<firebase project id> is required (it must equal the key’s project_id).",
    };
  if (opts.live && opts.verify)
    return { error: "--live and --verify cannot be used together." };
  if (opts.listMatches === null && !opts.institutionId)
    return {
      error:
        '--institution-id=<id> is required (find it with --list-matches="<name>").',
    };
  if (opts.listMatches === null && !opts.verify && !opts.confirmName)
    return { error: '--confirm-name="<exact name>" is required.' };
  return { opts };
}
