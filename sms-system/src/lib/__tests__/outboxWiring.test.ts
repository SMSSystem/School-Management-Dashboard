import { describe, expect, it } from "vitest";
import authSrc from "../AuthContext.tsx?raw";
import hookSrc from "../../hooks/useRegisterOutbox.ts?raw";
import menuSrc from "../../components/Menu.tsx?raw";
import senderHookSrc from "../../hooks/useOutboxSender.ts?raw";
import senderSrc from "../offline/outboxSender.ts?raw";
import generalPage from "../../scenes/(dashboard)/attendance/general/index.tsx?raw";
import generalSave from "../../scenes/(dashboard)/attendance/general/saveSession.ts?raw";
import subjectPage from "../../scenes/(dashboard)/attendance/subject/index.tsx?raw";
import subjectSave from "../../scenes/(dashboard)/attendance/subject/saveDate.ts?raw";
import headerSrc from "../../components/TopHeader.tsx?raw";
import headerOutboxSrc from "../../components/attendance/HeaderOutbox.tsx?raw";
import traySrc from "../../components/attendance/OutboxTray.tsx?raw";
import bannerSrc from "../../components/ConnectionBanner.tsx?raw";
import panelSrc from "../../components/attendance/OutboxPanel.tsx?raw";
import expirySrc from "../../components/attendance/OutboxExpiryDialog.tsx?raw";
import offlineStoreSrc from "../offline/offlineStore.ts?raw";
import purgeSrc from "../sessionPurge.ts?raw";
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

  it("wakes the sender when a person's key arrives after it started (a fresh sign-in)", () => {
    expect(flat(senderSrc)).toContain(
      flat("onOfflineSession(() => void wakeOutbox());"),
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

  it("loads the tray of unsent work on demand in the header, for staff who work offline (slice C2)", () => {
    expect(flat(headerSrc)).toContain(flat("<HeaderOutbox"));
    expect(flat(headerOutboxSrc)).toContain(
      flat(
        'const OutboxTray = lazy(() => import("@/components/attendance/OutboxTray"));',
      ),
    );
    expect(flat(headerOutboxSrc)).toContain(
      flat("if (!worksOffline(role)) return null;"),
    );
    for (const src of [headerSrc, headerOutboxSrc])
      expect(src).not.toMatch(/from "@\/lib\/offline\/outbox(Sender|Store)"/);
  });

  it("sends only where the switch is on: before the sender starts, a wake sends nothing", () => {
    expect(flat(senderSrc)).toContain(
      flat("if (sendingOn && online) await withSenderLock(sendDue);"),
    );
  });

  it("draws the tray's dialogs at the page's top level, above the connection banner", () => {
    expect(flat(traySrc)).toContain(flat("createPortal(<>"));
    expect(flat(traySrc)).toContain(flat("document.body"));
    expect(bannerSrc).toContain("fixed bottom-0 inset-x-0 z-40");
  });

  it("never lets a tray that fails to load take the app down: the header is outside every page's boundary", () => {
    expect(flat(headerOutboxSrc)).toContain(
      flat("return this.state.failed ? null : this.props.children;"),
    );
    expect(flat(headerOutboxSrc)).toContain(flat("<QuietBoundary><Suspense"));
  });

  it("asks a second click before discarding an unsent save, in the tray and the expiry dialog", () => {
    expect(flat(panelSrc)).toContain(
      flat('{asking ? "Discard for good?" : "Discard"}'),
    );
    for (const src of [panelSrc, expirySrc]) {
      expect(flat(src)).toContain(flat("<ConfirmDiscardButton item={item} />"));
      expect(flat(src)).not.toContain(
        flat("onClick={() => void discardItem(item)}"),
      );
    }
  });

  it("tidies abandoned rows and tells the person once per sign-in", () => {
    expect(flat(traySrc)).toContain(flat("void dropAbandoned();"));
    expect(flat(offlineStoreSrc)).toContain(
      flat("sessionStorage.removeItem(OUTBOX_SIGNIN_NOTED_KEY);"),
    );
  });

  it("never deletes the outbox at sign-out", () => {
    for (const src of [offlineStoreSrc, purgeSrc])
      expect(src).not.toContain('"sms_outbox"');
  });
});
