// The Schedule page's tour (spec §7, redesign PR C). A step whose target has gone shows its spotlight in the wrong
// place and nothing else would notice, so every target is pinned to the page's source, along with the role filter
// and the rule that the button is offered only once the timetable is drawn (when every spotlighted target exists).
import { describe, expect, it } from "vitest";
import type { Role } from "@/types/people";
import { scheduleTourSteps } from "../scheduleTourSteps";
import tourStepsRaw from "../useTourSteps.ts?raw";
import pageRaw from "../../scenes/(dashboard)/schedule/index.tsx?raw";
import toolbarRaw from "../../scenes/(dashboard)/schedule/ScheduleToolbar.tsx?raw";
import delegateRaw from "../../scenes/(dashboard)/schedule/DelegateAccessPanel.tsx?raw";
import { flat } from "./sourceText";

const ROLES: Role[] = [
  "institution_admin",
  "spectator",
  "senior_teacher",
  "regular_teacher",
  "student",
  "parent",
];
const sources = flat(pageRaw + toolbarRaw + delegateRaw);
const selectors = (role: Role) =>
  scheduleTourSteps(role)
    .map((s) => s.selector)
    .filter(Boolean) as string[];
const titles = (role: Role) => scheduleTourSteps(role).map((s) => s.title);

describe("the schedule tour", () => {
  it("is registered, and started only by the page's own button", () => {
    expect(flat(tourStepsRaw)).toContain(
      flat("{ tour: 'schedule', steps: scheduleTourSteps(role) }"),
    );
    expect(flat(pageRaw)).toContain(flat('startNextStep("schedule")'));
    expect(flat(pageRaw)).toContain(flat("collapseForTour();"));
  });

  it("is offered only once the timetable is drawn", () => {
    expect(flat(pageRaw)).toContain(flat("{showTour && <TourButton />}"));
    expect(flat(pageRaw)).toContain(flat("showTour={!empty}"));
  });

  it.each(ROLES)("targets only ids on the page, for %s", (role) => {
    for (const selector of selectors(role))
      expect(sources).toContain(`id="${selector.slice(1)}"`);
  });

  it("never routes away or waits on an action", () => {
    for (const role of ROLES) {
      for (const s of scheduleTourSteps(role)) {
        expect(s.nextRoute).toBeUndefined();
        expect(s.prevRoute).toBeUndefined();
      }
    }
  });
});

describe("the steps each role sees", () => {
  it("shows the class or teacher choice to admin, spectator and senior teacher only", () => {
    for (const role of ROLES) {
      const has = selectors(role).includes("#tour-schedule-choose");
      expect(has, role).toBe(
        ["institution_admin", "spectator", "senior_teacher"].includes(role),
      );
    }
  });

  it("explains the child chips to a parent only, as a centred step", () => {
    for (const role of ROLES)
      expect(titles(role).includes("Your children"), role).toBe(
        role === "parent",
      );
    const children = scheduleTourSteps("parent").find(
      (s) => s.title === "Your children",
    )!;
    expect(children.selector).toBeUndefined();
  });

  it("covers editing for admin (spotlit) and senior teacher (centred, it depends on access)", () => {
    const edit = (role: Role) =>
      scheduleTourSteps(role).find(
        (s) => s.title === "Adding and changing lessons",
      );
    expect(edit("institution_admin")?.selector).toBe("#tour-schedule-add");
    expect(edit("senior_teacher")).toBeDefined();
    expect(edit("senior_teacher")?.selector).toBeUndefined();
    for (const role of [
      "spectator",
      "regular_teacher",
      "student",
      "parent",
    ] as Role[])
      expect(edit(role), role).toBeUndefined();
  });

  it("shows the Delegate panel step to the admin only", () => {
    for (const role of ROLES)
      expect(selectors(role).includes("#tour-schedule-delegate"), role).toBe(
        role === "institution_admin",
      );
  });

  it("mentions the Clash tag to staff only (D10)", () => {
    for (const role of ROLES) {
      const text = scheduleTourSteps(role)
        .map((s) => String(s.content))
        .join(" ");
      expect(text.includes("Clash"), role).toBe(
        !["student", "parent"].includes(role),
      );
    }
  });

  it("gives every role the heading, the week controls and the timetable", () => {
    for (const role of ROLES) {
      expect(selectors(role)).toEqual(
        expect.arrayContaining([
          "#tour-schedule-heading",
          "#tour-schedule-week-nav",
          "#tour-schedule-timetable",
        ]),
      );
    }
  });
});
