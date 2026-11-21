import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  addUnreleasedBullets,
  auditError,
  fixedPackages,
  prBody,
  remainingPackages,
  securityBullets,
  vulnerabilityCount,
} from "../../../../.github/scripts/depsSecurityLogic.mjs";
import workflowFile from "../../../../.github/workflows/dependency-security.yml?raw";

// The dependency security workflow (.github/workflows/dependency-security.yml, sms-system/docs/VERSIONING.md): what
// `npm audit fix` fixed, what is left, the changelog bullets and the pull request body. The reports below follow the
// shape `npm audit --json` gives (npm 7 and later).

const advisory = (title: string, severity: string) => ({
  title,
  severity,
  url: "https://github.com/advisories/x",
});

const before = {
  vulnerabilities: {
    zod: {
      severity: "high",
      isDirect: true,
      via: [advisory("Zod can exhaust memory", "high")],
      nodes: ["node_modules/zod"],
      fixAvailable: true,
    },
    vite: {
      severity: "moderate",
      isDirect: true,
      via: [advisory("Vite path issue", "moderate")],
      nodes: ["node_modules/vite"],
      fixAvailable: true,
    },
    minimatch: {
      severity: "moderate",
      isDirect: false,
      via: [advisory("minimatch ReDoS", "moderate")],
      nodes: ["node_modules/minimatch"],
      fixAvailable: true,
    },
    // A dependent, listed only because of minimatch: not vulnerable itself.
    eslint: {
      severity: "moderate",
      isDirect: true,
      via: ["minimatch"],
      nodes: ["node_modules/eslint"],
      fixAvailable: true,
    },
    "@grpc/grpc-js": {
      severity: "high",
      isDirect: false,
      via: [advisory("grpc-js certificates", "high")],
      nodes: ["node_modules/@grpc/grpc-js"],
      fixAvailable: {
        name: "firebase",
        version: "9.14.0",
        isSemVerMajor: true,
      },
    },
    firebase: {
      severity: "high",
      isDirect: true,
      via: ["@grpc/grpc-js"],
      nodes: ["node_modules/firebase"],
      fixAvailable: {
        name: "firebase",
        version: "9.14.0",
        isSemVerMajor: true,
      },
    },
  },
};

const after = {
  vulnerabilities: {
    "@grpc/grpc-js": before.vulnerabilities["@grpc/grpc-js"],
    firebase: before.vulnerabilities.firebase,
  },
};

const lockAfter = {
  packages: {
    "node_modules/zod": { version: "4.6.6" },
    "node_modules/vite": { version: "8.1.6", dev: true },
    "node_modules/minimatch": { version: "10.0.4", dev: true },
  },
};

describe("fixedPackages and remainingPackages", () => {
  it("lists the packages fixed, most severe first, leaving out dependents that were only listed because of them", () => {
    const fixed = fixedPackages(before, after, lockAfter);
    expect(fixed.map((p) => [p.name, p.version, p.dev])).toEqual([
      ["zod", "4.6.6", false],
      ["minimatch", "10.0.4", true],
      ["vite", "8.1.6", true],
    ]);
    expect(fixed[0].titles).toEqual(["Zod can exhaust memory"]);
  });

  it("lists what is left with the reason, never suggesting a breaking change as an upgrade to make", () => {
    const left = remainingPackages(after);
    expect(left.map((p) => p.name)).toEqual(["@grpc/grpc-js"]);
    expect(left[0].reason).toMatch(/^fix by hand: .*firebase 9\.14\.0/);
  });

  it("shows both versions of a package installed twice, in a way a list of packages can't misread", () => {
    const twice = {
      vulnerabilities: {
        "body-parser": {
          severity: "high",
          via: [advisory("body-parser DoS", "high")],
          nodes: [
            "node_modules/body-parser",
            "node_modules/express/node_modules/body-parser",
          ],
        },
      },
    };
    const lock = {
      packages: {
        "node_modules/body-parser": { version: "2.4.0", dev: true },
        "node_modules/express/node_modules/body-parser": {
          version: "1.20.9",
          dev: true,
        },
      },
    };
    expect(fixedPackages(twice, {}, lock)[0]).toMatchObject({
      version: "2.4.0/1.20.9",
      dev: true,
    });
  });

  it("counts only packages with an advisory of their own", () => {
    expect(vulnerabilityCount(before)).toBe(4);
    expect(vulnerabilityCount({})).toBe(0);
  });
});

describe("auditError", () => {
  it("tells a failed audit from a report, so an outage never reads as 'nothing to fix'", () => {
    expect(
      auditError({
        error: {
          code: "ENOAUDIT",
          summary: "audit endpoint returned an error",
        },
      }),
    ).toBe(true);
    expect(auditError({})).toBe(true);
    expect(auditError(null)).toBe(true);
    expect(auditError(before)).toBe(false);
    expect(
      auditError({
        vulnerabilities: {},
        metadata: { vulnerabilities: { total: 0 } },
      }),
    ).toBe(false);
  });

  it("makes the workflow's script exit 1 on an error report", () => {
    const dir = mkdtempSync(join(tmpdir(), "deps-audit-"));
    const report = join(dir, "audit.json");
    writeFileSync(report, JSON.stringify({ error: { code: "ENOAUDIT" } }));
    const script = resolve(
      __dirname,
      "../../../../.github/scripts/deps-security.mjs",
    );
    let status = 0;
    try {
      execFileSync(process.execPath, [script, "count", report], {
        stdio: "pipe",
      });
    } catch (err) {
      status = (err as { status: number }).status;
    }
    expect(status).toBe(1);
    writeFileSync(report, JSON.stringify(before));
    expect(
      execFileSync(process.execPath, [script, "count", report], {
        encoding: "utf8",
      }).trim(),
    ).toBe("4");
  });
});

describe("advisory titles in the pull request", () => {
  it("can't notify a GitHub user: an @name is broken with a zero-width space", () => {
    const report = {
      vulnerabilities: {
        pkg: {
          severity: "low",
          via: [advisory("Reported by @someone in @org/pkg", "low")],
          nodes: ["node_modules/pkg"],
        },
      },
    };
    const [fixed] = fixedPackages(report, {}, {});
    expect(fixed.titles).toEqual(["Reported by @​someone in @​org/pkg"]);
    expect(fixed.titles[0]).not.toMatch(/@[a-z]/);
  });
});

describe("securityBullets", () => {
  it("names each package the app ships, and groups the build and test tools in one bullet", () => {
    expect(securityBullets(fixedPackages(before, after, lockAfter))).toEqual([
      "Updated zod to 4.6.6, fixing a high-severity security issue.",
      "Updated build and test tools to fix known security issues: minimatch 10.0.4, vite 8.1.6.",
    ]);
  });
});

describe("addUnreleasedBullets", () => {
  const head = "# Changelog\n\n**Current version:** v2.57.0\n\n";
  const tail = "## 2.x — data nested\n\n<details>old</details>\n";

  it("replaces 'Nothing yet' with a Security block", () => {
    const raw = `${head}## Unreleased\n\n_Nothing yet._\n\n${tail}`;
    expect(addUnreleasedBullets(raw, ["Updated zod."])).toBe(
      `${head}## Unreleased\n\n**Security**\n\n- Updated zod.\n\n${tail}`,
    );
  });

  it("keeps bullets already under Unreleased, and appends to an existing Security block", () => {
    const raw = `${head}## Unreleased\n\n**Fixed**\n\n- A fix.\n\n**Security**\n\n- Earlier.\n\n${tail}`;
    expect(addUnreleasedBullets(raw, ["Updated zod."])).toBe(
      `${head}## Unreleased\n\n**Fixed**\n\n- A fix.\n\n**Security**\n\n- Earlier.\n- Updated zod.\n\n${tail}`,
    );
  });

  it("adds a Security block after other bullets, and keeps Windows line endings", () => {
    const raw =
      `${head}## Unreleased\n\n**Fixed**\n\n- A fix.\n\n${tail}`.replace(
        /\n/g,
        "\r\n",
      );
    expect(addUnreleasedBullets(raw, ["Updated zod."])).toBe(
      `${head}## Unreleased\n\n**Fixed**\n\n- A fix.\n\n**Security**\n\n- Updated zod.\n\n${tail}`.replace(
        /\n/g,
        "\r\n",
      ),
    );
  });

  it("changes nothing when there is nothing to add, and refuses a changelog with no Unreleased section", () => {
    const raw = `${head}## Unreleased\n\n_Nothing yet._\n\n${tail}`;
    expect(addUnreleasedBullets(raw, [])).toBe(raw);
    expect(() => addUnreleasedBullets(head + tail, ["x"])).toThrow(
      /Unreleased/,
    );
  });
});

describe("prBody", () => {
  it("lists what was fixed and what is left, and says a failed check made it a draft", () => {
    const body = prBody({
      fixed: fixedPackages(before, after, lockAfter),
      remaining: remainingPackages(after),
      checks: { "npm test": true, "npm run build": false },
    });
    expect(body).toContain("## Fixed (3)");
    expect(body).toContain(
      "**zod** 4.6.6 (high, runtime dependency): Zod can exhaust memory",
    );
    expect(body).toContain("## Still open (1)");
    expect(body).toContain("❌ `npm run build`");
    expect(body).toContain("this pull request is a draft");
    expect(body).toContain("It never merges");
  });
});

// The workflow as the checks below read it: LF line endings. A Windows checkout with core.autocrlf gives CRLF, and a
// pattern such as /^permissions:\n/ would then fail on the owner's machine while passing on GitHub's Linux runner.
const normalise = (text: string) => text.replace(/\r\n/g, "\n");
const lfFile = normalise(workflowFile);
const crlfFile = lfFile.replace(/\n/g, "\r\n");

// The workflow's jobs, as text: everything from "  <name>:" up to the next job (two-space keys under `jobs:`).
function jobText(workflow: string, name: string): string {
  const lines = workflow.split("\n");
  const from = lines.findIndex((l) => l === `  ${name}:`);
  if (from === -1) throw new Error(`no job ${name}`);
  let to = lines.findIndex((l, i) => i > from && /^ {2}[a-z][\w-]*:$/.test(l));
  if (to === -1) to = lines.length;
  return lines.slice(from, to).join("\n");
}

// Every check runs on both line endings, so one that only works with LF fails here first.
describe.each([
  ["LF", lfFile],
  ["CRLF", crlfFile],
])("the workflow (%s)", (_endings, file) => {
  const workflow = normalise(file);
  const token = jobText(workflow, "token");
  const prepare = jobText(workflow, "prepare");
  const publish = jobText(workflow, "publish");

  it("is read with LF line endings whatever the checkout gave", () => {
    expect(workflow).not.toContain("\r");
  });

  it("never forces breaking upgrades and never merges", () => {
    expect(workflow).not.toMatch(/audit fix[^\n]*--force/);
    expect(workflow).not.toMatch(/gh pr merge|auto-merge|--auto/);
    expect(prepare).toContain("npm audit fix");
  });

  it("fails the run when an audit report is an error: the count is never excused with || true", () => {
    const counts = prepare
      .split("\n")
      .filter((l) => l.includes("deps-security.mjs count"));
    expect(counts).toHaveLength(2);
    for (const line of counts) expect(line).not.toContain("|| true");
  });

  it("keeps the token away from package code: only the token check and publish see it, and publish runs no project code", () => {
    expect(prepare).not.toContain("secrets.");
    expect(token).toContain("secrets.DEPS_PR_TOKEN");
    expect(publish).toContain("secrets.DEPS_PR_TOKEN");
    expect(token).not.toMatch(/checkout|npm|node /);
    // Commands, not comments or the commit message: no Node set-up and no line that runs npm, npx or node.
    expect(publish).not.toContain("actions/setup-node@");
    expect(publish).not.toMatch(/^\s*(npm|npx|node)\s/m);
    expect(publish).not.toMatch(/\$\((npm|npx|node)\s/);
    expect(publish).not.toMatch(/run:\s*(npm|npx|node)\s/);
    expect(
      workflow.match(/^permissions:\n {2}contents: read$/m),
    ).not.toBeNull();
  });

  it("publishes only the three files it expects, with git hooks off", () => {
    expect(publish).toContain(
      'expected="CHANGELOG.md body.md package-lock.json package.json"',
    );
    expect(publish).toContain(
      "git add CHANGELOG.md sms-system/package.json sms-system/package-lock.json",
    );
    expect(publish).toMatch(
      /git -c core\.hooksPath=\/dev\/null commit --no-verify/,
    );
    expect(publish).toMatch(
      /git -c core\.hooksPath=\/dev\/null push --no-verify/,
    );
    expect(prepare).toContain("persist-credentials: false");
    expect(publish).toContain("persist-credentials: false");
  });

  it("pins every action by commit, and marks a passing rerun ready again", () => {
    for (const line of workflow.split("\n").filter((l) => /uses:/.test(l)))
      expect(line).toMatch(/uses: actions\/[\w-]+@[0-9a-f]{40} # v\d/);
    expect(publish).toContain('else gh pr ready "$existing" || true; fi');
    // A second upload in the same run (Re-run all jobs) replaces the first instead of failing.
    expect(prepare).toContain("overwrite: true");
  });

  it("runs on Mondays off the hour, when GitHub is less busy", () => {
    expect(workflow).toContain('cron: "23 6 * * 1"');
  });
});
