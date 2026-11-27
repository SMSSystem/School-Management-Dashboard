import { describe, expect, it } from "vitest";
import { flat } from "./sourceText";
import previewRaw from "../../scenes/(dashboard)/list/exams/preview/index.tsx?raw";
import previewScreenRaw from "../../components/exam/take/ExamPreviewScreen.tsx?raw";
import previewHookRaw from "../../hooks/useExamPreview.ts?raw";
import actionsRaw from "../../components/exam/ExamRowActions.tsx?raw";
import listRaw from "../../scenes/(dashboard)/list/exams/index.tsx?raw";
import formRaw from "../../components/forms/ExamForm.tsx?raw";
import modalRaw from "../../components/FormModal.tsx?raw";
import routesRaw from "../../routes/academicRoutes.tsx?raw";
import lazyRaw from "../../routes/lazyPages.ts?raw";
import contentRaw from "../examContent.ts?raw";
import examLogicRaw from "../examFormLogic.ts?raw";

// Preview as student and Duplicate (EXAMS_FEATURE_SPEC.md §4.7): source pins for the parts that need Firebase to
// run for real. The logic they use (examTakeLogic, examDuplicate, examAccess) has its own unit tests.

const norm = (s: string) => s.split("\r\n").join("\n");
// The page holds the data and the state; ExamPreviewScreen draws it. Both are the preview.
const preview = norm(previewRaw) + norm(previewScreenRaw);
const previewHook = norm(previewHookRaw);
const actions = norm(actionsRaw);
const list = norm(listRaw);
const form = norm(formRaw);
// The form decides whether it is a duplicate in examFormLogic.ts (examFormMode).
const formAndLogic = form + "\n" + norm(examLogicRaw);
const modal = norm(modalRaw);
const routes = norm(routesRaw);
const lazy = norm(lazyRaw);
const content = norm(contentRaw);

describe("the preview page", () => {
  it("is a lazy staff-only route at /dashboard/list/exams/:examId/preview", () => {
    expect(routes).toContain('path="/dashboard/list/exams/:examId/preview"');
    expect(routes).toMatch(
      /exams\/:examId\/preview"\s+element=\{\s+hasStaffView\(role\) \? \(\s+<ExamPreviewPage \/>/,
    );
    expect(lazy).toContain(
      'ExamPreviewPage: () => import("@/scenes/(dashboard)/list/exams/preview")',
    );
  });

  it("writes nothing and says so", () => {
    expect(preview).not.toMatch(
      /setDoc|updateDoc|addDoc|writeBatch|serverTimestamp/,
    );
    expect(previewHook).not.toMatch(
      /setDoc|updateDoc|addDoc|writeBatch|serverTimestamp/,
    );
    expect(preview).toContain("Preview — nothing is saved.");
  });

  it("reads the questions only, never the answer key, once, after checking access", () => {
    expect(previewHook).toContain("loadExamQuestions(institutionId, examId)");
    expect(previewHook).not.toContain("loadExamContent");
    expect(previewHook).not.toContain("onSnapshot");
    expect(
      previewHook.indexOf("canViewExamContent(loaded, person)"),
    ).toBeLessThan(previewHook.indexOf("loadExamQuestions("));
  });

  it("shows the same question view and navigator a student gets, and keeps answers in the page only", () => {
    expect(preview).toContain("<StudentQuestionView");
    expect(preview).toContain("<QuestionNavigator");
    expect(preview).toContain("useState<Record<string, string[]>>({})");
  });

  it("shuffles only when the exam shuffles", () => {
    expect(previewHook).toContain(
      "previewQuestions(items, exam?.shuffle !== false)",
    );
    expect(preview).toContain("const shuffles = exam.shuffle !== false;");
    expect(preview).toContain("{shuffles && (");
  });
});

describe("loadExamQuestions", () => {
  it("reads only the questions document", () => {
    const from = content.indexOf("export async function loadExamQuestions");
    const body = content.slice(from, content.indexOf("\n}\n", from));
    expect(body).toContain("getDoc(questionsRef(institutionId, examId))");
    expect(body).not.toContain("keyRef");
  });
});

describe("the Exams list buttons", () => {
  it("puts the row buttons of an online exam in front of the edit and delete buttons", () => {
    expect(list).toContain("<ExamRowActions exam={item} touch={touch} />");
    expect(flat(list).indexOf("<ExamRowActions")).toBeLessThan(
      flat(list).indexOf(flat('<FormModal table="exam" type="update"')),
    );
    expect(
      flat(list).indexOf(flat('<FormModal table="exam" type="update"')),
    ).toBeGreaterThan(-1);
  });

  it("shows them only for an online exam the person may open, and the duplicate button only to those who can manage it", () => {
    expect(actions).toContain("if (exam.online !== true) return null");
    expect(actions).toContain(
      "if (!canViewExamContent(exam, person)) return null",
    );
    expect(actions).toContain("manage && canWrite(role) && canDuplicate(exam)");
  });

  it("links to the builder (view only for a spectator) and the preview", () => {
    expect(actions).toContain("`/dashboard/list/exams/${exam.id}/build`");
    expect(actions).toContain("`/dashboard/list/exams/${exam.id}/preview`");
    expect(actions).toContain('manage ? "Build questions" : "View questions"');
  });

  it("opens the create form filled in from the exam, with a copy icon", () => {
    expect(actions).toContain(
      "duplicateDefaults(exam as unknown as Record<string, unknown> & { id: string })",
    );
    expect(actions).toContain('triggerIcon="copy"');
    expect(modal).toContain("look.triggerLabel ??");
    expect(flat(modal)).toContain(flat('look.triggerIcon === "copy" && <Copy'));
  });
});

describe("the exam form when duplicating", () => {
  it("starts from the copied values and opens as a create", () => {
    expect(formAndLogic).toContain(
      'typeof data?.duplicateOf === "string" ? data.duplicateOf : undefined',
    );
    expect(formAndLogic).toContain(
      "const prefill = saved ?? (duplicateOf ? (data as Record<string, unknown>) : undefined)",
    );
    expect(formAndLogic).toContain(
      "prefill ? onlineValuesFromExam(prefill) : newOnlineDefaults()",
    );
    expect(form).toContain('duplicateOf ? "Duplicate exam"');
  });

  it("copies the questions only after the new exam has been committed, in a second step", () => {
    // saveExam (ExamForm.tsx) commits the batch and hands back the new exam; the form copies onto it only after that.
    expect(
      form.indexOf("await batch.commit();\n    return newExamRef;"),
    ).toBeGreaterThan(-1);
    const saved = form.indexOf("const newExamRef = await saveExam({");
    expect(saved).toBeGreaterThan(-1);
    expect(
      form.indexOf("if (duplicateOf && newExamRef) {", saved),
    ).toBeGreaterThan(saved);
    expect(form).toContain("copyQuestions({ examId: newExamRef.id,");
    expect(form).toContain("await copyExamContent({");
  });

  it("retries only the copy, never creates a second exam, when the copy failed", () => {
    expect(form).toContain(
      "if (retryCopy.current) {\n      await copyQuestions(retryCopy.current);\n      return;\n    }",
    );
    expect(form).toContain(
      "The exam was created, but its questions could not be copied",
    );
    expect(form.indexOf("if (retryCopy.current)")).toBeLessThan(
      form.indexOf("getDocs("),
    );
  });

  it("copies nothing for a plain exam or an edit", () => {
    expect(formAndLogic).toContain(
      'type === "create" && typeof data?.duplicateOf === "string"',
    );
    expect(form).toContain('const newExamRef = type === "create" ? doc(');
  });
});
