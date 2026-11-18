import { describe, expect, it } from "vitest";
import { loginLinkState, toMillis } from "../loginLinkStatus";
import buttonRaw from "../../components/SendLoginEmailButton.tsx?raw";
import badgeRaw from "../../components/LoginLinkBadge.tsx?raw";
import studentsRaw from "../../scenes/(dashboard)/list/students/index.tsx?raw";
import teachersRaw from "../../scenes/(dashboard)/list/teachers/index.tsx?raw";
import spectatorsRaw from "../../scenes/(dashboard)/list/spectators/index.tsx?raw";
import parentsRaw from "../../scenes/(dashboard)/list/parents/index.tsx?raw";
import personCellRaw from "../../components/PersonListParts.tsx?raw";
import auditRaw from "../auditEvents.ts?raw";
import rulesRaw from "../../../firestore.rules?raw";

// The sign-in-link indicator on the people lists, and the Audit Log entry the
// "Send sign-in email" button writes.

const norm = (s: string) => s.split("\r\n").join("\n");
const button = norm(buttonRaw);
const badge = norm(badgeRaw);
const lists = { students: norm(studentsRaw), teachers: norm(teachersRaw) };

describe("toMillis", () => {
  it("reads a Firestore-style timestamp or a number, and nothing else", () => {
    expect(toMillis({ toMillis: () => 1234 })).toBe(1234);
    expect(toMillis(99)).toBe(99);
    for (const v of [undefined, null, "x", {}, NaN, { toMillis: () => NaN }])
      expect(toMillis(v), String(v)).toBeNull();
  });
});

describe("loginLinkState", () => {
  it("is signed_in once mustChangePassword is false, even if a link was sent", () => {
    expect(loginLinkState({ mustChangePassword: false, emailedAtMs: 5 })).toBe(
      "signed_in",
    );
    expect(loginLinkState({ mustChangePassword: false })).toBe("signed_in");
  });

  it("is sent while still on the default password and a link was emailed", () => {
    expect(loginLinkState({ mustChangePassword: true, emailedAtMs: 5 })).toBe(
      "sent",
    );
  });

  it("is not_sent while still on the default password with no link emailed", () => {
    expect(loginLinkState({ mustChangePassword: true })).toBe("not_sent");
    expect(
      loginLinkState({ mustChangePassword: true, emailedAtMs: null }),
    ).toBe("not_sent");
  });

  it("shows nothing for an older account with no first-sign-in record", () => {
    expect(loginLinkState({})).toBeNull();
    expect(loginLinkState({ emailedAtMs: 5 })).toBeNull();
  });
});

describe("the badge and the lists", () => {
  it("shows the three states with their own text", () => {
    expect(badge).toContain('"Signed in"');
    expect(badge).toContain("Link sent ");
    expect(badge).toContain('"Link not sent"');
    expect(badge).toContain("if (!state) return null;");
  });

  it("is shown on the Students and Teachers lists but not Parents or Spectators (neither is emailed a link)", () => {
    // both lists draw it through the shared first cell, which is given the whole row
    for (const [name, src] of Object.entries(lists)) {
      expect(src, name).toContain(
        "<PersonCell person={item} photoSrc={photoSrc}",
      );
    }
    expect(norm(personCellRaw)).toContain(
      "<LoginLinkBadge state={person.loginState} emailedAtMs={person.emailedAtMs} />",
    );
    expect(norm(parentsRaw)).not.toContain("LoginLinkBadge");
    expect(norm(spectatorsRaw)).not.toContain("LoginLinkBadge");
    // A spectator is never emailed a link, so the list says only whether they have signed in.
    expect(norm(spectatorsRaw)).toContain(
      "<SignedInBadge mustChangePassword={item.mustChangePassword} />",
    );
  });
});

describe("the send button records the email", () => {
  it("writes the cooldown fields and one audit entry in a single batch, naming the person not the address", () => {
    expect(button).toContain("const batch = writeBatch(db);");
    expect(button).toContain('eventType: "sign_in_email_sent"');
    expect(button).toContain(
      "detail: `Emailed a sign-in link to ${data.name}`",
    );
    expect(button).not.toMatch(/detail:[^\n]*data\.email/);
    expect(button.indexOf("batch.update(")).toBeLessThan(
      button.indexOf("batch.set("),
    );
    expect(button.indexOf("batch.set(")).toBeLessThan(
      button.indexOf("await batch.commit();"),
    );
  });

  it("still records the cooldown alone if the combined write is refused, so no one is emailed twice", () => {
    const commit = button.indexOf("await batch.commit();");
    const fallback = button.indexOf('updateDoc(doc(db, "users", uid)', commit);
    expect(commit).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(commit);
    expect(button).toContain("audited = false;");
    expect(button).toContain("could not be added to the Audit Log.");
  });

  it("patches the one cached row so the badge updates without re-reading the list", () => {
    expect(button).toContain(
      'queryClient.setQueryData<InstitutionUserDoc[]>(["users", institutionId]',
    );
    expect(button).toContain("credentialsEmailedAt: Timestamp.now()");
  });

  it("has a label, an allow-list entry in the rules, and its own Emails category (not security)", () => {
    const audit = norm(auditRaw);
    expect(audit).toContain('sign_in_email_sent: "Sign-in link emailed"');
    expect(audit).toContain(
      'EMAIL_EVENT_TYPES: AuditEventType[] = ["sign_in_email_sent"]',
    );
    const security = audit.slice(
      audit.indexOf("export const SECURITY_EVENT_TYPES"),
      audit.indexOf("export const ACADEMIC_EVENT_TYPES"),
    );
    expect(security).not.toContain("sign_in_email_sent");
    expect(norm(rulesRaw)).toContain("'lesson_note_edit','sign_in_email_sent'");
  });
});
