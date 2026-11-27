// Guards for the Schedule redesign's reads and cache refresh (spec §5): the query each staff view makes, that it stays
// out of the persisted cache, that FormModal refreshes both slot caches after an edit, and that useClassTimetable's
// term override leaves the dashboards' query alone.
import { describe, expect, it } from "vitest";
import weekTimetableSrc from "../../hooks/useWeekTimetable.ts?raw";
import classTimetableSrc from "../../hooks/useClassTimetable.ts?raw";
import formModalSrc from "../../components/FormModal.tsx?raw";
import { isPersistableQueryKey } from "../queryPersistence";
import { flat } from "./sourceText";

describe("useWeekTimetable", () => {
  const src = flat(weekTimetableSrc);

  it("reads one class or one teacher for the week's terms, once, cached", () => {
    expect(src).toContain(
      flat(
        "queryKey: ['scheduleSlots', institutionId, of?.by ?? '', of?.id ?? '', ids.join(',')]",
      ),
    );
    expect(src).toContain(
      flat("const field = of.by === 'teacher' ? 'teacherId' : 'classId';"),
    );
    expect(src).toContain(flat("where(field, '==', of.id)"));
    expect(src).toContain(flat("where('termId', 'in', chunk)"));
    expect(src).toContain("staleTime: REFERENCE_STALE_MS");
    expect(src).not.toContain("onSnapshot");
  });

  it("is never persisted (slots carry teacher names)", () => {
    expect(
      isPersistableQueryKey(["scheduleSlots", "inst-1", "class", "c1", "t1"]),
    ).toBe(false);
  });
});

describe("FormModal", () => {
  it("refreshes both slot caches after a timetable slot is saved or deleted", () => {
    const src = flat(formModalSrc);
    expect(src).toContain(
      flat(`if (table === "timetable_slot") {
      queryClient.invalidateQueries({ queryKey: ["scheduleSlots", institutionId] });
      queryClient.invalidateQueries({ queryKey: ["nextClassSlots", institutionId] });
    }`),
    );
  });
});

describe("useClassTimetable", () => {
  it("reads the override terms when given, and the active terms otherwise", () => {
    const src = flat(classTimetableSrc);
    expect(src).toContain("termIdsOverride?: string[]");
    expect(src).toContain(
      flat("if (overrideKey === null) return activeTermList.map((t) => t.id);"),
    );
    expect(src).toContain(
      flat(
        "const termIds = useMemo(() => termIdsToRead(overrideKey, terms), [terms, overrideKey]);",
      ),
    );
    expect(src).toContain(
      flat(
        "queryKey: ['nextClassSlots', institutionId, classId, termIds.join(',')]",
      ),
    );
  });
});
