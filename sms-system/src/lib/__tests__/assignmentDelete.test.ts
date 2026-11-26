import { describe, expect, it } from "vitest";
import { assignmentDeleteWarning } from "../assignmentDeleteLogic";
import { assignmentDeleteDetail } from "../teacherAudit";
import cascadeRaw from "../assignmentDelete.ts?raw";
import deleteRecordRaw from "../deleteRecord.ts?raw";
import { formModalSource } from "./formModalSource";

// Deleting an assignment takes its students' submissions, their attempts and the submission tombstones with it, and
// keeps the grades (results). The behaviour against the rules is in rules-tests/assignmentDeleteClient.rules.test.ts.

const norm = (s: string) => s.split("\r\n").join("\n");
const cascade = norm(cascadeRaw);
const deleteRecord = norm(deleteRecordRaw);

describe("the confirmation", () => {
  it("says how many submissions go and how many grades stay", () => {
    expect(assignmentDeleteWarning({ submissions: 3, results: 2 })).toBe(
      "3 students' submissions, with every attempt and file, will be deleted too. 2 grades already given stay in Results and the gradebook.",
    );
    expect(assignmentDeleteWarning({ submissions: 1, results: 1 })).toBe(
      "1 student's submission, with every attempt and file, will be deleted too. 1 grade already given stays in Results and the gradebook.",
    );
  });

  it("says when nothing was submitted, and is silent about grades when there are none", () => {
    expect(assignmentDeleteWarning({ submissions: 0, results: 0 })).toBe(
      "No student has submitted work for it.",
    );
  });
});

describe("the audit entry", () => {
  it("names the assignment, its class and subject and the number of submissions, never a student", () => {
    expect(
      assignmentDeleteDetail({
        title: "Essay",
        className: "Grade 7A",
        subjectName: "English",
        submissions: 2,
      }),
    ).toBe(
      "Deleted assignment Essay for Grade 7A, English, with 2 submissions",
    );
    expect(assignmentDeleteDetail({ title: "", submissions: 1 })).toBe(
      "Deleted assignment (untitled), with 1 submission",
    );
  });
});

describe("deleteAssignmentCascade", () => {
  const body = cascade.slice(
    cascade.indexOf("export async function deleteAssignmentCascade"),
  );

  it("deletes the attempts, submissions and tombstones in batches first, then the assignment with its audit entry, then the large file", () => {
    const batches = body.indexOf("for (const group of chunkOperations(refs))");
    const last = body.indexOf("last.delete(assignmentRef);");
    const audit = body.indexOf('eventType: "assignment_delete"');
    const commit = body.indexOf("await last.commit();");
    const blob = body.indexOf("void deleteBlob(");
    expect(batches).toBeGreaterThan(-1);
    expect(last).toBeGreaterThan(batches);
    expect(audit).toBeGreaterThan(last);
    expect(commit).toBeGreaterThan(audit);
    expect(blob).toBeGreaterThan(commit);
  });

  it("clears leftovers even when the assignment is already gone, so a failed delete can be finished", () => {
    expect(body.indexOf("if (!snap.exists()) return;")).toBeGreaterThan(
      body.indexOf("await batch.commit();"),
    );
  });

  it("reads every attempt of every submission, and the tombstones", () => {
    expect(body).toContain('getDocs(collection(s.ref, "attempts"))');
    expect(cascade).toContain('"submissionTombstones"');
  });

  it("never touches the grades: results are only counted for the confirmation", () => {
    expect(body).not.toMatch(/results/);
    const preflight = cascade.slice(
      cascade.indexOf("export async function loadAssignmentDeletePreflight"),
      cascade.indexOf("export async function deleteAssignmentCascade"),
    );
    // Compared with whitespace removed, so formatting can't hide or fake it.
    expect(preflight.replace(/\s+/g, "")).toContain(
      'getCountFromServer(query(institutionCollection(institutionId,"results"),where("assignmentId","==",assignmentId),),)',
    );
  });
});

describe("the delete path and the dialog", () => {
  it("sends the assignment to the cascade, with the person deleting it", () => {
    expect(deleteRecord).toContain(
      "await deleteAssignmentCascade({ institutionId, assignmentId: id, actor });",
    );
    expect(deleteRecord).not.toContain("existingAssignmentBlobKey");
  });

  it("shows the counts in the delete dialog", () => {
    expect(norm(formModalSource)).toContain(
      '<AssignmentDeleteNotice table={table} institutionId={institutionId} assignmentId={String(id)} />',
    );
  });
});

describe("the frozen rubric grid", () => {
  it("is deleted with the assignment's other documents, before the assignment", () => {
    const body = cascade.slice(cascade.indexOf("export async function deleteAssignmentCascade"));
    const frozen = body.indexOf('"rubric",');
    expect(frozen).toBeGreaterThan(-1);
    expect(frozen).toBeLessThan(body.indexOf("for (const group of chunkOperations(refs))"));
  });
});
