// institutions/{id}/email_settings/config as stored, and its checked shape.
// Pure (no Firebase import) so it can be tested; the reader is in settings.ts.
// INSTITUTION_LOGIN_EMAILS_SPEC.md section 3.

export type InstitutionEmailSettings = {
  enabled: boolean;
  emailjs: { publicKey: string; serviceId: string; templateId: string };
  replyTo?: string;
  portalName: string;
};

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A settings document in its stored shape, checked; null when it is unusable. */
export function parseEmailSettings(data: unknown): InstitutionEmailSettings | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const e = (d.emailjs && typeof d.emailjs === "object" ? d.emailjs : {}) as Record<string, unknown>;
  const publicKey = text(e.publicKey);
  const serviceId = text(e.serviceId);
  const templateId = text(e.templateId);
  const portalName = text(d.portalName);
  if (d.enabled !== true || !publicKey || !serviceId || !templateId || !portalName) return null;
  const replyTo = text(d.replyTo);
  return { enabled: true, emailjs: { publicKey, serviceId, templateId }, portalName, ...(replyTo ? { replyTo } : {}) };
}
