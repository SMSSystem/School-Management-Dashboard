import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ExtraClassesField from "../../components/forms/ExtraClassesField";
import ClassSearchPicker from "../../components/forms/ClassSearchPicker";
import pickerRaw from "../../components/forms/ClassSearchPicker.tsx?raw";

// The field reads the subjects through the Firebase-backed cache; the markup needs none of it.
vi.mock("@/hooks/useInstitutionSubjects", () => ({
  fetchInstitutionSubjects: () => Promise.resolve([]),
}));
vi.mock("@/lib/reportError", () => ({ onLoadError: () => () => undefined }));

// "Additional classes" on Create Account and Edit Student: a search box that suggests classes as you type, so the form
// no longer grows by one box per class in the school. Only the chosen classes take room, each with its subject choice.

const classes = Array.from({ length: 30 }, (_, i) => ({
  id: `c${i}`,
  name: `Grade ${i + 1}A`,
}));
const field = (
  extraClassIds: string[],
  classSubjects: Record<string, string[]> = {},
  homeClassId = "c0",
) =>
  renderToStaticMarkup(
    createElement(ExtraClassesField, {
      institutionId: "",
      classes,
      homeClassId,
      value: { extraClassIds, classSubjects },
      onChange: vi.fn(),
    }),
  );

describe("the Additional classes field", () => {
  it("shows a search box instead of one checkbox per class", () => {
    const out = field([]);
    expect(out).toContain('role="combobox"');
    expect(out).toContain('aria-label="Add an additional class"');
    expect(out).not.toContain('type="checkbox"');
    expect(out).not.toContain("Grade 5A"); // the list stays closed until the box is used
  });

  it("shows only the chosen classes, each with a Remove button and its subject choice", () => {
    const out = field(["c3", "c7"], { c7: [] });
    expect(out).toContain("Grade 4A");
    expect(out).toContain("Grade 8A");
    expect(out).toContain('aria-label="Remove Grade 4A"');
    expect(out).toContain('aria-label="Subjects in Grade 8A"');
    expect(out).not.toContain("Grade 6A");
  });

  it("asks for a home class first, and says when there is no other class", () => {
    expect(field([], {}, "")).toContain("Choose a class above first.");
    expect(field([], {}, "")).not.toContain('role="combobox"');
    const only = renderToStaticMarkup(
      createElement(ExtraClassesField, {
        institutionId: "",
        classes: [classes[0]],
        homeClassId: "c0",
        value: { extraClassIds: [], classSubjects: {} },
        onChange: vi.fn(),
      }),
    );
    expect(only).toContain("There are no other classes.");
  });
});

describe("the class search box", () => {
  it("is a labelled combobox whose list closes on a pick, Escape or a click elsewhere", () => {
    const out = renderToStaticMarkup(
      createElement(ClassSearchPicker, {
        label: "Add",
        options: classes,
        onPick: vi.fn(),
      }),
    );
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('aria-autocomplete="list"');
    const raw = pickerRaw.split("\r\n").join("\n");
    expect(raw).toContain('if (e.key === "Escape")');
    expect(raw).toContain('document.addEventListener("mousedown", onDown);');
    expect(raw).toContain("max-h-60 w-full overflow-y-auto");
    // Enter picks a suggestion and never submits the form around it.
    expect(raw).toMatch(
      /e\.key === "Enter"\) \{\s*\/\/[^\n]*\n\s*e\.preventDefault\(\);/,
    );
  });
});
