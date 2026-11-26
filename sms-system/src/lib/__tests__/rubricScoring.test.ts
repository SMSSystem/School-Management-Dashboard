import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RubricScorePicker } from "../../scenes/(dashboard)/list/assignments/[id]/RubricScorePicker";
import gradingRaw from "../grading.ts?raw";
import rulesRaw from "../../../firestore.rules?raw";
import dialogRaw from "../../scenes/(dashboard)/list/assignments/[id]/GradeDialog.tsx?raw";
import sectionRaw from "../../scenes/(dashboard)/list/assignments/[id]/RubricSection.tsx?raw";
import pageRaw from "../../scenes/(dashboard)/list/assignments/[id]/index.tsx?raw";
import {
  isAwarded,
  isCapped,
  levelPoints,
  partialScoreError,
  picksFromSaved,
  rubricFill,
  rubricMax,
  scaleToColumn,
  scoresToSave,
  scoreState,
  scoreTotal,
} from "../rubricScoring";
import { flat } from "./sourceText";

// Scoring a submission with its assignment's rubric (RUBRICS_UPLOAD_SPEC.md section 6.14).

const criteria = [
  {
    id: "c1",
    name: "Content",
    maxPoints: 4,
    levels: [
      { label: "Excellent", points: 4 },
      { label: "Fair", points: 2 },
    ],
  },
  {
    id: "c2",
    name: "Style",
    maxPoints: 6,
    levels: [
      { label: "Strong", points: 8 },
      { label: "Weak", points: 1 },
    ],
  },
  { id: "c3", name: "Sources", maxPoints: 10, levels: [] },
];

describe("level points", () => {
  it("caps a level at its criterion's max, and says so", () => {
    expect(levelPoints(criteria[1].levels[0], criteria[1])).toBe(6);
    expect(isCapped(criteria[1].levels[0], criteria[1])).toBe(true);
    expect(levelPoints(criteria[0].levels[1], criteria[0])).toBe(2);
    expect(isCapped(criteria[0].levels[1], criteria[0])).toBe(false);
    expect(levelPoints({ label: "x", points: -3 }, criteria[0])).toBe(0);
  });
});

describe("totals and state", () => {
  const full = {
    c1: { points: 4, level: "Excellent" },
    c2: { points: 6, level: "Strong" },
    c3: { points: 7.5 },
  };

  it("adds the max points and the picks, ignoring picks for criteria not in the grid", () => {
    expect(rubricMax(criteria)).toBe(20);
    expect(scoreTotal(criteria, full)).toBe(17.5);
    expect(scoreTotal(criteria, { ...full, gone: { points: 99 } })).toBe(17.5);
    expect(
      scoreTotal(criteria, { c1: { points: 0.1 }, c3: { points: 0.2 } }),
    ).toBe(0.3);
  });

  it("is none, partial or complete; points out of range count as still to score", () => {
    expect(scoreState(criteria, {})).toEqual({ kind: "none" });
    expect(scoreState(criteria, { gone: { points: 1 } })).toEqual({
      kind: "none",
    });
    expect(scoreState(criteria, { c1: full.c1 })).toEqual({
      kind: "partial",
      missing: ["Style", "Sources"],
    });
    expect(scoreState(criteria, full)).toEqual({ kind: "complete" });
    expect(scoreState(criteria, { ...full, c3: { points: 11 } })).toEqual({
      kind: "partial",
      missing: ["Sources"],
    });
    expect(
      scoreState(criteria, { ...full, c3: { points: Number.NaN } }).kind,
    ).toBe("partial");
  });

  it("names at most three criteria still to score", () => {
    expect(partialScoreError(["A", "B", "C", "D", "E"])).toBe(
      "Score every rubric criterion, or clear the rubric scores. Still to score: A, B, C and 2 more.",
    );
  });
});

describe("filling the score", () => {
  it("scales to the gradebook column, to one decimal place", () => {
    expect(scaleToColumn(15, 20, 100)).toBe(75);
    expect(scaleToColumn(1, 3, 10)).toBe(3.3);
    expect(scaleToColumn(5, 0, 100)).toBe(0);
  });

  it("puts the total out of the rubric's max, or scaled to the column, in Score and Max Score", () => {
    const picks = { c1: { points: 4 }, c2: { points: 6 }, c3: { points: 5 } };
    expect(rubricFill(criteria, picks, null)).toEqual({
      score: "15",
      maxScore: "20",
    });
    expect(rubricFill(criteria, picks, 100)).toEqual({
      score: "75",
      maxScore: "100",
    });
  });
});

describe("saving and reading back", () => {
  it("saves the picks in the grid's order, with the level when one was picked", () => {
    expect(
      scoresToSave(criteria, {
        c3: { points: 5 },
        c1: { points: 2, level: "Fair" },
        gone: { points: 1 },
      }),
    ).toEqual([
      { criterionId: "c1", points: 2, level: "Fair" },
      { criterionId: "c3", points: 5 },
    ]);
  });

  it("reads saved scores back as picks", () => {
    expect(
      picksFromSaved(criteria, [
        { criterionId: "c1", points: 2, level: "Fair" },
        { criterionId: "c3", points: 5 },
        { criterionId: "gone", points: 1 },
      ]),
    ).toEqual({ c1: { points: 2, level: "Fair" }, c3: { points: 5 } });
    expect(picksFromSaved(criteria, undefined)).toEqual({});
  });

  it("marks the awarded level by its label, or by its points when the score has none", () => {
    const [excellent, fair] = criteria[0].levels;
    const byLabel = { criterionId: "c1", points: 4, level: "Excellent" };
    expect(isAwarded(excellent, criteria[0], byLabel)).toBe(true);
    expect(isAwarded(fair, criteria[0], byLabel)).toBe(false);
    expect(isAwarded(fair, criteria[0], { criterionId: "c1", points: 2 })).toBe(
      true,
    );
    expect(isAwarded(fair, criteria[0], undefined)).toBe(false);
  });
});

describe("the Grade dialog's picker", () => {
  it("shows each level's description, the cap note, and the picked level as pressed", () => {
    const html = renderToStaticMarkup(
      createElement(RubricScorePicker, {
        criteria: [
          {
            ...criteria[1],
            levels: [
              { label: "Strong", points: 8, description: "Clear and varied" },
              criteria[1].levels[1],
            ],
          },
        ],
        picks: { c2: { points: 6, level: "Strong" } },
        onChange: () => {},
        disabled: false,
      }),
    );
    expect(html).toContain("Clear and varied");
    expect(html).toContain("Counts as the criterion&#x27;s max, not 8");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Strong/);
    expect(html).not.toContain("title=");
  });
});

describe("the wiring", () => {
  it("writes the scores with the grade, or removes them, and removes cleared feedback", () => {
    const src = flat(gradingRaw);
    expect(src).toContain(
      flat("feedback: feedback ? feedback : deleteField(),"),
    );
    expect(src).toContain(
      flat(
        "{ rubricScores: scoring.scores, rubricTotal: scoring.total, rubricMax: scoring.max }",
      ),
    );
    expect(src).toContain(
      flat(
        "{ rubricScores: deleteField(), rubricTotal: deleteField(), rubricMax: deleteField() }",
      ),
    );
    expect(src).toContain(
      flat("...feedbackAndRubricFields(feedback, rubricScoring),"),
    );
    expect(src).not.toContain(flat("...(feedback ? { feedback } : {}),"));
    // Left alone when no grid was shown, so a grade saved before the grid loaded keeps the saved scores.
    expect(src).toContain(flat("scoring === undefined ? {} : scoring ?"));
  });

  it("lets only a grader write them, checked by validRubricScores", () => {
    const rules = flat(rulesRaw);
    expect(rules).toContain(
      flat(
        "'grade','maxGrade','feedback','gradedBy','gradedByName','gradedAt','status', 'rubricScores','rubricTotal','rubricMax'",
      ),
    );
    expect(rules).toContain(
      flat("&& validRubricScores(request.resource.data);"),
    );
  });

  it("checks the picks on save and sends them to gradeSubmission", () => {
    const page = flat(pageRaw);
    expect(page).toContain(flat("const checked = gradeToSave("));
    expect(page).toContain(flat("rubricScoring,\n      });"));
    expect(page).toContain(flat("setRubricPicks(null);"));
    expect(page).toContain(
      flat(
        "effectivePicks(rubricPicks, criteria, submissionsByStudent[gradingTarget.uid])",
      ),
    );
    // A pick clears the error about the last picks.
    expect(page).toContain(
      flat("setRubricPicks(picks); setGradingError(null);"),
    );
    expect(page).toContain(flat("setRubricPicks={pickRubric}"));
  });

  it("disables Save Grade while offline, keeping the picks", () => {
    const dialog = flat(dialogRaw);
    expect(dialog).toContain(flat("const offline = useOffline();"));
    expect(dialog).toContain(flat("disabled={gradingLoading || offline}"));
    expect(dialogRaw).toContain(
      "You're offline. Your picks stay here; save when you're back online.",
    );
  });

  it("shows the scores to students and parents only, inside the fold", () => {
    const section = flat(sectionRaw);
    expect(section).toContain(
      flat("scored={scoredSubmission(submission, foldable)}"),
    );
    expect(section).toContain(flat("scores={scored?.rubricScores}"));
    expect(flat(pageRaw)).toContain(
      flat('submission={role === "parent" ? childSubmission : mySubmission}'),
    );
  });
});
