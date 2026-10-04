# Compliance Review — Privacy Notice & Terms of Service vs the Legal-Requirements Matrix

> **Second-pass review prepared 2026-10-03.** Required by the drafting brief: after drafting, compare **every section** of the Privacy Notice and Terms of Service against the `LEGAL_REQUIREMENTS_MATRIX.md`, and flag anything missing or needing review by a Jamaican attorney. **This is not legal advice.**
>
> **Legend:** ✅ addressed in the document text · ⚙️ addressed in text but **depends on operational/technical work actually being done** · ⚠️ **gap or risk** · 👤 **needs a Jamaican attorney**. Matrix row IDs (L, S, R, C, P, T, O) are from `LEGAL_REQUIREMENTS_MATRIX.md`.

---

## 1. How this review was done

Each matrix requirement was traced to the clause(s) of the Privacy Notice ("PN") and/or Terms of Service ("ToS") that address it, and judged for (a) whether the document says what the law requires, (b) whether it over-promises, and (c) whether the promise depends on work not yet done. Requirements that are not document-text at all (registration, DPO, processor contracts, breach playbook, retention tooling) are listed in §4 as operational obligations the documents **assume**.

---

## 2. Privacy Notice — section-by-section

| PN section | Matrix requirement(s) | Status | Notes / flags |
| --- | --- | --- | --- |
| At a glance; §1 Who we are | L4 (s.22(6)(a),(b)); C1; R7 | ✅/⚙️ | Names controller, DPO, OIC registration number. **⚠️ The OIC registration number and DPO must exist first** (C1, C4). 👤 confirm the controller statement (sole-controller vs institution) — §3 of matrix. |
| §2 Whose information | L4 | ✅ | Complete. |
| §3 What we collect | L4 (s.22(6)(d)); S2; S3; L2 | ✅/⚠️ | Collection table is specific and SMS-accurate. **⚠️ Minimisation (S3):** the ID number / occupation / workplace / last school / second phone must be reviewed and the table updated to match what is actually collected. **⚠️ Sensitive data (L2):** the note promises written consent is captured — this must be **true** (see §4). |
| §4 Why we use it / legal basis | L1; L2; S1; S2; O2; S8 | ✅/👤 | Each purpose has a basis. 👤 Counsel to confirm the basis mix, especially **legitimate interests vs consent** for children's records, and the **public-school statutory basis** (Education Act s.19). |
| §5 Who sees it | L4 (s.22(6)(e)); S2 | ✅ | States recipients; no selling/advertising. Good. |
| §6 Children and guardians | R6 (ss.5, 9); §5 of matrix | ✅/👤 | 👤 Confirm the **guardian-email age threshold** against the under-18 rule. |
| §7 Service providers | S7 (s.30(4)–(5)); S8 | ⚙️/⚠️ | Lists providers and locations. **⚠️ The sentence that written agreements are in place must not be published until the DPAs are signed** (s.30(5)). SMTP2GO region is a placeholder. |
| §8 Transfers outside Jamaica | **S8 (s.31)** | ✅/👤 | Discloses the US, names the basis as **consent + safeguards** (s.31(4)(a)). 👤 **High priority:** confirm there is no Ministerial adequacy order for the US, that consent is a sound basis here, and whether to seek **Commissioner-approved terms/authorisation (s.31(4)(h)/(i))**. Consent must be genuinely free (L3 anti-bundling). |
| §9 Retention | **L4 (s.22(6)(h)); S5 (s.28)** | ⚠️ | **All periods are placeholders.** The Act requires the **retention period to be disclosed** (s.22(6)(h)); the Notice **cannot be published** until real periods are set. 👤/⚙️ Check the **Disposal of Personal Data Regulations 2024** and **Education Regulations** for prescribed methods/periods. |
| §10 Your rights | **R1–R7** | ✅ | Deadlines are correct and cited: access/rectification **30 days** (ss.6, 13), prevent-processing **21 days** (s.11), portability (s.6), automated decisions (s.12), withdraw consent (s.9), complain to OIC. Strong. |
| §11 Security | S7 (s.30); C6; P3 | ⚙️/⚠️ | Describes measures factually and states the **72-hour** breach report to the Commissioner. **⚠️ Depends on closing the security gaps** (public default passwords; personal data in `localStorage`/`sessionStorage`) before the statements are safe (matrix S7). Correctly avoids "bank-level" language. |
| §12 Cookies / browser storage | L4; S7 | ✅ | Accurate; privacy-preserving; discloses reCAPTCHA. |
| §13 Changes / contact | L4; R7 | ✅ | Re-acceptance on material change; OIC route. |

**Privacy Notice verdict:** structurally complete against s.22(6) and the rights. **Blocking items before publication:** real **retention periods** (§9), signed **processor DPAs** (§7), the **controller-model** decision, the **transfer-basis** confirmation, and the **security-gap** fixes. These are flagged, not hidden.

---

## 3. Terms of Service — section-by-section

| ToS section | Matrix requirement(s) | Status | Notes / flags |
| --- | --- | --- | --- |
| §1 Parties / acceptance | O3 (ETA ss.6–8) | ✅/⚙️ | Electronic acceptance valid; **⚙️ a reliable acceptance record (version, time, identity) must actually be stored.** |
| §2 The Service | — | ✅ | Accurate description. |
| §3 Age and guardians | R6; §5 matrix | ✅/👤 | 👤 Confirm guardian threshold. |
| §4 Accounts/passwords | S7; O4 | ✅/⚙️ | Good. **⚙️ Depends on fixing default passwords** (matrix S7) so the "keep your password private" promise is meaningful. |
| §5 Institutions' responsibilities | L1–L4; S3; C7; §3 matrix | ✅/👤 | Pushes notice/consent/authority to institutions. **👤 Under the sole-controller model, the operator also carries these duties** — the bracketed note flags this; counsel to finalise the split. |
| §6 Acceptable use | **O4 (Cybercrimes ss.3–4)**; P4 | ✅ | Tracks the computer-misuse offences well. |
| §7 Emails for institutions | S-email; L5; s.10 | ✅ | "Messenger" framing; no delivery guarantee; transactional not marketing. Consistent with provider terms. |
| §8 Content & licence | O (Copyright) | ✅ | Reasonable; users keep ownership. |
| §9 Privacy & data protection | PN; **P3 (s.69)** | ✅ | Correctly states these Terms do not remove Data Protection Act rights, including **s.69 compensation**. |
| §10 Availability "as is" | provider terms; S7 | ✅ | No uptime guarantee — aligns with Firebase/Vercel/EmailJS/SMTP2GO "as is" terms. |
| §11 Third-party services | — | ✅ | Reasonable. |
| §12 Fees | — | ⚠️ | Placeholder — must be completed or state "free for now." |
| §13 Suspension/termination | S5; export | ✅/⚙️ | Export-then-delete; **⚙️ needs export + deletion tooling** (matrix S5, R5). |
| §14 IP | — | ✅ | Standard. |
| §15 Disclaimers | S7; provider terms | ✅ | Does not over-promise; keeps educational decisions with the institution. |
| §16 Limitation of liability | **P3 (s.69)** | ✅/👤 | **Correctly carves out non-excludable liability, including s.69 compensation.** 👤 Counsel to set the cap and confirm fairness for consumer (parent) users. |
| §17 Indemnity | — | 👤 | Scope to be settled by counsel. |
| §18 Governing law | O (Jamaica) | ✅/👤 | Jamaican law and courts; 👤 confirm any dispute-resolution step. |
| §19 Changes | L3 re-consent | ✅ | Re-acceptance on material change. |
| §20 General | — | 👤 | Standard clauses to be supplied by counsel. |
| §22 Institution Terms schedule | **S7 (s.30(5))**; C7; §3 matrix | ⚙️/👤 | Becomes a **data-processing agreement** under the fallback model and **must meet s.30(5)**. 👤 Finalise with counsel; ⚙️ sign with each institution. |

**Terms verdict:** well-aligned with provider terms and Jamaican law; correctly preserves non-excludable Data Protection Act rights. **Blocking items:** the **fees** clause, the **liability cap**, counsel-supplied **general/indemnity/dispute** clauses, and the **Institution Terms / DPA** finalisation.

---

## 4. Matrix requirements that are **not document text** — operational obligations the documents assume

These are legal requirements that the Privacy Notice/Terms **reference or rely on** but that are satisfied by **action, not wording**. Publishing the documents without doing these would make statements in them untrue.

| Matrix row | Obligation | Status needed before publishing | Owner |
| --- | --- | --- | --- |
| **C1, C2** | **Register with the OIC** (and name US transfers + DPO in the particulars); renew by 1 Dec | ⚠️ Must be done; the PN states a registration number | Operator |
| **C4** | **Appoint and notify a DPO** (mandatory — sensitive + likely large-scale, s.20(6)) | ⚠️ Must be done; PN names a DPO | Operator |
| **C5** | Assess whether the SMS is **"specified processing"** (s.19) and do a **DPIA** | 👤 Confirm against the Ministerial order; DPIA prudent regardless | Operator + counsel |
| **S7** | Sign **written processor DPAs** with Google, Vercel, EmailJS, SMTP2GO (s.30(5)) | ⚠️ PN §7 asserts these exist — must be true | Operator |
| **S7** | Fix **public default passwords**; stop storing personal data in `localStorage`/`sessionStorage` | ⚠️ Security statements depend on this | Engineering |
| **S5, R5** | Set **retention periods**; build **export/deletion/anonymisation** tooling (incl. the permanent audit log) | ⚠️ PN §9 retention and ToS §13 export depend on this | Operator + engineering |
| **S3** | **Minimise** fields (ID number, occupation/workplace, last school, 2nd phone) | ⚠️ Update PN §3 to match | Operator + engineering |
| **L2, L3** | Build **consent capture** (registration-form consent, first-sign-in acceptance, written consent for sensitive data, no pre-ticked boxes, recorded version/time) | ⚠️ PN/ToS assume consent exists | Engineering |
| **C6, C7** | Build the **72-hour breach playbook** and a monitored mailbox for provider notices | ⚙️ Supports PN §11 | Operator |
| **S8** | Decide and document the **transfer basis** (consent + contract, and consider Commissioner-approved terms) | 👤 Confirm; PN §8 depends on it | Operator + counsel |

---

## 5. Consolidated list for the Jamaican attorney (👤)

1. **Controller/processor model** — confirm sole-controller vs institution-as-controller/joint; this changes PN §1/§9, ToS §5/§9/§22 (matrix §3).
2. **Overseas transfer** — confirm no US adequacy order; confirm consent is a sound basis for children's data transferred to the US; advise on **Commissioner-approved terms/authorisation** (s.31(4)(h)/(i)) (matrix S8).
3. **Specified processing / DPIA** — confirm whether the s.19(1) order captures this platform (matrix C5).
4. **Lawful-basis mix** — especially consent vs legitimate interests for children's records, and the public-school statutory basis (matrix L1, O2).
5. **Breach notification to data subjects** — the time/form prescribed by the 2024 Regulations (s.21(5)); confirm before stating any data-subject deadline (matrix C7).
6. **Retention periods & disposal** — check the Disposal of Personal Data Regulations 2024 and Education Regulations (matrix S5, O2).
7. **Consent standard** — confirm the "no pre-ticked boxes" and recorded-acceptance requirements against the Regulations (matrix L3).
8. **Liability cap / indemnity / dispute clauses / general clauses** — ToS §16, §17, §18, §20.
9. **Guardian-email age threshold** — confirm against the under-18 rule (PN §6, ToS §3).
10. **Registration timing** — confirm the appointed-day dates and the s.76 transition end; education is a priority sector (matrix C2, T1).

---

## 6. Pre-publication checklist (blocking items)

Before the Privacy Notice and Terms go live, the following must be **done** (not just drafted):

- [ ] Counsel has reviewed both documents and answered the §5 list.
- [ ] The controller/processor model is decided and the documents reconciled to it.
- [ ] The operator is **named** and **registered with the OIC**; the registration number is filled in.
- [ ] A **DPO** is appointed and notified to the OIC; the DPO's contact is filled in.
- [ ] **Written processor DPAs** signed with Google, Vercel, EmailJS, SMTP2GO (s.30(5)).
- [ ] **Retention periods** set and filled into PN §9 (no placeholders).
- [ ] **Transfer basis** documented; consent wording live on the Disclaimer/registration form; consent is unbundled and recorded.
- [ ] **Security P0 fixes** done (default passwords; local/session storage of personal data).
- [ ] All `[CONFIRM: ...]` placeholders replaced; version and effective date set.
- [ ] Both documents linked from the Disclaimer, registration form, login page, email footer and user profile.

**Bottom line.** The two documents are complete and accurate **as drafts** and are grounded in the primary statutory text. They are **not safe to publish** until the blocking operational items above are done and a Jamaican attorney has confirmed the open points — every one of which is flagged here rather than papered over.
