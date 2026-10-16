# Email templates

`first-sign-in-email.html` is the HTML pasted into the EmailJS template that the "Send sign-in email" button uses (`src/components/SendLoginEmailButton.tsx`, variables built by `buildLoginEmailParams` in `src/lib/loginEmail/payload.ts`). EmailJS templates live in the EmailJS dashboard, so this file is the single reviewed copy; change it here, check it, then paste it.

## The rules (read before editing the HTML)

EmailJS templates are **Mustache**. Mustache has no HTML comments, so it reads every double-brace tag, **even inside `<!-- -->`**.

1. **Never write double braces in a comment**, and keep the pasted HTML free of comments. A comment such as "the last three drive the `{{#...}}` sections" opens a section called `...` that is never closed, and EmailJS then sends **"Template: One or more dynamic variables are corrupted"** as the body of every email (this happened on 2026-10-16 and, because the template had been saved, it broke the live template). Put explanations here in this README instead.
2. **Only plain `{{variable}}` tags**, and only variables the app sends (table below). No `{{{x}}}` or `{{&x}}` (they skip HTML escaping), no `{{>partial}}`, no `{{!comment}}`.
3. **No conditional sections** (`{{#x}}...{{/x}}`, `{{^x}}...{{/x}}`) unless they have first been verified on the EmailJS dashboard; every opener needs its closer.
4. **Tables and inline styles only**: no `<style>` block, no flexbox, no `<script>` (Outlook ignores the first two).
5. Keep the file under 100,000 bytes (Gmail clips messages near 102 KB).

`npm run check:email-template` enforces all of this (`scripts/emailTemplateCheckLogic.mjs`, tested by `src/lib/__tests__/emailTemplate.test.ts`). Run it before every paste.

## Variables

| Variable | Used in | Value |
| --- | --- | --- |
| `to_email` | body and EmailJS "To Email" | the recipient's address |
| `to_name` | body | recipient name |
| `portal_name` | header and footer | for example "GENR8-3D Portal" (`email_settings/config.portalName`) |
| `role_label` | body | `student`, `teacher` or `spectator` |
| `login_url` | button and plain link | `<app URL>/login/<institution id>/<role code>`; never contains a password |
| `logo_url` | header image | `email_settings/config.logoUrl`, else `<app URL>/apple-touch-icon.png`; must be a public **https PNG** (clients do not show SVG) |
| `reply_to` | EmailJS "Reply-To" setting only | the institution's reply address, or empty |
| `subject` | EmailJS "Subject" setting only | `Your <portal name> sign-in link` |
| `is_student`, `is_teacher`, `is_spectator` | not used | the app still sends them; extra variables are ignored |

EmailJS settings (not part of the HTML): **To Email** `{{to_email}}`, **From name** `GENR8-3D`, **Reply-To** `{{reply_to}}`, **Subject** `{{subject}}`. Turn activity logging off if offered.

## The logo

The header shows the icon-only logo on a white rounded badge, 96 px wide (the icon has dark parts that vanish on the dark header). Export the PNG about 192 px wide (2x), host it on a public https address (the institution's own site), then set it with `node scripts/rename-institution.mjs --from-name=... --to-name=... --logo-url=<https url> --key=<path> [--live]` (see that script's header). Nothing in the HTML changes when the logo changes.

## How to change and paste the template

1. Edit `first-sign-in-email.html`. No comments, no sections, plain variables only.
2. `npm run check:email-template` must print `OK`.
3. In EmailJS: Email Templates, open the template whose id is `emailjs.templateId` in `institutions/<id>/email_settings/config`, switch to the HTML source, replace everything with the file, confirm the settings above, **Save**.
4. Use the dashboard's "Test it" with sample values (`to_email`, `to_name`, `portal_name`, `role_label`, `login_url`, `logo_url`) and read the received email. Then send one real email from the app (Send sign-in email on a test student) and check Gmail on the web and on a phone, and Outlook if possible.

Do not save an untested HTML over the live template: "Test it" with an unsaved editor is not the same as the saved template, and a saved broken template breaks every email at once. If the production template must stay untouched while experimenting, duplicate it first and test the copy.

## If emails arrive saying "One or more dynamic variables are corrupted"

1. The saved template fails to parse. Stop using the Send button.
2. Run `npm run check:email-template`; it names the line and the reason.
3. Replace the template content in EmailJS with this folder's `first-sign-in-email.html`, Save, "Test it", then send one real email.
4. The usual cause is a `{{` tag inside a comment, an unclosed or unopened `{{#...}}` section, or a variable name typo.
