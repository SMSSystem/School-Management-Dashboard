import type { InstitutionEmailSettings } from "@/lib/loginEmail/emailSettings";

// One wrapper around EmailJS's REST endpoint, so a platform-wide sender could
// replace it later. A plain fetch: no extra dependency. EmailJS allows one
// request a second on the free plan; a 429 or a network error is retried once.
// INSTITUTION_LOGIN_EMAILS_SPEC.md §8.

export const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";

export type SendResult = { ok: true } | { ok: false; message: string };

/** What the response status means for the admin, in plain words. */
export function describeEmailFailure(status: number | null): string {
  if (status === null) return "Could not reach the email service. Check your connection and try again.";
  if (status === 400 || status === 404) {
    return "The email service is not set up correctly (check the service and template ids).";
  }
  if (status === 401 || status === 403) return "The email service refused the request (check the public key).";
  if (status === 429) return "Too many emails were sent too quickly. Wait a moment and try again.";
  return "The email service could not send this message. Try again later.";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(settings: InstitutionEmailSettings, params: Record<string, string>): Promise<number | null> {
  try {
    const res = await fetch(EMAILJS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: settings.emailjs.serviceId,
        template_id: settings.emailjs.templateId,
        user_id: settings.emailjs.publicKey,
        template_params: params,
      }),
    });
    return res.status;
  } catch {
    return null;
  }
}

export async function sendEmail(
  settings: InstitutionEmailSettings,
  params: Record<string, string>,
  retryDelayMs = 1100,
): Promise<SendResult> {
  let status = await post(settings, params);
  if (status === null || status === 429) {
    await sleep(retryDelayMs);
    status = await post(settings, params);
  }
  return status === 200 ? { ok: true } : { ok: false, message: describeEmailFailure(status) };
}
