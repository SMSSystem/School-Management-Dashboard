// Pure decisions for the dependency security workflow (.github/workflows/dependency-security.yml, documented in
// sms-system/docs/VERSIONING.md): which packages `npm audit fix` fixed, what is left, the changelog bullets and the pull
// request body. No I/O, so the tests can import it (sms-system/src/lib/__tests__/depsSecurityLogic.test.ts).
//
// It lives in .github/scripts, not sms-system/scripts: files there ship (scripts/versionLogic.mjs), and this is tooling.
// Input is `npm audit --json` (npm 7 and later): { vulnerabilities: { [name]: { severity, isDirect, via, nodes,
// fixAvailable } }, metadata: { vulnerabilities: { total, ... } } }, and the lockfile's `packages` map.

const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];

const rank = (severity) => SEVERITY_ORDER.indexOf(severity);

/**
 * Whether `npm audit --json` failed rather than reported: npm prints `{ "error": ... }` when it can't reach the
 * advisory service, and nothing at all in some failures. Either way there is no report, so the run must not read it as
 * "no vulnerabilities".
 */
export function auditError(report) {
  if (!report || typeof report !== "object") return true;
  if ("error" in report) return true;
  return !("vulnerabilities" in report) && !("metadata" in report);
}

/** How many packages in an audit report have an advisory of their own (not just a vulnerable dependency). */
export function vulnerabilityCount(report) {
  return ownAdvisories(report).length;
}

/** The plain advisory titles behind a package's entry (`via` mixes advisories and names of other vulnerable packages). */
function advisoryTitles(entry) {
  return [
    ...new Set(
      (entry.via ?? [])
        .filter((v) => typeof v === "object" && v !== null && v.title)
        .map((v) => v.title),
    ),
  ];
}

/** The installed version and whether the package is only used to build and test, from the lockfile. */
function lockInfo(lock, entry, name) {
  const packages = lock?.packages ?? {};
  const paths = entry.nodes?.length ? entry.nodes : [`node_modules/${name}`];
  const found = paths.map((p) => packages[p]).filter(Boolean);
  const versions = [...new Set(found.map((p) => p.version).filter(Boolean))];
  return {
    // Two copies at different versions read "2.4.0/1.20.9", so a list of packages stays unambiguous.
    version: versions.join("/") || "?",
    dev: found.length > 0 && found.every((p) => p.dev === true),
  };
}

/**
 * The packages with an advisory of their own. npm also lists every package that depends on one (eslint because of
 * minimatch, firebase because of @grpc/grpc-js); those aren't vulnerable themselves and aren't what gets updated.
 */
const ownAdvisories = (report) =>
  Object.entries(report?.vulnerabilities ?? {}).filter(
    ([, entry]) => advisoryTitles(entry).length > 0,
  );

/**
 * The packages `npm audit fix` fixed: listed before, gone after. Each with its new version (from the lockfile after the
 * fix), its severity before, whether it is a build or test tool only, and the advisory titles. Most severe first.
 */
export function fixedPackages(before, after, lockAfter) {
  const left = after?.vulnerabilities ?? {};
  return ownAdvisories(before)
    .filter(([name]) => !(name in left))
    .map(([name, entry]) => ({
      name,
      severity: entry.severity,
      direct: entry.isDirect === true,
      titles: advisoryTitles(entry),
      ...lockInfo(lockAfter, entry, name),
    }))
    .sort(
      (a, b) =>
        rank(b.severity) - rank(a.severity) || a.name.localeCompare(b.name),
    );
}

/** The vulnerable packages `npm audit fix` couldn't fix within the declared version ranges, with the reason. */
export function remainingPackages(after) {
  return ownAdvisories(after)
    .map(([name, entry]) => {
      const fix = entry.fixAvailable;
      let reason;
      if (fix === false) reason = "no fixed version yet";
      else if (fix && typeof fix === "object" && fix.isSemVerMajor)
        reason = `fix by hand: npm's only suggestion is a breaking change (${fix.name} ${fix.version}); an \`overrides\` entry or a newer parent package may do`;
      else if (fix && typeof fix === "object")
        reason = `fixed by updating ${fix.name} to ${fix.version}`;
      else reason = "a fix exists but wasn't applied";
      return { name, severity: entry.severity, reason };
    })
    .sort(
      (a, b) =>
        rank(b.severity) - rank(a.severity) || a.name.localeCompare(b.name),
    );
}

const severityWords = (severity) =>
  severity === "moderate" ? "moderate-severity" : `${severity}-severity`;

/**
 * Changelog bullets in plain words (AGENTS.md: no file paths): one per package the app ships, and one for all the
 * build and test tools.
 */
export function securityBullets(fixed) {
  const shipped = fixed.filter((p) => !p.dev);
  const tools = fixed.filter((p) => p.dev);
  const bullets = shipped.map(
    (p) =>
      `Updated ${p.name} to ${p.version}, fixing a ${severityWords(p.severity)} security issue.`,
  );
  if (tools.length > 0)
    bullets.push(
      `Updated build and test tools to fix known security issues: ${tools
        .map((p) => `${p.name} ${p.version}`)
        .join(", ")}.`,
    );
  return bullets;
}

const UNRELEASED = "## Unreleased";
const NOTHING_YET = "_Nothing yet._";

/**
 * Puts the bullets under `**Security**` in the Unreleased section of CHANGELOG.md, keeping what is already there:
 * "_Nothing yet._" is replaced, an existing Security block gets the bullets appended. Line endings are kept.
 */
export function addUnreleasedBullets(raw, bullets) {
  if (bullets.length === 0) return raw;
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === UNRELEASED);
  if (start === -1)
    throw new Error("CHANGELOG.md has no '## Unreleased' section");
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end === -1) end = lines.length;
  const section = lines
    .slice(start + 1, end)
    .filter((l) => l.trim() !== NOTHING_YET);
  const items = bullets.map((b) => `- ${b}`);
  const securityAt = section.findIndex((l) => l.trim() === "**Security**");
  let next;
  if (securityAt === -1) {
    const body = section.join("\n").trim();
    next = ["", ...(body ? [body, ""] : []), "**Security**", "", ...items, ""];
    next = next.join("\n").split("\n");
  } else {
    let insertAt = securityAt + 1;
    while (insertAt < section.length && !/^\*\*/.test(section[insertAt].trim()))
      insertAt++;
    while (insertAt > securityAt + 1 && section[insertAt - 1].trim() === "")
      insertAt--;
    next = [
      ...section.slice(0, insertAt),
      ...items,
      ...section.slice(insertAt),
    ];
  }
  return [...lines.slice(0, start + 1), ...next, ...lines.slice(end)].join(eol);
}

/** The pull request's description. */
export function prBody({ fixed, remaining, checks }) {
  const list = (rows) => rows.map((r) => `- ${r}`).join("\n");
  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  const lines = [
    "## Summary",
    "",
    "Made by the **Dependency security** workflow (`.github/workflows/dependency-security.yml`), which ran `npm audit fix` " +
      "in `sms-system/`: only updates within the version ranges in `package.json`, never `--force`. It bumped the patch " +
      "version and wrote the changelog's Security bullets. It never merges: review and merge as usual.",
    "",
    `## Fixed (${fixed.length})`,
    "",
    fixed.length
      ? list(
          fixed.map(
            (p) =>
              `**${p.name}** ${p.version} (${p.severity}, ${p.dev ? "build and test tools" : "ships in the app"})` +
              (p.titles.length ? `: ${p.titles.join("; ")}` : ""),
          ),
        )
      : "Nothing.",
    "",
    `## Still open (${remaining.length})`,
    "",
    remaining.length
      ? list(remaining.map((p) => `**${p.name}** (${p.severity}): ${p.reason}`))
      : "Nothing: every alert with a fix is fixed.",
    "",
    "## Checks run by the workflow",
    "",
    list(
      Object.entries(checks).map(
        ([name, ok]) => `${ok ? "✅" : "❌"} \`${name}\``,
      ),
    ),
    "",
    failed.length
      ? "**A check failed, so this pull request is a draft.** Look at the workflow run's log before going on."
      : "All checks passed. The pull request's own checks run as well.",
    "",
    "## Firebase free tier",
    "",
    "No effect: only package versions change.",
  ];
  return lines.join("\n") + "\n";
}
