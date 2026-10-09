# Legal-Requirements Matrix — Jamaican Law for the School Management System

> **Status:** Legal-research aid prepared 2026-10-03. **This is not legal advice** and has not been reviewed by a Jamaican attorney or by the Office of the Information Commissioner (OIC). It is written to be verified by counsel before the Privacy Notice and Terms of Service are published.
>
> **What is new in this document.** Unlike the earlier `LEGAL_AND_PRIVACY_COMPLIANCE.md` (whose own reliability note records that the Data Protection Act was summarised from law-firm secondary sources because the official PDF could not be read), **every legal conclusion here is drawn from, and cited to, the primary statutory text** of the Acts supplied in `Documents/Policies/jamaican-law/`, which were read in full for the relevant provisions. Where a conclusion rests on secondary legislation (the 2024 Regulations), on OIC guidance, or on an assumption, that is marked explicitly.
>
> **Companion documents:** `PRIVACY_NOTICE.md`, `TERMS_OF_SERVICE.md`, `COMPLIANCE_REVIEW.md` (the second-pass review). Product facts about the app are taken from `LEGAL_AND_PRIVACY_COMPLIANCE.md` §3 and the repository.

---

## 1. How to read this matrix — the four distinctions

The brief requires that four kinds of statement be kept apart. Each row and conclusion carries one of these tags:

| Tag | Meaning | Weight |
| --- | --- | --- |
| **[STATUTE]** | A requirement stated expressly in an Act of the Jamaican Parliament, cited to section | Binding law; quoted/paraphrased from the primary text |
| **[REG]** | A requirement in subsidiary legislation (the 2024 Data Protection Regulations and related notices) | Binding, but the **content of the regulations was not read from primary text** — confirmed only from OIC/government summaries. Treat specifics as **to be verified** |
| **[OIC]** | Regulatory guidance or administrative practice published by the Office of the Information Commissioner | Persuasive/administrative, not the words of the Act |
| **[PRACTICE]** | A recommended industry/security practice of this guide, not a legal requirement | Advisory |
| **[ASSUMPTION]** | A point that depends on facts not yet settled (operator identity, deployment choices) or on a reading a lawyer should confirm | Must be confirmed |

Monetary figures, dates, fees, and timeframes are given **only** where found in the primary text or stated by the OIC/JIS; nothing in the “What the law requires” column has been invented. Figures that come from the 2024 Regulations rather than the Act are tagged **[REG]** and marked *to confirm*.

**Key sources (full list in §9):**
- *The Data Protection Act, 2020* (Act 7 of 2020) — "**DPA**" — primary scanned Gazette text, read section by section.
- *The Child Care and Protection Act* ("**CCPA**"), *The Education Act*, *The Electronic Transactions Act* ("**ETA**"), *The Cybercrimes Act* — primary texts.
- OIC (`oic.gov.jm`) and Jamaica Information Service (`jis.gov.jm`) for registration mechanics, fees, and commencement — tagged **[OIC]**.

---

## 2. Does the Act apply? — Territorial and material scope

**[STATUTE] Conclusion: the Data Protection Act applies to this platform.**

**DPA s.3(1)** — the Act applies to a data controller in respect of personal data only if the controller:
- **(a)** is **established in Jamaica** (or in a place where Jamaican law applies by international public law) and the data are processed in the context of that establishment; **or**
- **(b)** though not established in Jamaica, either **(i)** uses equipment in Jamaica for processing (other than mere transit), or **(ii)** processes personal data of a **data subject who is in Jamaica** where the processing relates to **(A)** offering products or services to data subjects in Jamaica (whether or not payment is required) or **(B)** monitoring their behaviour as far as it takes place in Jamaica.

**DPA s.3(2)** — a controller within (b) **must appoint a representative established in Jamaica**.
**DPA s.3(3)** — "established in Jamaica" includes an individual ordinarily resident in Jamaica, a body incorporated under Jamaican law, a Jamaican partnership/unincorporated association, or a person maintaining an office, branch, agency or regular practice in Jamaica.

**Application to the SMS:**
- If the operator is a Jamaican individual or company (the expected case — `[CONFIRM: operator legal form and place of establishment]`), the Act applies to **all** of its processing in that context under s.3(1)(a).
- Even if the operator were offshore, the platform offers an educational service to, and processes data of, students, parents and staff **who are in Jamaica**, so s.3(1)(b)(ii)(A) would apply and a **Jamaican representative** would be mandatory (s.3(2)).
- **"Personal data"** (s.2) is information (however stored) relating to a living individual (or one deceased under 30 years) who can be identified from it, plus opinions/intentions about them. Essentially all records in the app are personal data.

> **There is no credible reading on which the Act does not apply.** The only open question is *who* carries the controller duties (§3).

---

## 3. Roles under the Act — controller, processor, or both (analysed, not assumed)

The brief requires this relationship to be analysed from how the system actually operates, not assumed.

**The statutory test (DPA s.2):**
- **"data controller"** = any person or public authority who, alone or jointly or in common with others, **determines the purposes for which and the manner in which** personal data are (or are to be) processed. Where data are processed only for purposes required by an enactment, the person on whom that obligation is imposed is the controller.
- **"data processor"** = any person, **other than an employee of the controller**, who **processes the data on behalf of the controller**.

**How the system operates (facts):**
- **Institutions** decide *which* students, parents and staff get accounts, *what* is recorded about them (attendance, results, behaviour, comments, photos), and *for what educational purposes*. On the statutory test these are strong indicators that each institution **determines the purposes and means** of processing its own people's records.
- **The platform operator** decides *how* the service works and is built: the data model, security measures, where data are hosted (US), the audit logging, the retention tooling, and the account-email feature. For **platform-level data** — account and security logs, the audit log it keeps to run and secure the service, billing, the email-delivery records — the operator **determines purposes and means** and is a **controller**.

**Analysis and conclusion:**
- The most defensible reading is a **dual / likely joint-controller picture**: *each institution is a controller (or joint controller) of its own students', parents' and staff records*, and *the platform is that institution's **processor** for those records* **and** *a **controller in its own right** for the platform data it determines (security, audit, email delivery, billing, platform accounts)*.
- The project owner has **recorded a decision to treat the platform as the sole data controller** for all personal data (see `LEGAL_AND_PRIVACY_COMPLIANCE.md` §4). This is a workable commercial simplification, and the draft Privacy Notice and Terms are written to support it, **but it is not a safe legal conclusion**: the Act looks at who *actually* decides purposes and means (s.2), so a regulator or court could still treat a school as controller of its own students' data regardless of the contract. **[ASSUMPTION — counsel to confirm the model.]**
- **Consequences of the sole-controller model:** the platform takes on *every* controller duty for *every* institution's data (notices to all data subjects, large-scale children's-data processing, DPO, breach notification), and liability flows to the platform first. The **fallback** is *institution = controller, platform = processor* for student/parent/staff records (needing a written data-processing agreement with each institution under **s.30(5)**), with the platform as controller only for its own platform data. A **middle option** is documented joint controllership.
- **Public schools** are "public authorities" (**s.2**) and are **bound by the Act but not liable to prosecution (s.72(3))**; they still carry controller duties (registration, and a DPO as a public authority under s.20(6)(a)). **Private/independent schools** are ordinary controllers.
- **Providers (Google/Firebase, Vercel, EmailJS, SMTP2GO)** process on the platform's behalf and are **processors**; **s.30(4)–(5)** requires written processor contracts (see matrix row S7).

> **Flag for the attorney:** confirm whether the sole-controller model holds or whether institutions are controllers/joint controllers. The rest of this matrix is written on the sole-controller basis but notes where the answer changes the obligation.

---

## 4. The legal-requirements matrix (Data Protection Act)

Columns: **Requirement | Applicable law/regulation | Section | What the law requires | How it affects the SMS | Official source**. Each requirement is tagged with its distinction type (§1).

### 4.1 Core definitions that drive everything

| Requirement | Applicable law/regulation | Section | What the law requires | How it affects the SMS | Official source |
| --- | --- | --- | --- | --- | --- |
| **[STATUTE]** Who is a "minor" | DPA 2020 | s.2(1) | A minor is **an individual under the age of eighteen years**. | Most students are minors; their rights and consents run through a parent/legal guardian (s.5, s.9). | DPA 2020 s.2 |
| **[STATUTE]** What is "sensitive personal data" | DPA 2020 | s.2(1) | Personal data consisting of: **genetic or biometric data**; filiation, racial or ethnic origin; political/philosophical/religious or similar beliefs; trade-union membership; **physical or mental health or condition**; sex life; **the alleged commission of any offence** or proceedings for one. | The app holds sensitive data: **photos can be biometric data** (s.2 "biometric data" expressly includes a **photograph or other facial image** used for unique identification); **absence reasons may reveal health**; **disciplinary free-text may touch an "alleged offence."** Each needs an s.24 condition (row L2). | DPA 2020 s.2 |
| **[STATUTE]** What counts as "processing" | DPA 2020 | s.2(1) | Obtaining, recording, storing, or any operation — organising, retrieving, using, disclosing, aligning/combining, blocking, **erasing, destroying, or anonymising** — whether or not automated. | Everything the app does with records is "processing," including caching, export, deletion and anonymisation. | DPA 2020 s.2 |

### 4.2 Lawfulness, consent and the notice ("right to be informed")

| Requirement | Applicable law/regulation | Section | What the law requires | How it affects the SMS | Official source |
| --- | --- | --- | --- | --- | --- |
| **[STATUTE] (L1)** Fair & lawful processing; a lawful condition | DPA 2020 | s.22(1), s.23 | Personal data must be processed fairly and lawfully and not at all unless **at least one s.23 condition** is met: **(a) consent**; **(b) necessity for a contract** with the data subject or pre-contract steps; **(c) a legal obligation** (non-contractual); **(d) vital interests**; **(e) administration of justice / statutory functions / public-interest functions**; **(f) legitimate interests** not overridden by the data subject's rights; **(g) data published by the subject**. | The platform needs a condition per purpose. Realistic bases: **contract** (running accounts), **legitimate interests** (service security, audit), **consent** (children's and guardians' data collected directly, and the registration form), and for **public schools** possibly **legal obligation / statutory function** (Education Act s.19 — row O2). | DPA 2020 ss.22–23 |
| **[STATUTE] (L2)** Extra condition for **sensitive** data | DPA 2020 | s.22(1)(b), s.24 | For sensitive personal data, a s.23 condition **and** at least one s.24 condition must be met. s.24 conditions include **(a) the data subject's consent *in writing***; employment/social-security obligations; vital interests where consent is impossible; legitimate non-profit bodies; data made public by the subject; legal proceedings; administration of justice/statutory functions; anti-fraud; medical purposes by a health professional; racial-equality monitoring; and Minister-specified cases. A data subject may **withdraw** consent to sensitive-data processing at any time (s.24(6)). | For photos (if biometric), health-tinged absence reasons, and discipline touching an alleged offence, the only condition that cleanly fits routine school use is **(a) written consent** (guardian's, for a minor). ⇒ obtain **written consent** for sensitive data, or do not collect it. Electronic consent can satisfy "in writing" (ETA s.7 — row E1). | DPA 2020 ss.22, 24 |
| **[STATUTE] (L3)** What valid consent is | DPA 2020 | s.9 | Consent = an **informed, specific, unequivocal, freely-given expression of will**. "Informed" means the subject is told **how** the data will be processed, including **the purpose** and **the class of persons to whom data may be transferred** (s.9(2)(a)). Consent is **not freely given** if, as a condition of a service, the subject must consent to collection/use beyond what is reasonable for that service (s.9(2)(b) — anti-bundling). For a minor, consent is given by **a parent or legal guardian** (s.9(1)(b)(iii)); it may be **withdrawn in the same manner given** (s.9(1)(c)). | Consent screens must state purpose and that data go to named providers/the US; must not bundle unnecessary collection with enrolment; must be guardian-given for minors; and must be withdrawable. *(The "no pre-ticked boxes" rule often quoted is best practice / likely in the Regulations, **not** the words of s.9 — tagged [PRACTICE]/[REG], confirm.)* | DPA 2020 s.9 |
| **[STATUTE] (L4)** Right to be informed — the notice | DPA 2020 | s.22(4), s.22(6) | Data are not processed fairly unless obtained directly (or from an authorised person) **and** the subject is provided, at/ before collection, with: **(a)** controller identity; **(b)** the **DPO's** identity; **(c)** any representative; **(d)** the purpose(s); **(e)** any third party to whom disclosure is contemplated; **(f)** whether provision is compulsory under law and the consequences of not providing; **(g)** the legal authority for seeking the data; **(h) the expected period of retention**; **(i)** any further information needed for fairness. | This is the mandatory content of the **Privacy Notice** and the **registration-form collection notice**. The app currently gives **no notice** at collection — a gap. Retention periods (h) **must** be stated. | DPA 2020 s.22 |
| **[STATUTE] (L5)** Direct marketing | DPA 2020 | s.10 | No processing for direct marketing without consent (or limited soft opt-in to existing customers); marketing messages must identify the sender and give an opt-out. | The app does **no** marketing; state this and keep it true. Account emails are transactional, not marketing (row S-email). | DPA 2020 s.10 |

### 4.3 The eight data-protection standards (DPA ss.22–31)

| Requirement | Applicable law/regulation | Section | What the law requires | How it affects the SMS | Official source |
| --- | --- | --- | --- | --- | --- |
| **[STATUTE] (S1)** 1st standard — fair & lawful | DPA 2020 | s.22 | As rows L1–L4. | Notice + lawful condition for every purpose. | DPA 2020 s.22 |
| **[STATUTE] (S2)** 2nd standard — purpose limitation | DPA 2020 | s.25 | Data obtained only for **specified and lawful purposes**; not further processed in a way incompatible with them. | State purposes in the Notice/registration particulars; do not repurpose student data (e.g., for analytics/marketing). | DPA 2020 s.25 |
| **[STATUTE] (S3)** 3rd standard — minimisation | DPA 2020 | s.26 | Data must be **adequate, relevant, and limited to what is necessary** for the purposes. | Review every field: question the **ID number (TRN/Citizen ID)**, guardian **occupation/workplace**, **last school**, second phone. Make optional or drop what is not necessary. | DPA 2020 s.26 |
| **[STATUTE] (S4)** 4th standard — accuracy | DPA 2020 | s.27 | Data must be **accurate** and, where necessary, kept up to date. | Provide correction tools; honour rectification (row R5). | DPA 2020 s.27 |
| **[STATUTE] (S5)** 5th standard — storage limitation + disposal | DPA 2020 | s.28 | Data **not kept longer than necessary** for the purpose; **disposal must follow the regulations** made under s.74. | Set and publish **retention periods**; build deletion/anonymisation tooling; dispose per the **Disposal of Personal Data Regulations 2024** [REG, confirm the approved methods]. The **permanent audit log** conflicts with this unless a managed deletion/anonymisation path exists. | DPA 2020 s.28; Disposal of Personal Data Regulations 2024 [REG] |
| **[STATUTE] (S6)** 6th standard — rights | DPA 2020 | s.29 | Process in accordance with data-subject rights (ss.6, 10–13). | Build the rights processes (rows R1–R6). | DPA 2020 s.29 |
| **[STATUTE] (S7)** 7th standard — security + processor contracts | DPA 2020 | s.30 | **Appropriate technical & organisational measures** against unauthorised/unlawful processing and accidental loss/destruction/damage, and to **notify the Commissioner without undue delay** of any breach (s.30(1)). Measures appropriate to the harm and the nature of the data (s.30(2)); staff awareness (s.30(3)). Where a **processor** is used, the controller must **choose a processor giving sufficient security guarantees** (s.30(4)) and **does not comply unless** processing is under a **written contract** by which the processor acts **only on the controller's instructions** and assumes **equivalent obligations** (s.30(5)). Measures "include" pseudonymisation/encryption, confidentiality/integrity/availability/resilience, restorability, and regular testing (s.30(6)). | Requires signed **written DPAs** with Google/Firebase, Vercel, EmailJS, SMTP2GO meeting s.30(5). Describe measures **factually** in the Notice (role/institution access rules, TLS, encryption at rest by the host, App Check, session controls, forced password change, audit log). **Fix** the public default passwords and personal data left in `localStorage`/`sessionStorage`. | DPA 2020 s.30 |
| **[STATUTE] (S8)** 8th standard — overseas transfers | DPA 2020 | s.31 | **No transfer outside Jamaica unless that State/territory ensures an adequate level of protection** (adequacy judged on the data's nature, origin, destination, purposes/period, the destination's law and international obligations, codes of conduct, and security — s.31(2)). The standard does **not** apply where (s.31(4)): **(a) the data subject consents to the transfer**; (b)/(c) contractual necessity; (d) substantial public interest; (e) legal proceedings/advice/rights; (f) vital interests; (g) public-register data; **(h) terms of a kind approved by the Commissioner**; **(i) a transfer authorised by the Commissioner**; (j) national security/crime. The Minister may list adequate States; the Commissioner rules on adequacy where none is listed (s.31(5)–(7)). | **All main data go to the US** (Firestore `us-central1`, Auth, Realtime DB, EmailJS; Vercel US). **No Jamaican adequacy finding for the US is known** `[CONFIRM: check any Ministerial adequacy order]`. ⇒ rely on **s.31(4)(a) explicit informed consent to the transfer** (guardian's, for a minor) **plus contractual safeguards**, and ideally seek **Commissioner-approved terms/authorisation (h)/(i)**. State the US, the providers, and the safeguards in the Notice. | DPA 2020 s.31 |

### 4.4 Data-subject rights and their statutory deadlines

| Requirement | Applicable law/regulation | Section | What the law requires | How it affects the SMS | Official source |
| --- | --- | --- | --- | --- | --- |
| **[STATUTE] (R1)** Right of access | DPA 2020 | s.6 | On written request: confirm whether data are processed and give a description of the data, purposes and recipients **free of charge**; and, on payment of the prescribed fee, communicate the data in **intelligible form** plus its source. Comply **promptly and in any event within thirty days** (s.6(4)) of having the request (and any fee). | Build a per-person access/export process with a **30-day** clock; verify identity (s.8); redact third-party data (s.8(2)). | DPA 2020 ss.6–8 |
| **[STATUTE] (R2)** Data portability | DPA 2020 | s.6(2)(c)(ii) | Where technically feasible, on payment, transmit to another controller, in a **structured, commonly used, machine-readable format**, the data the subject provided. | Offer JSON/CSV export. | DPA 2020 s.6 |
| **[STATUTE] (R3)** Right to prevent processing | DPA 2020 | s.11 | By written notice on stated grounds (unwarranted substantial damage/distress; incomplete/irrelevant data; prohibited processing; data kept longer than any law allows), require the controller to cease/not begin; the controller must give a written response **within twenty-one days** (s.11(4)). Does not apply where an s.23(1) condition is met. | Build a request channel with a **21-day** response. | DPA 2020 s.11 |
| **[STATUTE] (R4)** Automated decision-taking | DPA 2020 | s.12 | The subject may require that no decision significantly affecting them is based **solely** on automated processing (evaluating performance, reliability, conduct, etc.); notice and reconsideration rights apply (30-day steps). | The app makes **no** solely-automated significant decisions; state so. | DPA 2020 s.12 |
| **[STATUTE] (R5)** Rectification / erasure | DPA 2020 | s.13 | On written request, the controller must **within thirty days** determine whether to rectify. "**Rectify**" = **amend, block, erase or destroy** as needed; "inaccuracy" includes any error or omission. Notify downstream recipients (12-month look-back). Appeal to the Commissioner. | This is the Act's rectification/erasure right — build a **30-day** correction/erasure process covering Auth, Firestore, photos, registrations and provider copies. | DPA 2020 s.13 |
| **[STATUTE] (R6)** Exercise of a minor's / incapacitated person's rights | DPA 2020 | s.5, s.9(1)(b) | A **minor's** rights (and consents) are exercised by a **parent or legal guardian** (or by the minor where the law recognises capacity). | Verify a requester is the linked guardian before acting on a student's data. | DPA 2020 ss.5, 9 |
| **[STATUTE] (R7)** Complaint to the regulator | DPA 2020 | ss.4, 11(5), 13(5) | Data subjects may complain to the Commissioner, who may order compliance. | State the OIC as the complaint route in the Notice. | DPA 2020; oic.gov.jm |

### 4.5 Controller obligations: registration, DPO, DPIA, breach

| Requirement | Applicable law/regulation | Section | What the law requires | How it affects the SMS | Official source |
| --- | --- | --- | --- | --- | --- |
| **[STATUTE] (C1)** Register before processing | DPA 2020 | s.15, s.16 | Personal data must **not be processed unless the controller's registration particulars are on the register** (s.15). Particulars (s.16(2)) include name/address/contact; any representative; **the DPO's details**; a description of the data and categories of subjects; purposes; recipients; **the names of any States/territories outside Jamaica to which data are or may be transferred**; and whether a public authority; plus a description of security measures. | The operator (and any institution that is a controller in its own right) **must register with the OIC** and **name the US transfer destinations** and the DPO in the particulars. | DPA 2020 ss.15–16 |
| **[STATUTE]/[OIC] (C2)** Registration mechanics, fees, renewal | DPA 2020 + OIC | s.17; OIC | Public register maintained by the Commissioner; **annual renewal — no entry kept beyond twelve months except on payment** (s.17(3)). **[OIC]** Registration opened **1 June 2024**; first registration year **1 Dec 2023 – 30 Nov 2024**; **annual renewal by 1 December**; priority for **all public authorities and controllers processing an estimated 10,000+ data subjects in Education, Finance, Health, ICT, Tourism/Hospitality**. Fees: **companies & public authorities J$25,000; partnerships J$15,000; sole traders/individuals J$7,500**. | **Education is a named priority sector**; a platform processing 10,000+ subjects should register promptly. Budget the fee by legal form; renew by **1 Dec** each year. | DPA 2020 s.17; oic.gov.jm registration pages; jis.gov.jm |
| **[STATUTE] (C3)** Offence of processing without registration | DPA 2020 | s.18 | Processing to which s.15(1) applies without complying with s.16 is an **offence**: on summary conviction (Parish Court) a **fine up to J$2,000,000 or imprisonment up to six months**; due-diligence defence. | Register before processing real data; keep evidence of due diligence. | DPA 2020 s.18 |
| **[STATUTE] (C4)** Appoint a Data Protection Officer | DPA 2020 | s.20 | A controller **must appoint an appropriately qualified, independent DPO** if it **(a)** is a public authority; **(b) processes or intends to process sensitive personal data or criminal-conviction data**; **(c) processes personal data on a large scale**; or (d) is in a class the Commissioner prescribes. The DPO monitors compliance independently, consults the Commissioner, handles contraventions and assists data subjects (s.20(3)); the controller must **notify the Commissioner** of the DPO's details (s.20(4)). | The SMS **processes sensitive data (s.20(6)(b))** and is likely **large-scale (c)** ⇒ a **DPO is mandatory**. Public-school customers trigger (a) for themselves. Appoint and notify the OIC. | DPA 2020 s.20 |
| **[STATUTE] (C5)** Prior assessment of "specified processing" (DPIA-type) | DPA 2020 | s.19, s.74(3)(c) | For **"specified processing"** — a description set by **Ministerial order** as particularly likely to cause substantial damage/distress or significantly prejudice rights — the controller must provide the s.16(1) information and **not carry it on** until the Commissioner has assessed it (30 days, extendable 14 days once). Contravention is a serious offence: summary **J$5m / 5 years**, or on indictment up to **10 years**. | Whether the SMS's children's-data processing is "specified processing" **depends on the s.19(1) order** `[CONFIRM: content of the Ministerial order / any DPIA regulation]`. Treat a **data-protection impact assessment** as prudent regardless. | DPA 2020 ss.19, 74 |
| **[STATUTE] (C6)** Breach notification — to the Commissioner | DPA 2020 | s.21(3), s.30(1)(b) | The controller must report to the Commissioner **any contravention of the standards and any security breach affecting or that may affect personal data, within seventy-two (72) hours** of becoming aware. The report must state the facts, the nature, the categories and numbers affected, mitigation, consequences, and the DPO's contact (s.21(4)). | Build a 72-hour breach playbook; set up a monitored mailbox for provider breach notices (Google/Vercel/EmailJS/SMTP2GO) so the clock starts promptly. | DPA 2020 ss.21, 30 |
| **[STATUTE]/[REG] (C7)** Breach notification — to affected data subjects | DPA 2020 | s.21(5) | On becoming aware of a breach, the controller must **notify each affected data subject** of the nature, mitigation and the DPO's contact — **"in such form and manner, and within such time, as shall be prescribed."** | **The 72-hour figure applies to the Commissioner (C6), not necessarily to data subjects.** The data-subject timeframe/form is set by the **2024 Regulations** `[REG — confirm the prescribed time and form]`. Do **not** state a fixed data-subject deadline in the Notice until confirmed. | DPA 2020 s.21(5); Data Protection Regulations 2024 [REG] |
| **[STATUTE] (C8)** Annual report / assessment & records | DPA 2020 | ss.16(1), 56; s.74(2)(b) | Keep particulars current (report changes); the Minister may prescribe **retention periods** by regulation (s.74(2)(b)). *(The "annual assessment within 90 days" item in the earlier guide could not be located in the primary text as a controller duty under this numbering — treat as [ASSUMPTION], confirm against the Regulations.)* | Keep a record of processing; watch for prescribed retention periods in the Regulations. | DPA 2020 ss.16, 74 |

### 4.6 Enforcement, penalties and civil liability

| Requirement | Applicable law/regulation | Section | What the law requires | How it affects the SMS | Official source |
| --- | --- | --- | --- | --- | --- |
| **[STATUTE] (P1)** Breach of the standards | DPA 2020 | s.21(2) | Processing in contravention of the standards, or failing to make a required breach report, is an **offence**: summary **J$2m / 2 years**; on indictment up to **7 years**; due-diligence defence. | The core compliance offence; the standards (ss.22–31) are the compliance baseline. | DPA 2020 s.21 |
| **[STATUTE] (P2)** Corporate fine up to 4% of turnover | DPA 2020 | s.68 | **Notwithstanding any other penalty, where a body corporate commits an offence under the Act it is liable to a fine up to four percent (4%) of its annual gross worldwide turnover** for the preceding year of assessment. Directors/officers are personally liable for offences committed with their consent, connivance or neglect (s.68(3)). | If the operator is a company, the maximum exposure is **4% of worldwide turnover** plus personal director liability — a strong reason to close the P0 gaps. | DPA 2020 s.68 |
| **[STATUTE] (P3)** Civil liability to data subjects | DPA 2020 | s.69 | An individual who suffers **damage** (and, in defined cases, **distress**) from a controller's contravention is entitled to **compensation**; defence of having taken all reasonable care. | A **private right of action** exists. The Terms' liability section cannot exclude it; the Privacy Notice should not over-promise security. | DPA 2020 s.69 |
| **[STATUTE] (P4)** Other offences / regulation offences | DPA 2020 | ss.19(5), 30(7), 61, 63, 74(2)(d) | Specified-processing offence (up to 10 yrs); wilfully breaking encryption/pseudonymisation (s.30(7), up to J$2m); unlawfully obtaining/disclosing data (s.61); "enforced subject access" prohibited (s.63); regulation offences up to **J$5m** (s.74(2)(d)). | Underpins the Terms' acceptable-use clauses and staff confidentiality. | DPA 2020 ss.19, 30, 61, 63, 74 |
| **[STATUTE] (P5)** Who may prosecute | DPA 2020 | s.67 | Proceedings only by the **DPP**, or by the **Commissioner with the DPP's consent**. | Context for enforcement risk. | DPA 2020 s.67 |

### 4.7 Transition and commencement

| Requirement | Applicable law/regulation | Section | What the law requires | How it affects the SMS | Official source |
| --- | --- | --- | --- | --- | --- |
| **[STATUTE] (T1)** Transition to full compliance | DPA 2020 | s.76 | A controller must achieve **full compliance** (in particular with the standards) **within two years of the earliest appointed day** under s.1(1); no proceedings for processing done **in good faith** during that window. | **[OIC/JIS]** The full operative provisions came into force **1 December 2023**; the two-year full-compliance window therefore runs to about **1 December 2025** `[CONFIRM against the appointed-day notices]`. The transition period is, on this reading, **effectively over or nearly so** — compliance is expected now. | DPA 2020 s.76; jis.gov.jm |

---

## 5. Children, sensitive data and the special-care areas

This is the highest-risk area and the one the brief singles out. Everything is **[STATUTE]** from the DPA unless marked.

| Processing | Why it is special | What the law requires | Action |
| --- | --- | --- | --- |
| **A child's data generally** | A minor is under 18 (s.2); most students are minors | Rights and consents run through a **parent/legal guardian** (ss.5, 9(1)(b)(iii)); no direct marketing to children (s.10) | Guardian acceptance/consent recorded against the student; no child marketing/profiling |
| **Photographs** | A photo/facial image is within **"biometric data"** where used for unique identification (s.2) ⇒ potentially **sensitive** | Needs **written consent** or another s.24 condition; minimisation (s.26) | Make photos optional with their **own written consent line**; avoid using them for identification features without a condition |
| **Health in absence reasons** | "Physical or mental health or condition" is **sensitive** (s.2) | Written consent or an s.24 condition; need-to-know only | Keep health-tinged reasons minimal; restrict visibility; do not email such detail |
| **Disciplinary free-text** | May touch "the alleged commission of any offence" ⇒ **sensitive** (s.2) | Written consent or an s.24 condition; minimisation | Prefer structured categories; length limit; restrict visibility; guidance to staff |
| **ID number (TRN / Citizen ID)** | High-risk identifier; TRN is a "general identifier" under s.22(8)–(9) whose use may be subject to **prescribed conditions** [REG, confirm] | Minimisation (s.26); any prescribed general-identifier conditions | Make optional or drop unless a legal need exists; mask in lists |
| **Child-protection / welfare information** | Governed additionally by the **CCPA** | **[STATUTE]** Reports to the Children's Registry are **secret and confidential**; a person must not disclose the report or information from which a child's identity may be inferred, except in proceedings or as the Act permits (CCPA s.7); **mandatory reporting** duty with penalty for failure (CCPA s.6); restrictions on publishing a child's identifying particulars in proceedings (CCPA ss.44–45) | Handle any welfare/safeguarding information on a strict need-to-know basis; never put such detail in emails; train staff on the reporting duty | CCPA ss.6, 7, 44–45 |

---

## 6. Other Jamaican laws that materially apply

| Requirement | Law | Section | What the law requires | How it affects the SMS | Source |
| --- | --- | --- | --- | --- | --- |
| **[STATUTE] (O1)** Child definition, reporting, confidentiality | Child Care and Protection Act | ss.6, 7, 44–45 | Child = under 18; **mandatory reporting** of a child in need of care/protection (penalty up to J$500,000 / 6 months for failure, s.6); **confidentiality** of reports and of a child's identity (s.7); publication restrictions (ss.44–45) | Welfare data handled narrowly; staff aware of reporting duty; no identifying detail in communications | CCPA |
| **[STATUTE] (O2)** School record-keeping | Education Act | s.19 | Every **public** educational institution must keep a **"Register of Students"** in the prescribed form with the prescribed particulars for all students | Gives public schools a **statutory basis** (s.23(c)/(e) DPA) for keeping core student records; the **particulars and any retention rules are set by the Education Regulations** `[CONFIRM with the Ministry of Education]` | Education Act s.19 |
| **[STATUTE] (O3)** Electronic records & signatures | Electronic Transactions Act | ss.6, 7, 8 | Electronic information is "in writing" if readily accessible and retainable (s.7); electronic/encrypted signatures satisfy signature requirements (s.8); electronic transactions have legal validity (s.6) | **Click-through acceptance** of the Terms and consent is legally valid if a reliable record (version, time, identity) is kept; **electronic consent can satisfy the DPA's "in writing" requirement for sensitive data** (s.24(a)) | ETA ss.6–8 |
| **[STATUTE] (O4)** Computer-misuse offences | Cybercrimes Act | ss.3, 4 | **Unauthorised access** to a program or data is an offence (s.3): summary **J$3m/3 yrs**, **J$4m/4 yrs if damage**, **J$5m/5 yrs** repeat; on indictment up to **7/10/15 years**. **Access with intent** to commit/facilitate another offence (s.4). "Without authorization" = not entitled to control it and no consent from someone who is (s.2(4)). | Underpins the Terms' **acceptable-use** rules: staff/users must not access data beyond their role; guessing default passwords or misusing the email feature could be offences; supports the confidentiality obligations | Cybercrimes Act ss.2–4 |
| **[ASSUMPTION] (O5)** Constitutional privacy | Constitution — Charter of Fundamental Rights and Freedoms (2011) | s.13(3)(j) [confirm] | Protects respect for private and family life and the privacy of communications | Background to how courts read the DPA; not a direct operational requirement | `[CONFIRM wording]` |
| **[STATUTE] (O6)** Not materially applicable | Telecommunications Act | — | Governs telecommunications carriers/providers | The SMS is **not** a telecoms carrier; the Act is **not materially applicable**. (Noted to record that it was considered.) | Telecommunications Act |

---

## 7. Secondary legislation — the 2024 Regulations (confirmed to exist; contents to verify)

The DPA is given operational detail by regulations under **s.74**. These were **not read from primary text**; they are confirmed to exist from the OIC's own site and must be read before relying on any specific. **[REG — verify all specifics with the OIC.]**

| Instrument | What it is understood to govern | Status |
| --- | --- | --- |
| **Data Protection (Data Controller Registration) Regulations 2024** | Registration process, forms, fees | **Named on the OIC site** [OIC]; fees as in row C2 |
| **Disposal of Personal Data Regulations 2024** | Approved methods of disposing of personal data (links to s.28) | **Named on the OIC site** [OIC] |
| Other regulations (breach procedure, DPO qualifications, consent standards, DPIA) | Would set the s.21(5) data-subject notification time/form, DPO qualifications, and the s.19 specified-processing description | **[ASSUMPTION — confirm existence and content.]** The earlier guide asserted a general "Data Protection Regulations 2024"; this has **not** been verified against primary text |

---

## 8. What is **not** established — assumptions for counsel to confirm

1. **[ASSUMPTION]** The **controller/processor model** (sole controller vs institution-as-controller/joint) — §3.
2. **[ASSUMPTION]** Whether the **US** is treated as adequate under any **Ministerial order**, and the best s.31(4) basis for the transfer (consent + contract, or Commissioner-approved terms/authorisation) — row S8.
3. **[ASSUMPTION]** Whether the SMS falls within **"specified processing"** under the s.19(1) **Ministerial order** (triggering prior assessment) — row C5.
4. **[REG]** The **data-subject breach-notification time and form** (s.21(5)) and whether a general breach/DPO/DPIA regulation exists — row C7, §7.
5. **[REG]** The **approved disposal methods** and any **prescribed retention periods** (ss.28, 74) — row S5.
6. **[REG]** Any **conditions on general identifiers** (TRN) under s.22(8)–(9) — §5.
7. **[ASSUMPTION]** The exact **appointed day(s)** and therefore the precise end of the s.76 two-year transition — row T1.
8. **[ASSUMPTION]** **Education Regulations** particulars/retention for the Register of Students — row O2.
9. **[ASSUMPTION]** Whether any customer is a **public authority** (public school) and the division of duties that follows (s.72) — §3.
10. **[ASSUMPTION]** The **"no pre-ticked boxes"** standard for consent (not in s.9 text; likely regulatory/best practice) — row L3.

**Do not** present any of the above as settled Jamaican law in the public documents until confirmed.

---

## 9. Sources

**Primary legislation (read from the official texts in `Documents/Policies/jamaican-law/`):**
- *The Data Protection Act, 2020* (Act 7 of 2020) — official Gazette print; online: `https://japarliament.gov.jm/attachments/article/339/The%20Data%20Protection%20Act,%202020.pdf`
- *The Child Care and Protection Act* — `https://laws.moj.gov.jm/library/statute/the-child-care-and-protection-act`
- *The Education Act* — Ministry of Justice / Laws of Jamaica
- *The Electronic Transactions Act* — Laws of Jamaica
- *The Cybercrimes Act* (Act 3 of 2010, as amended by 31 of 2015) — Laws of Jamaica

**Regulator and government (accessed 2026-10-03):**
- Office of the Information Commissioner — `https://oic.gov.jm` (registration pages, press releases, the public register)
- Jamaica Information Service — `https://jis.gov.jm/registration-of-data-controllers-begins-june-1/` and `https://jis.gov.jm/information/get-the-facts/the-data-protection-act-and-citizens-rights/`

**Reliability note.** All DPA section numbers and quoted requirements were taken from the primary scanned Act text and are reliable. Registration mechanics, fees, commencement (1 Dec 2023) and the named 2024 Regulations are from the OIC and JIS and are tagged **[OIC]**. Everything tagged **[REG]** or **[ASSUMPTION]** must be confirmed against the Regulations and with a Jamaican attorney before the public documents are relied upon.
