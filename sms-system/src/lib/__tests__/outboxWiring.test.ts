import { describe, expect, it } from "vitest";
import authSrc from "../AuthContext.tsx?raw";
import hookSrc from "../../hooks/useRegisterOutbox.ts?raw";
import menuSrc from "../../components/Menu.tsx?raw";
import senderHookSrc from "../../hooks/useOutboxSender.ts?raw";
import generalPage from "../../scenes/(dashboard)/attendance/general/index.tsx?raw";
import generalSave from "../../scenes/(dashboard)/attendance/general/saveSession.ts?raw";
import subjectPage from "../../scenes/(dashboard)/attendance/subject/index.tsx?raw";
import subjectSave from "../../scenes/(dashboard)/attendance/subject/saveDate.ts?raw";
import { flat } from "./sourceText";

// The outbox's wiring (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C): it is on only where a super admin
// set offlineOutbox on the institution, both register pages save through it then, and it sends from any page.

describe("outbox wiring", () => {
  it("is on only where the institution document says so, for staff who work offline", () => {
    expect(flat(authSrc)).toContain(
      flat("offlineOutbox: d.offlineOutbox === true"),
    );
    expect(flat(senderHookSrc)).toContain(
      flat("return worksOffline(role) && institution?.offlineOutbox === true;"),
    );
    expect(flat(hookSrc)).toContain(
      flat("const enabled = useOutboxEnabled();"),
    );
  });

  it("both register pages queue their saves when it is on, and write directly as before when it is off", () => {
    expect(flat(generalPage)).toContain(
      flat("const outcome = await saveSession({"),
    );
    expect(flat(generalSave)).toContain(flat("await writeRegisterDoc(p);"));
    expect(flat(subjectPage)).toContain(
      flat("const outcome = await saveDate({"),
    );
    expect(flat(subjectSave)).toContain(flat("await saveSubjectRegister(p);"));
    for (const save of [generalSave, subjectSave]) {
      expect(flat(save)).toContain(flat("if (p.outbox.enabled) {"));
    }
  });

  it("keeps a page's draft until its queued save is sent, and sends one audit entry per session", () => {
    expect(flat(generalPage)).toContain(
      flat("if (outcome === 'queued') return outcome;"),
    );
    expect(flat(generalPage)).toContain(
      flat("if (!outbox.enabled) { await logSaveAllAudit({"),
    );
    expect(flat(subjectPage)).toContain(
      flat('if (outcome === "saved") clearSubjectDraft('),
    );
  });

  it("starts the sender from the sidebar, loaded on demand", () => {
    expect(flat(menuSrc)).toContain(flat("useOutboxSender();"));
    expect(flat(senderHookSrc)).toContain(
      flat(
        'if (enabled) void import("@/lib/offline/outboxSender").then((m) => m.startOutboxSender());',
      ),
    );
  });
});
