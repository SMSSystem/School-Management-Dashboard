import { describe, expect, it } from "vitest";
import {
  BATCH_LIMIT,
  DEFAULT_BUDGET,
  INSTITUTION_TREE,
  LEGACY_TREE,
  SYSTEM_INSTITUTION_IDS,
  USER_SUBCOLLECTIONS,
  checkTarget,
  checkpointPathFor,
  collectionPaths,
  confirmationPhrase,
  createBudget,
  estimateRuns,
  isComplete,
  newCheckpoint,
  parseDeleteArgs,
  phaseOrder,
  resumeCheckpoint,
  roleCounts,
  rosterProblems,
  rulesCollectionPaths,
} from "../../../scripts/deleteInstitutionLogic.mjs";
import {
  ReadCapError,
  countCollection,
  drainCollection,
} from "../../../scripts/deleteInstitutionRunners.mjs";
import rulesRaw from "../../../firestore.rules?raw";
import scriptRaw from "../../../scripts/delete-real-institution.mjs?raw";

// The pure rules of scripts/delete-real-institution.mjs (the tree of collections, what it refuses, the budget and the
// checkpoint) and its Firestore runners against a small fake. The whole script is a live tool; what can be proved without
// a project is proved here.

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── A fake of the part of the Admin SDK the runners use ─────────────────────

class FakeDb {
  docs = new Map<string, Record<string, unknown>>();
  deleted: string[] = [];
  set(path: string, data: Record<string, unknown> = {}) {
    this.docs.set(path, data);
  }
  collection(name: string) {
    return new FakeQuery(this, name, [], null, null);
  }
  batch() {
    const ops: string[] = [];
    return {
      delete: (ref: { path: string }) => void ops.push(ref.path),
      commit: async () => {
        for (const p of ops) this.remove(p);
      },
    };
  }
  remove(path: string) {
    this.docs.delete(path);
    this.deleted.push(path);
  }
}

class FakeRef {
  constructor(
    private db: FakeDb,
    public path: string,
  ) {}
  get id() {
    return this.path.split("/").pop()!;
  }
  collection(name: string) {
    return new FakeQuery(this.db, `${this.path}/${name}`, [], null, null);
  }
  async delete() {
    this.db.remove(this.path);
  }
}

class FakeQuery {
  constructor(
    private db: FakeDb,
    private colPath: string,
    private filters: [string, unknown][],
    private max: number | null,
    private after: string | null,
  ) {}
  where(field: string, _op: string, value: unknown) {
    return new FakeQuery(
      this.db,
      this.colPath,
      [...this.filters, [field, value]],
      this.max,
      this.after,
    );
  }
  limit(n: number) {
    return new FakeQuery(this.db, this.colPath, this.filters, n, this.after);
  }
  orderBy(_field: string) {
    return this;
  }
  startAfter(doc: { ref: { path: string } }) {
    return new FakeQuery(
      this.db,
      this.colPath,
      this.filters,
      this.max,
      doc.ref.path,
    );
  }
  private matching() {
    const depth = this.colPath.split("/").length + 1;
    let paths = [...this.db.docs.keys()]
      .filter(
        (p) =>
          p.startsWith(`${this.colPath}/`) && p.split("/").length === depth,
      )
      .filter((p) =>
        this.filters.every(([f, v]) => this.db.docs.get(p)![f] === v),
      )
      .sort();
    if (this.after) paths = paths.filter((p) => p > this.after!);
    return this.max === null ? paths : paths.slice(0, this.max);
  }
  async get() {
    const docs = this.matching().map((p) => ({
      id: p.split("/").pop()!,
      ref: new FakeRef(this.db, p),
      data: () => this.db.docs.get(p),
    }));
    return { docs, empty: docs.length === 0 };
  }
  count() {
    return {
      get: async () => ({
        data: () => ({
          count: new FakeQuery(
            this.db,
            this.colPath,
            this.filters,
            null,
            null,
          ).matching().length,
        }),
      }),
    };
  }
}

const script = scriptRaw.split("\r\n").join("\n");

const ctxOf = (limit: number) => ({
  budget: createBudget(limit),
  stats: { reads: 0, deletes: 0 },
});

describe("the tree of collections", () => {
  it("names every institution-owned collection firestore.rules gives an institution, so none is forgotten", () => {
    const inRules = rulesCollectionPaths(rulesRaw);
    expect(inRules.length).toBeGreaterThan(30);
    const known = new Set(collectionPaths(INSTITUTION_TREE));
    const missing = inRules.filter((p) => !known.has(p));
    expect(missing).toEqual([]);
  });

  it("has the subcollections the earlier teardown never knew", () => {
    const known = new Set(collectionPaths(INSTITUTION_TREE));
    for (const p of [
      "audit_log",
      "rubrics",
      "rubrics/file",
      "email_settings",
      "lessonNotes/attachment",
      "assignments/submissions",
      "assignments/submissions/attempts",
      "assignments/submissionTombstones",
      "assignments/rubric",
      "exams/content",
      "exams/private",
      "exams/attempts",
      "exams/grades",
      "exams/accommodations",
      "gradebooks/columns",
    ]) {
      expect(known.has(p), p).toBe(true);
    }
  });

  it("reads a chain out of rules text, dropping document ids", () => {
    const text =
      "match /institutions/{institutionId}/exams/{examId}/content/questions { }\nmatch /institutions/{institutionId}/audit_log/{eventId} { }";
    expect(rulesCollectionPaths(text)).toEqual([
      "audit_log",
      "exams",
      "exams/content",
    ]);
  });

  it("keeps the phases in order: the directory entry first so the school leaves the login list, the institution last", () => {
    const order = phaseOrder();
    expect(order[0]).toBe("directory");
    expect(order[1]).toBe("auth");
    expect(order[order.length - 1]).toBe("institution");
    expect(order.indexOf("users")).toBeGreaterThan(
      order.indexOf("userSubcollections"),
    );
    expect(new Set(order).size).toBe(order.length);
    expect(USER_SUBCOLLECTIONS).toEqual(["photo", "activity_log"]);
    expect(Object.keys(LEGACY_TREE)).toContain("gradebooks");
  });
});

describe("what is refused", () => {
  const ok = {
    institutionId: "abc123",
    confirmName: "Example School",
    exists: true,
    storedName: "Example School",
  };

  it("accepts an existing institution whose name is typed exactly", () => {
    expect(checkTarget(ok)).toEqual([]);
  });

  it("refuses a wrong or differently-cased name, a missing name and a missing institution", () => {
    expect(checkTarget({ ...ok, confirmName: "example school" })[0]).toMatch(
      /does not match/,
    );
    expect(checkTarget({ ...ok, confirmName: "" }).join(" ")).toMatch(
      /--confirm-name is required/,
    );
    expect(
      checkTarget({ ...ok, exists: false, storedName: undefined })[0],
    ).toMatch(/no institution document/);
  });

  it("refuses the system documents and an id that is not one id", () => {
    for (const id of SYSTEM_INSTITUTION_IDS)
      expect(checkTarget({ ...ok, institutionId: id })[0]).toMatch(
        /system document/,
      );
    expect(checkTarget({ ...ok, institutionId: "a/b" })[0]).toMatch(
      /one institution id/,
    );
    expect(checkTarget({ ...ok, institutionId: null })[0]).toMatch(
      /one institution id/,
    );
  });

  it("refuses a roster with a platform administrator or an account of another institution", () => {
    const users = [
      { uid: "a", role: "student", institutionId: "abc123" },
      { uid: "b", role: "super_admin", institutionId: "abc123" },
      { uid: "c", role: "parent", institutionId: "other" },
    ];
    const problems = rosterProblems(users, "abc123");
    expect(problems.join(" ")).toMatch(/super_admin/);
    expect(problems.join(" ")).toMatch(/another institution/);
    expect(rosterProblems(users.slice(0, 1), "abc123")).toEqual([]);
    expect(roleCounts(users)).toEqual({
      student: 1,
      super_admin: 1,
      parent: 1,
    });
  });
});

describe("the command line", () => {
  const base = ["--key=k.json", "--project=p"];

  it("needs a key and a project, and an id and a name for a delete", () => {
    expect("error" in parseDeleteArgs([])).toBe(true);
    expect(
      (parseDeleteArgs(["--key=k.json"]) as { error: string }).error,
    ).toMatch(/--project/);
    expect((parseDeleteArgs(base) as { error: string }).error).toMatch(
      /--institution-id/,
    );
    expect(
      (parseDeleteArgs([...base, "--institution-id=x"]) as { error: string })
        .error,
    ).toMatch(/--confirm-name/);
  });

  it("is a dry run unless --live is given, with the default budget", () => {
    const r = parseDeleteArgs([
      ...base,
      "--institution-id=x",
      "--confirm-name=Name",
    ]) as { opts: any };
    expect(r.opts.live).toBe(false);
    expect(r.opts.verify).toBe(false);
    expect(r.opts.budget).toBe(DEFAULT_BUDGET);
    expect(
      (
        parseDeleteArgs([
          ...base,
          "--institution-id=x",
          "--confirm-name=Name",
          "--live",
        ]) as { opts: any }
      ).opts.live,
    ).toBe(true);
  });

  it("lets --verify and --list-matches run without a name, and refuses --live with --verify", () => {
    expect(
      "opts" in parseDeleteArgs([...base, "--institution-id=x", "--verify"]),
    ).toBe(true);
    expect(
      (
        parseDeleteArgs([...base, "--list-matches=Example School"]) as {
          opts: any;
        }
      ).opts.listMatches,
    ).toBe("Example School");
    expect(
      (
        parseDeleteArgs([
          ...base,
          "--institution-id=x",
          "--verify",
          "--live",
        ]) as { error: string }
      ).error,
    ).toMatch(/cannot be used together/);
  });

  it("rejects a bad budget and an unknown flag", () => {
    expect(
      (
        parseDeleteArgs([
          ...base,
          "--institution-id=x",
          "--confirm-name=N",
          "--budget=0",
        ]) as { error: string }
      ).error,
    ).toMatch(/budget/);
    expect(
      (parseDeleteArgs([...base, "--nope"]) as { error: string }).error,
    ).toMatch(/Unrecognized/);
  });
});

describe("the budget, the phrase and the checkpoint", () => {
  it("spends, stops at the limit and says how many runs are needed", () => {
    const b = createBudget(5);
    b.spend(3);
    expect(b.remaining()).toBe(2);
    expect(b.exhausted()).toBe(false);
    b.spend(2);
    expect(b.exhausted()).toBe(true);
    expect(estimateRuns(0, 5000)).toBe(0);
    expect(estimateRuns(12_001, 5000)).toBe(3);
    expect(BATCH_LIMIT).toBeLessThanOrEqual(500);
  });

  it("asks for the number of documents and the id", () => {
    expect(confirmationPhrase(412, "abc123")).toBe("DELETE 412 abc123");
  });

  it("resumes only for the same institution and name, and marks a phase added since as pending", () => {
    const cp = newCheckpoint({
      institutionId: "abc123",
      name: "Example School",
    });
    expect(isComplete(cp)).toBe(false);
    expect(
      resumeCheckpoint(cp, { institutionId: "other", name: "Example School" })
        .problems[0],
    ).toMatch(/not other/);
    expect(
      resumeCheckpoint(cp, { institutionId: "abc123", name: "Another" })
        .problems[0],
    ).toMatch(/not "Another"/);
    delete cp.phases["nested:rubrics"];
    const again = resumeCheckpoint(cp, {
      institutionId: "abc123",
      name: "Example School",
    });
    expect(again.problems).toEqual([]);
    expect(again.checkpoint!.phases["nested:rubrics"]).toEqual({
      status: "pending",
    });
    for (const p of phaseOrder()) cp.phases[p] = { status: "complete" };
    expect(isComplete(cp)).toBe(true);
    expect(checkpointPathFor("abc123")).toBe(
      ".delete-institution-abc123.checkpoint.json",
    );
  });
});

describe("draining a collection", () => {
  const seeded = () => {
    const db = new FakeDb();
    db.set("institutions/i/exams/e1");
    db.set("institutions/i/exams/e1/attempts/a1");
    db.set("institutions/i/exams/e1/attempts/a2");
    db.set("institutions/i/exams/e1/attempts/a3");
    db.set("institutions/i/exams/e2");
    db.set("institutions/i/exams/e2/attempts/b1");
    db.set("institutions/i/classes/c1");
    return db;
  };
  const exams = (db: FakeDb) =>
    new FakeQuery(db, "institutions/i/exams", [], null, null);

  it("deletes a document only after its subcollections are empty", async () => {
    const db = seeded();
    const ctx = ctxOf(100);
    const done = await drainCollection(db, exams(db), { attempts: {} }, ctx);
    expect(done).toBe(true);
    expect([...db.docs.keys()]).toEqual(["institutions/i/classes/c1"]);
    expect(db.deleted.indexOf("institutions/i/exams/e1")).toBeGreaterThan(
      db.deleted.indexOf("institutions/i/exams/e1/attempts/a3"),
    );
    expect(db.deleted.indexOf("institutions/i/exams/e2")).toBeGreaterThan(
      db.deleted.indexOf("institutions/i/exams/e2/attempts/b1"),
    );
    expect(ctx.stats.deletes).toBe(6);
  });

  it("stops at the budget leaving the parent to be found again, and finishes on the next run", async () => {
    const db = seeded();
    const first = ctxOf(2);
    expect(await drainCollection(db, exams(db), { attempts: {} }, first)).toBe(
      false,
    );
    expect(first.stats.deletes).toBe(2);
    expect(db.docs.has("institutions/i/exams/e1")).toBe(true);
    const second = ctxOf(100);
    expect(await drainCollection(db, exams(db), { attempts: {} }, second)).toBe(
      true,
    );
    expect(db.docs.has("institutions/i/exams/e1")).toBe(false);
    expect(db.docs.has("institutions/i/exams/e2")).toBe(false);
    expect(db.docs.has("institutions/i/classes/c1")).toBe(true);
  });

  it("drains a query on a top-level collection and leaves other institutions alone", async () => {
    const db = new FakeDb();
    db.set("users/u1", { institutionId: "i" });
    db.set("users/u2", { institutionId: "i" });
    db.set("users/u3", { institutionId: "other" });
    const done = await drainCollection(
      db,
      new FakeQuery(db, "users", [["institutionId", "i"]], null, null),
      {},
      ctxOf(100),
    );
    expect(done).toBe(true);
    expect([...db.docs.keys()]).toEqual(["users/u3"]);
  });

  it("is done at once for an empty collection, with one read", async () => {
    const db = new FakeDb();
    const ctx = ctxOf(10);
    expect(
      await drainCollection(
        db,
        new FakeQuery(db, "institutions/i/rubrics", [], null, null),
        {},
        ctx,
      ),
    ).toBe(true);
    expect(ctx.stats).toEqual({ reads: 1, deletes: 0 });
  });
});

describe("counting", () => {
  it("counts a collection and its subcollections without deleting", async () => {
    const db = new FakeDb();
    db.set("institutions/i/exams/e1");
    db.set("institutions/i/exams/e1/attempts/a1");
    db.set("institutions/i/exams/e1/attempts/a2");
    db.set("institutions/i/exams/e2");
    const ctx = { reads: 0, cap: 1000 };
    const result = await countCollection(
      new FakeQuery(db, "institutions/i/exams", [], null, null),
      { attempts: {} },
      "exams",
      ctx,
    );
    expect(result.total).toBe(4);
    expect(result.byPath).toEqual({ exams: 2, "exams/attempts": 2 });
    expect(ctx.reads).toBeGreaterThan(0);
    expect(db.deleted).toEqual([]);
  });

  it("stops with a clear error when the reads would pass the cap", async () => {
    const db = new FakeDb();
    for (let i = 0; i < 5; i += 1) db.set(`institutions/i/exams/e${i}`);
    await expect(
      countCollection(
        new FakeQuery(db, "institutions/i/exams", [], null, null),
        { attempts: {} },
        "exams",
        { reads: 0, cap: 3 },
      ),
    ).rejects.toBeInstanceOf(ReadCapError);
  });
});

describe("the script (source checks)", () => {
  it("only reads unless --live is given, and a real run needs the typed phrase", () => {
    expect(script).toContain("if (!opts.live) {");
    expect(script.indexOf("if (!opts.live) {")).toBeLessThan(
      script.indexOf("await runPhases("),
    );
    expect(script).toContain(
      "confirmationPhrase(counts.documents, institutionId)",
    );
    expect(script).toContain("if (answer !== phrase) {");
    expect(script.indexOf("if (answer !== phrase) {")).toBeLessThan(
      script.indexOf("await runPhases("),
    );
  });

  it("checks the project against the key, prints it, and writes a log without names or emails", () => {
    expect(script).toContain("if (opts.project !== key.project_id)");
    expect(script).toContain("Project id in the key file: ${key.project_id}");
    expect(script).toContain("writeLog(");
    expect(script).not.toMatch(/email|displayName/i);
  });

  it("checks the target and the roster before anything is counted or deleted", () => {
    expect(script.indexOf("checkTarget(")).toBeLessThan(
      script.indexOf("await countEverything("),
    );
    expect(script.indexOf("rosterProblems(")).toBeLessThan(
      script.indexOf("await countEverything("),
    );
    expect(script).toContain("foreignLinkCount(");
  });

  it("removes the directory entry and the Auth accounts first and the institution document last", () => {
    expect(phaseOrder().slice(0, 3)).toEqual(["directory", "auth", "rtdb"]);
    expect(script).toContain(
      "['directory', 'auth', 'rtdb', 'institution'].includes(phase)",
    );
    expect(script).toContain(
      "db.collection('registration_directory').doc(institutionId).delete()",
    );
  });

  it("never calls an unbounded recursive delete and never imports the seed teardown", () => {
    expect(script).not.toContain("recursiveDelete");
    expect(script).not.toMatch(/from '\.\/teardown/);
    expect(script).not.toContain("listCollections");
  });

  it("keeps the Realtime Database counters moving together and removes the session locks", () => {
    expect(script).toContain("counterPlan(");
    expect(script).toContain("usage/total/bytes");
    expect(script).toContain("`sessions/${uid}`");
  });

  it("has a verify mode that cannot be combined with --live", () => {
    expect(script).toContain("if (opts.verify) {");
    expect(script).toContain("Verified: nothing of this institution remains.");
  });
});
