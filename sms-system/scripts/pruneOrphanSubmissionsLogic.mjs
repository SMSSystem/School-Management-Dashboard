// The pure part of prune-orphan-submissions.mjs: its flags and the totals it prints. Kept apart from the Firestore
// calls so the tests can run it.

/** The script's flags, as { opts }, { help: true } or { error }. Never exits, so it can be tested. */
export function parseOrphanArgs(argv) {
  const opts = { keyPath: null, institution: null, live: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--live") opts.live = true;
    else if (arg.startsWith("--key="))
      opts.keyPath = arg.slice("--key=".length);
    else if (arg.startsWith("--institution="))
      opts.institution = arg.slice("--institution=".length);
    else return { error: `Unrecognized argument: ${arg}` };
  }
  if (
    opts.institution !== null &&
    !/^[A-Za-z0-9_-]{1,64}$/.test(opts.institution)
  )
    return {
      error:
        "--institution must be a single institution id (no slashes, dots or spaces).",
    };
  return { opts };
}

/**
 * One orphaned assignment's totals: what is left under an assignment id whose document is gone. Sizes are each file's
 * stored `fileSize` (raw bytes), read without downloading the file.
 */
export function summariseOrphan({ submissionSizes, attemptSizes, tombstones }) {
  const sum = (sizes) =>
    sizes.reduce(
      (total, n) => total + (Number.isFinite(n) && n > 0 ? n : 0),
      0,
    );
  return {
    submissions: submissionSizes.length,
    attempts: attemptSizes.length,
    tombstones,
    bytes: sum(submissionSizes) + sum(attemptSizes),
  };
}

/** The totals of many orphans, for the closing line. */
export function totalOrphans(summaries) {
  return summaries.reduce(
    (t, s) => ({
      assignments: t.assignments + 1,
      submissions: t.submissions + s.submissions,
      attempts: t.attempts + s.attempts,
      tombstones: t.tombstones + s.tombstones,
      bytes: t.bytes + s.bytes,
    }),
    { assignments: 0, submissions: 0, attempts: 0, tombstones: 0, bytes: 0 },
  );
}
