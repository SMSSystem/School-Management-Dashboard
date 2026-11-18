import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { flat } from "./sourceText";
import {
  BackButton,
  WizardStepNav,
} from "../../scenes/(dashboard)/academic-calendar/WizardStepNav";
import {
  InfoState,
  Spinner,
} from "../../components/attendance/RegisterNotices";
import wizardStepsRaw from "../../scenes/(dashboard)/academic-calendar/WizardSteps.tsx?raw";
import generalPageRaw from "../../scenes/(dashboard)/attendance/general/index.tsx?raw";
import subjectPageRaw from "../../scenes/(dashboard)/attendance/subject/index.tsx?raw";
import generalGridRaw from "../../scenes/(dashboard)/attendance/general/RegisterGrid.tsx?raw";

// The Academic Year wizard's Back and Next buttons were written out in each of its steps (the Back button five
// times), and the General and Subject register pages each had their own identical copy of the spinner and the
// one-line notice. The academic calendar has already been set up for every QA institution, so the wizard cannot be
// opened in a browser; these compare the shared pieces with the markup the earlier code produced.

const lf = (s: string) =>
  s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const BACK =
  '<button id="tour-academic-calendar-wizard-back" type="button" class="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">← Back</button>';
const NEXT =
  '<button id="tour-academic-calendar-wizard-next" type="button" class="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">Next →</button>';

describe("the wizard step buttons", () => {
  it("Back and Next are the markup each step used to write out", () => {
    expect(
      renderToStaticMarkup(
        createElement(WizardStepNav, { onBack: vi.fn(), onNext: vi.fn() }),
      ),
    ).toBe(`<div class="mt-6 flex gap-3">${BACK}${NEXT}</div>`);
  });

  it("the last step's Back button alone is the same Back button", () => {
    expect(
      renderToStaticMarkup(createElement(BackButton, { onClick: vi.fn() })),
    ).toBe(BACK);
  });

  it("the steps use them, each going back one step and forward to the next handler", () => {
    const steps = lf(wizardStepsRaw);
    for (const [back, next] of [
      [1, "goToStep3"],
      [2, "goToStep4"],
      [3, "goToStep5"],
      [4, "goToStep6"],
    ] as const) {
      expect(steps).toContain(
        `<WizardStepNav onBack={() => setStep(${back})} onNext={${next}} />`,
      );
    }
    expect(steps).toContain("<BackButton onClick={() => setStep(5)} />");
    expect(steps).not.toContain("tour-academic-calendar-wizard-back");
    // the first step has no Back, so its lone Next button (with its own top margin) stays where it is
    expect(
      (steps.match(/tour-academic-calendar-wizard-next/g) ?? []).length,
    ).toBe(1);
  });
});

describe("the register pages' two states", () => {
  it("render what both pages used to define for themselves", () => {
    expect(renderToStaticMarkup(createElement(Spinner))).toBe(
      '<div class="flex items-center justify-center h-40"><div class="h-8 w-8 rounded-full border-4 border-sky-500 border-t-transparent animate-spin"></div></div>',
    );
    expect(
      renderToStaticMarkup(createElement(InfoState, { message: "No term" })),
    ).toBe(
      '<div class="p-6"><p class="text-sm text-gray-500 dark:text-gray-400">No term</p></div>',
    );
  });

  it("the General and Subject registers import them from the one file", () => {
    for (const raw of [generalPageRaw, subjectPageRaw])
      expect(flat(raw)).toContain(
        flat("from '@/components/attendance/RegisterNotices';"),
      );
    expect(lf(generalGridRaw)).toContain(
      "from '@/components/attendance/RegisterNotices';",
    );
    expect(
      Object.keys(
        import.meta.glob(
          "../../scenes/(dashboard)/attendance/*/RegisterNotices.tsx",
        ),
      ),
    ).toEqual([]);
  });
});
