# Competitive Benchmark — Comsol MySchool (myschooljamaica.com) Privacy Policy & Terms

> **Prepared 2026-10-03.** A review of a live Jamaican competitor's published Privacy Policy and Terms, benchmarked against `LEGAL_REQUIREMENTS_MATRIX.md` and our own `PRIVACY_NOTICE.md` / `TERMS_OF_SERVICE.md`. **This is not legal advice** and is my own reading of their public pages; whether the competitor is actually non-compliant is for the OIC or a lawyer to judge. It is recorded to validate our approach and to flag pitfalls to avoid.

## 1. What the competitor published

- **Operator:** COMSOL (JAMAICA) LIMITED, doing business as **Comsol MySchool**. Contact: `support@myschooljamaica.com`, (876) 615-2615 / (929) 207-2689. ToS contact address: 158 Coconut Drive, St. Catherine, Jamaica.
- **Both documents are auto-generated [Termly](https://termly.io) templates**, embedded on the site as iframes (`app.termly.io/policy-viewer/...`), not drafted for the product or for Jamaican law:
  - **Privacy Policy** — "Last updated May 12, 2024." A template written to **GDPR / UK GDPR / Swiss** law.
  - **Terms and Conditions** ("Terms of Use") — "Last updated November 14, 2022." A **US** "Terms of Use" template with the governing-law clause changed to Jamaica.

**How it was read (for reproducibility):** the policy bodies are not in the page HTML; they load from Termly iframes. The text was read by opening the iframe URLs directly in a browser (`.../iframe-content.html?policyUUID=<uuid>&viewMethod=embedded`) — privacy UUID `96eb4c0d-…ed06`, terms UUID `683d878a-…0892`.

## 2. The headline finding

The market incumbent's documents are **the exact "generic SaaS policy, foreign law assumed" pattern our brief warned against.** They would not pass the second-pass review we applied to our own drafts (`COMPLIANCE_REVIEW.md`). Neither document mentions **Jamaica's Data Protection Act, 2020** or the **Office of the Information Commissioner (OIC)** at all; the Privacy Policy instead directs users to the EU/UK/Swiss regulators.

## 3. Compliance gaps vs. the Jamaican Data Protection Act

Matrix row IDs are from `LEGAL_REQUIREMENTS_MATRIX.md`.

| Area (matrix row) | What the DPA requires | What Comsol's documents do |
| --- | --- | --- |
| **Applicable law / regulator** (R7, C1) | Comply with the DPA 2020; state the OIC as the complaint route | **Cite GDPR / UK GDPR / Swiss law only; no DPA, no OIC.** Rights section points to "your Member State" authority or the Swiss Federal Commissioner |
| **Sensitive data** (L2) | Written consent/condition for health, biometrics, "alleged offence" data | The Privacy Policy states (per Comsol) *"We do not process sensitive personal information"* — almost certainly **false** for a school system holding grades, attendance, behaviour records and photos |
| **Children** (§5 of matrix) | Guardian consent, notice; minor = under 18 (ss.5, 9) | **The Privacy Policy has no children's/parental-consent section at all** — the single most serious omission for a schools platform. (The Terms carry only a generic "minors need parental permission" line.) |
| **What is collected** (L4, S3) | Accurate, specific inventory | Lists essentially only "email addresses, passwords" plus device/geolocation/social-login data — **grossly under-describes** a student information system |
| **Transfers outside Jamaica** (S8, s.31) | Disclose destination(s) and a lawful transfer basis | Privacy Policy leaves the **server location blank** ("Our servers are located in."); only the Terms (§15) disclose US hosting and frame a US-transfer consent |
| **Rights & deadlines** (R1–R7) | Access/rectification 30 days (ss.6, 13), prevent-processing 21 days (s.11), OIC complaint | Rights framed as applying only "in some regions (EEA/UK/Switzerland)" — a Jamaican user is in effect told they have none; **no statutory deadlines**, no OIC route |
| **Data Protection Officer** (C4) | Mandatory here (sensitive + likely large-scale, s.20(6)) | **Not mentioned** |
| **Breach notification** (C6) | Report to the Commissioner within **72 hours** (s.21) | **No breach-notification commitment of any kind** |
| **Retention** (S5, s.22(6)(h)) | State the retention period | Generic ("as long as you have an account"); no periods |
| **Processor terms / subprocessors** (S7, s.30(5)) | Written DPAs; name providers | None; only abstract "third parties"; no named subprocessors |
| **Registration with the OIC** (C1–C2) | Register before processing; name transfers + DPO | Not referenced (an operational matter, but the documents give no sign of it) |

## 4. Notable risks specific to their documents

1. **The "no sensitive personal information" statement** is a factual misrepresentation that is hard to defend for a children's-records platform and is the kind of thing an OIC complaint or audit targets.
2. **Terms §7 "Contribution License"** grants Comsol a *perpetual, irrevocable, worldwide, royalty-free* licence to use "Contributions" for *any purpose, commercial or advertising*, expressly **including image and voice** — a generic social-network clause that is inappropriate and high-risk over **children's photos and schoolwork**. (Our `TERMS_OF_SERVICE.md` §8 deliberately limits the licence to hosting/displaying/processing **to provide the Service**, with users keeping ownership.)
3. **US-law boilerplate left in** a Jamaican product: HIPAA/FISMA/GLBA references, a **California Users** section (§27) with a Sacramento address, and App Store/advertiser/review clauses irrelevant to the service.
4. **Unfilled template placeholders** — blank server location and blank postal address in the Privacy Policy (while the Terms list an address) — indicate the template was never completed.
5. **Liability cap** (Terms §23): limited to fees paid in the prior **6 months**, with **no carve-out** for liability that cannot lawfully be excluded under Jamaican law — notably a data subject's right to compensation under **DPA s.69**. (Our Terms §16 keeps that carve-out.)
6. **User Data clause** (Terms §25): disclaims all liability for loss/corruption of data and makes the user "solely responsible" — harsh and arguably unfair for a system of record holding a school's official student data.
7. **Document drift:** the Privacy Policy (GDPR template, May 2024) and the Terms (US template, Nov 2022) were generated at different times from different templates and are not internally consistent (e.g., hosting location disclosed in one, blank in the other).

## 5. What they did get right (worth confirming for our drafts)

- **Governing law** (Terms §19–20): laws of Jamaica, exclusive jurisdiction of the Jamaican courts — **matches our `TERMS_OF_SERVICE.md` §18**. Good cross-confirmation.
- **Minor supervision / parental permission** (Terms §1, §3): reasonable boilerplate that a student under 18 must have a parent/guardian agree first — the same principle as ours, though ours is tailored to the DPA's guardian-consent rule (s.9).
- **Electronic communications & signatures** (Terms §26): consent to electronic signatures and electronic records — the same idea as our ETA-based acceptance clause, though they cite no Jamaican statute (ours anchors to ETA ss.6–8).

Nothing in their **Privacy Policy** is worth borrowing.

## 6. Implications for our documents

- **Validation.** Our bespoke, primary-source approach is clearly the right one; the incumbent's documents illustrate the failure modes we designed against (foreign law assumed, children ignored, sensitive data denied, no OIC/DPO/breach, placeholders unfilled).
- **Differentiators to keep:** the Jamaica-specific legal basis and rights/deadlines, the children/guardian and sensitive-data handling, the overseas-transfer disclosure and basis, the DPO and 72-hour breach commitments, the narrow content licence, and the s.69 liability carve-out.
- **No changes required** to our drafts as a result of this benchmark; the only shared elements (governing law, minor supervision, electronic acceptance) are already covered.

## 7. Sources

- Comsol MySchool Privacy Policy — `https://myschooljamaica.com/privacy-policy/` (Termly iframe, policy UUID `96eb4c0d-81a5-4052-8de5-7bb7a239ed06`), accessed 2026-10-03.
- Comsol MySchool Terms and Conditions — `https://myschooljamaica.com/terms-and-conditions/` (Termly iframe, policy UUID `683d878a-9057-4463-9945-ca7d55af0892`), accessed 2026-10-03.
- Benchmarked against `LEGAL_REQUIREMENTS_MATRIX.md`, `PRIVACY_NOTICE.md`, `TERMS_OF_SERVICE.md`, `COMPLIANCE_REVIEW.md`.
