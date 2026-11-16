// The pure part of rubric-file-report.mjs: summing one school's rubric files from each rubric's `file` field.
// Kept apart from the Firestore calls so the tests can run it.

/** The app's soft limit on rubric files per school (src/lib/rubricFileKinds.ts SOFT_SCHOOL_FILE_LIMIT). */
export const SOFT_SCHOOL_FILE_LIMIT = 200;

/** The MIME types a rubric file may have (firestore.rules isValidRubricFile), by the name the report prints. */
export const FILE_TYPES = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word",
  "text/markdown": "Markdown",
  "text/csv": "CSV",
};

/** The printed name of a file's type; "Other" for anything the rules shouldn't have let in. */
export function fileType(mimeType) {
  return FILE_TYPES[mimeType] ?? "Other";
}

/**
 * Sums one school's rubrics. Each row is a rubric's `file` field, or undefined for a rubric with only a grid.
 * Sizes are raw bytes, as stored. Returns counts and sizes only: no titles, names or ids.
 */
export function summariseRubrics(files) {
  const byType = {};
  let withFile = 0;
  let totalBytes = 0;
  let largestBytes = 0;
  for (const file of files) {
    if (!file) continue;
    withFile += 1;
    const size = Number.isFinite(file.size) && file.size > 0 ? file.size : 0;
    totalBytes += size;
    largestBytes = Math.max(largestBytes, size);
    const type = fileType(file.mimeType);
    byType[type] = (byType[type] ?? 0) + 1;
  }
  return {
    rubrics: files.length,
    withFile,
    totalBytes,
    largestBytes,
    shareOfSoftLimit: withFile / SOFT_SCHOOL_FILE_LIMIT,
    overSoftLimit: withFile > SOFT_SCHOOL_FILE_LIMIT,
    byType,
  };
}

/** Bytes as KB or MB, one decimal place, for the printed report. */
export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const VALUE_FLAGS = {
  "--key=": (opts, value) => ({ ...opts, keyPath: value }),
  "--institution=": (opts, value) => ({ ...opts, institution: value }),
  "--max-reads=": (opts, value) => ({ ...opts, maxReads: Number(value) }),
};

function optionsError(opts) {
  if (
    opts.institution !== null &&
    !/^[A-Za-z0-9_-]{1,64}$/.test(opts.institution)
  )
    return "--institution must be a single institution id (no slashes, dots or spaces).";
  if (!Number.isInteger(opts.maxReads) || opts.maxReads < 1)
    return "--max-reads must be a whole number above 0.";
  return null;
}

/** The script's flags, as { opts }, { help: true } or { error }. Never exits, so it can be tested. */
export function parseReportArgs(argv, defaultMaxReads) {
  let opts = {
    keyPath: null,
    institution: null,
    read: false,
    maxReads: defaultMaxReads,
  };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--read") {
      opts = { ...opts, read: true };
      continue;
    }
    const flag = Object.keys(VALUE_FLAGS).find((f) => arg.startsWith(f));
    if (!flag) return { error: `Unrecognized argument: ${arg}` };
    opts = VALUE_FLAGS[flag](opts, arg.slice(flag.length));
  }
  const error = optionsError(opts);
  return error ? { error } : { opts };
}
