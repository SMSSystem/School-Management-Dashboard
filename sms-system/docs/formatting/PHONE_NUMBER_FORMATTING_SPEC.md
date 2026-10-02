# NANP-Aware Phone Number Formatting — Feature Spec

> **Status:** Revised 2026-10-02. Planned — not yet implemented (spec written before code, per this repo's standing convention). Rewritten after review: the original proposal's partial-typing behavior did not work as described, its call-site and collection inventories were wrong, and it did not cover several places phone numbers are entered or shown.
> **Feature:** Fixes `formatPhone()`'s "group every digit string into 3s" logic, which mis-formats any NANP number (`+1` — the US, Canada, Jamaica and about 20 other countries and territories) whose grouping is 1-3-3-4, not 3-3-3-2. Adds NANP-aware formatting that works as the user types, canonicalizes stored NANP numbers to `+1-XXX-XXX-XXXX`, formats stored values at display time, applies the formatter to the entry points that skip it today, tightens the shared validation pattern, and backfills already-stored values.
> **Route:** No new routes. Affected: every form and page that collects or shows a phone number (§4.5, §4.6).
> **Primary roles:** Every role that can enter or view a phone number. A data-correctness fix, not a permissions change.
> **Resolves:** A reported display bug on the student-role "Institution Profile" view, where GENR8-3D Academy's phone rendered as `+187 680 189 72` instead of `+1-876-801-8972`.

---

## 1. Overview

`formatPhone()` (`src/lib/phone.ts`) is the shared formatter behind the phone fields of seven forms. Anything starting with `+`, or with more than 10 digits, is grouped into threes with no awareness of country-code structure:

```text
input digits: 18768018972
groups of 3:  187 680 189 72   →  "+187 680 189 72"   (wrong)
```

A NANP number is **1-digit country code + 3-digit area code + 3-digit exchange + 4-digit subscriber** (1-3-3-4). The bug is also a **stored-data** problem: the formatted string is what gets written to Firestore, and read-only views render it verbatim. The digits are intact (`+187 680 189 72` still strips to `18768018972`), so reformatting is safe: nothing is guessed, only separators change.

This spec makes the formatter NANP-aware **progressively** (as digits are typed, not only at the 11th), defines one canonical stored form, and covers the places the original proposal missed.

---

## 2. Background / Investigation Findings

Confirmed against `main` at `3c69872`. Line numbers drift; files and functions are named.

- **Seven forms import `formatPhone`**, not eight: `AdminCreateUserForm`, `StudentForm`, `TeacherForm`, `ParentForm`, `InstitutionAdminForm`, `BrandForm` and `institution-profile`. The public registration form (`register/[institutionId]`) imports no formatter (only a comment mentions one): visitors' student `phone`/`phone2` and `guardian.contact` are stored **as typed**.
- **Entry points with no formatter at all:** the **Profile page's** self-edit phone field (`profile/index.tsx`), the public **registration** form, and the **student import** (`importStudents.ts#parsePhoneCell` validates with `phonePattern` and stores the trimmed cell as-is; its template sample is `+1 555-123-4567`). Conversion of a registration copies `guardian.contact` straight into the new parent's `users.phone` (`ConvertToAccountsPanel`).
- **`InputField` applies `formatter` on change and to `defaultValue`.** `institution-profile` and `BrandForm` also reformat the **stored** value on load (`formatPhone(institution?.phone ?? '')`), so once the formatter is fixed, merely opening and saving an institution's profile heals its stored phone. This is why institutions need no data fix beyond the backfill for institutions nobody edits.
- **Display sites render stored text verbatim:** the read-only Institution Info card (now a `tel:` link built from the formatted string), Profile, Teachers `[id]`, Students `[id]`, the Parents list, and the **Report Card and Progress Report PDFs** ("Tel: …", from `institutionPhone` snapshotted into each generated report by `generateReportCard.ts` / `generateProgressReport.ts`).
- **Where phone numbers are stored:** `institutions/{id}.phone`; `users/{uid}.phone` and `.phone2`; `institutions/{id}/registrations` (student `phone`/`phone2`, `guardian.contact`); and the `institutionPhone` snapshots on generated report cards and progress reports. (`ParentDocument.phone` in `firebase.ts` is a declared but unused type.)
- **The validation pattern lives in three places:** `phonePattern` in `src/lib/fieldPatterns.ts`; a local copy in `ParentForm.tsx`; and a `matches('^\\+?[0-9 ()-]{7,20}$')` check in `firestore.rules` on registrations' `student.phone`, `student.phone2` and `guardian.contact`. It checks **characters, not digits** (`-------` passes) and allows up to 20 digits where E.164 allows at most 15. Firestore rules use the **RE2** regex engine, which has no lookahead, so a "count the digits" rule must be written without it (§4.4).
- **No phone test file exists.** `phone.ts` is exercised only indirectly (`importStudents.test.ts` covers `phonePattern`), so any "existing branch is unchanged" claim needs a characterization test first (§6).
- **No `country` field** exists on institutions or users, so ambiguous numbers can't be resolved against a declared country. The only corroborating context is the institution's own phone number.
- **NANP numbering:** numbers are `NXX-NXX-XXXX` where **N is 2–9** for both the area code and the exchange; `+1` is the only country code beginning with `1`, so any input whose first digit is `1` is NANP-led, and a bare number can never legitimately start with `1` as an area code ([NANP overview](https://www.howtocallabroad.com/nanp.html)). Jamaica has area codes 876 and 658 (the latter added in 2019).
- **No phone library is installed**, and none is added: `libphonenumber-js` is about 80 KB of metadata plus about 65 KB of code ([npm](https://www.npmjs.com/package/libphonenumber-js)), against a build that already warns about a 3.7 MB entry chunk (`ISSUES_AND_GAPS.md` #40).
- **Backfill precedent:** `scripts/backfill-department-ids.mjs` (Admin SDK, flags, batched writes, idempotency, summary counts); plain-Node `.mjs` scripts cannot import TypeScript, which drives §4.1's module choice.

---

## 3. Design Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Library vs hand-rolled | Hand-rolled, NANP only | Bundle weight (§2). Non-`+1` numbers keep today's group-by-3 output. |
| Canonical stored form | `+1-XXX-XXX-XXXX` for every NANP number | One shape for equal numbers (domestic 10-digit entries no longer stay `(XXX) XXX-XXXX` forever). |
| Live typing | **Progressive NANP** for input whose first digit is `1` (with or without `+`), capped at 11 digits; the domestic `(XXX) XXX-XXXX` mask stays for bare numbers not starting with `1`; everything else keeps the generic grouping | A leading `1` can only be the country code (area codes start 2–9), so inferring NANP from it is safe and makes partial entry format correctly. |
| Bare 10-digit numbers | Keep the domestic mask while typing; canonicalize to `+1-…` **on blur or submit**, and only when the digits are NANP-valid **and the institution's own phone is a `+1` number** | A bare number can't be proven NANP (no country context, §2). Typing-time conversion would fight a user about to type a country code. The institution-phone check is the only available corroboration. |
| Institution's own phone field | Never self-canonicalizes a bare number | There is no independent corroboration for it; a `+1`-led entry is handled by the live formatter. |
| Display of stored values | Format NANP-shaped values at render time; leave everything else exactly as stored | Fixes how existing data looks (including report PDFs) without waiting for or depending on a backfill. |
| Validation | Require 7–15 **digits** in the shared pattern, the `ParentForm` copy and the registrations rule | The pattern should validate a phone number, not just a character set. |
| Backfill | Users and institutions only; dry-run by default; same gate as live canonicalization; review file for bare-number conversions; before-values backup | The only data whose display this fix changes. Registrations and report snapshots are left as records (§9). |
| Rollout | All forms at once | They share one function; there is no per-form sequencing. |

---

## 4. Design

### 4.1 Shared pure module (plain JS, importable by the app and by `.mjs` scripts)

`src/lib/phoneNanp.js` with a hand-written `phoneNanp.d.ts`. Plain JavaScript so `scripts/backfill-nanp-phone-format.mjs` and `phone.ts` share **one** implementation and one set of tests (no script-local copy to drift).

```js
// "1" + 10 digits → the canonical +1-XXX-XXX-XXXX, or null if not NANP-valid.
export function formatNanpDigits(digits) {}
// Area code and exchange must each start with 2–9 (NXX).
export function isNanpValid(tenDigits) {}
// Progressive "+1-876-801-8" style formatting for a digit string starting with 1.
export function formatNanpProgressive(digits) {}
// True for strings whose digits are exactly 1 + 10 (any separators), NANP-valid.
export function isNanpPhone(value) {}
// Decide what to do with one stored/typed value (§4.3, §4.7).
export function planPhoneChange(raw, ctx) {} // → { action, next?, reason? }
```

### 4.2 `formatPhone()` — live formatting (`src/lib/phone.ts`)

Behavior, in order:

1. Empty input → returned unchanged; no digits → `'+'` if the input started with `+`, else `''`.
2. **First digit is `1`** (with or without `+`): NANP-led. Cap at 11 digits and format progressively, joining the non-empty parts with `-`: `1` → `+1`, `1876` → `+1-876`, `1876801` → `+1-876-801`, `18768018972` → `+1-876-801-8972`. A twelfth digit is ignored.
3. No `+` and 10 digits or fewer: the existing domestic mask `(XXX) XXX-XXXX`, unchanged.
4. Otherwise: the existing generic grouping, unchanged (digits capped at 15, groups of three after `+`).

Properties the tests assert (§6): idempotent (`formatPhone(formatPhone(x)) === formatPhone(x)`), and deleting a character one at a time from any formatted value yields a valid shorter value (no stuck separators, since trailing hyphens are never emitted). The caret still jumps to the end after a mid-string edit; that is how the app already behaves and is out of scope (§9).

### 4.3 `canonicalizePhone()` — blur and submit

```ts
canonicalizePhone(value: string, ctx: { institutionPhone?: string | null }): string
```

- If the value is already `+1-…`-led, or doesn't qualify, return it unchanged.
- If it is a **bare 10-digit** number, NANP-valid (`isNanpValid`), **and** `isNanpPhone(ctx.institutionPhone)`, return `+1-XXX-XXX-XXXX`.
- Anything else, including a missing or malformed institution phone, is returned unchanged. A deliberate consequence: if the institution phone itself is wrong, none of its bare numbers convert until it is fixed.

Called from each user-phone field's blur handler and again in the form's submit path (a safety net for browsers or flows that skip blur). `InputField` gains an optional `onBlurFormatter` prop so the four forms that use it need no extra code; forms using raw inputs call it in `onBlur`. The institution comes from `useAuth().institution?.phone`. A `super_admin` creating an account for another institution has no context for it unless that institution's phone is already loaded; if not, the value is left in its domestic mask.

### 4.4 Validation pattern (`fieldPatterns.ts`, `ParentForm.tsx`, `firestore.rules`)

```ts
// 7–15 digits (E.164 maximum is 15), optional leading "+", up to two
// separators ( space ( ) - ) between digits. RE2-compatible: no lookahead,
// because firestore.rules uses RE2.
export const phonePattern = /^\+?([ ()-]{0,2}[0-9]){7,15}[ ()-]{0,2}$/;
```

- `ParentForm.tsx` imports it instead of keeping its own copy.
- The registrations rule's three `matches(...)` checks change to the identical expression (`'^\\+?([ ()-]{0,2}[0-9]){7,15}[ ()-]{0,2}$'`). The client pattern and the rule must stay identical (the existing comment says so; the test in §6 pins them together).
- Every string `formatPhone` can produce (including the longest generic form, `+123 456 789 012 345`) matches the new pattern; a property test checks this.
- Existing stored data that doesn't match isn't rewritten by validation; it only matters when a form re-validates on save.

### 4.5 Entry points that gain the formatter

| Entry point | Change |
| --- | --- |
| Seven existing forms | Fixed by `phone.ts`; the user-phone ones also get blur canonicalization (§4.3). |
| **Profile page** phone (self-edit) | Add `formatPhone` on change and blur canonicalization. |
| **Public registration form** (student `phone`, `phone2`, `guardian.contact`) | Add `formatPhone` on change. No blur canonicalization (the public visitor has no institution context); stored as formatted, bare numbers keep the domestic mask. |
| **`ConvertToAccountsPanel`** | When writing the new user/parent from a registration, apply `canonicalizePhone` with the institution's phone, since the converting admin has that context. |
| **Student import** (`parsePhoneCell`) | Format each phone cell with `formatPhone` and canonicalize with the institution's phone when the import page has it; otherwise the formatted (domestic-mask) value is stored. The sample `+1 555-123-4567` has exchange `123`, which is not NANP-valid (exchange starts with 1); replace it with a valid-looking example (e.g. `+1 876-555-0123`) so the template round-trips. `importStudents.test.ts`'s phone expectations are updated to the formatted values. |

### 4.6 Display sites and `tel:` links

`formatPhoneForDisplay(raw)` returns the canonical form for NANP-shaped stored values and the stored string **unchanged** for everything else (it never regroups an unknown value). Used at render time in the Institution Info card, Profile, Teachers `[id]`, Students `[id]`, the Parents list, and the Report Card and Progress Report PDFs (this fixes how already-generated reports print their "Tel:" line **without** rewriting stored snapshots).

`telHref(raw)` builds `tel:` + (`+` if present) + digits only, so spaces, hyphens and parentheses never reach the URI.

### 4.7 `planPhoneChange()` — shared decision used by the backfill (and tested directly)

```js
// ctx: { institutionIsNanp: boolean | null, allowBare: boolean }
planPhoneChange(raw, ctx) → one of:
  { action: 'unchanged' }                                  // empty, non-string, already canonical, non-NANP
  { action: 'convert', next, kind: 'explicit' }            // 11 digits, leading 1, NANP-valid
  { action: 'convert', next, kind: 'bare' }                // 10 digits, NANP-valid, institutionIsNanp, allowBare
  { action: 'skip', reason }                               // would convert but fails the gate (invalid NXX; bare with non-NANP/unknown institution)
```

`allowBare` is false for the institutions collection (an institution's own bare number has no corroboration).

### 4.8 Backfill script — `scripts/backfill-nanp-phone-format.mjs`

Follows `backfill-department-ids.mjs`'s structure and imports `planPhoneChange` from `src/lib/phoneNanp.js`.

- **Dry-run by default**; writes only with `--apply`. Optional `--institution=<id>` scopes the run to one institution (its document and its users), which also bounds reads.
- **Reads institutions first**, builds `id → isNanpPhone(phone)`, then reads `users` (all, or only `where('institutionId','==',id)`) and plans each of `phone`/`phone2`. `super_admin` users (institution `'*'`) are only converted when explicit (`kind: 'explicit'`).
- **Outputs, under `scripts/logs/`** (confirm the folder is git-ignored): a **review file** listing every `bare` conversion with before and after, every `skip` with its reason, and a summary; and, in `--apply` mode, a **before-values backup** (`{ "path": { "field": before } }`) written *before* the first batch commits so a run can be reversed.
- **Batched writes** (450 per batch, `merge`), **idempotent** (a canonical or non-NANP value yields `unchanged`), summary counts for changed, skipped (by reason) and unchanged.
- **Spark note:** the Admin SDK's reads count against the free daily quota (50k). A full run reads every institution and every user once; run per institution (`--institution=`) for large tenants.
- Numbers that fail the gate are **never rewritten** and are always listed, in dry-run and live runs.

---

## 5. Firestore Rules

One change: the three phone `matches(...)` checks on registrations (`student.phone`, `student.phone2`, `guardian.contact`) take the new digit-counting expression from §4.4. `users` and `institutions` have no phone shape validation, so the backfill and normal app writes need no rules change. The rules change deploys with the app; neither ordering breaks anything (the app's formatted values satisfy both the old and new expressions).

---

## 6. Testing Considerations

- Standing gate: `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build`.
- **Characterization tests first, committed before the change:** the domestic mask at 1–10 digits, the generic grouping for `+44…`-style input, and idempotence, so "unchanged" claims have a baseline.
- **`formatPhone` (new):** progressive table — `1`, `18`, `187`, `1876`, `18768`, `187680`, `1876801`, `18768018`, `187680189`, `1876801897`, `18768018972` (with and without `+`); a twelfth digit is ignored; `+1` alone; bare numbers not starting with `1` keep the domestic mask; idempotence over the whole table; deleting one character at a time from `+1-876-801-8972` and re-formatting yields the expected prefix at every step.
- **`canonicalizePhone` / `planPhoneChange`:** valid bare + NANP institution → converts; valid bare + non-NANP, missing or malformed institution phone → unchanged / skipped; invalid NXX (exchange or area code starting 0 or 1) → skipped; explicit 11-digit → converts; already canonical → unchanged; `null`, empty and non-string → unchanged; institutions collection never converts bare.
- **`formatPhoneForDisplay` / `telHref`:** NANP stored values display canonically; `+44…` and unknown strings display exactly as stored; `telHref` strips separators and keeps a leading `+`.
- **Pattern:** accepts 7–15 digits in every form `formatPhone` produces; rejects `-------`, 6 digits and 16 digits; the client regex and the rule's expression are asserted textually identical.
- **Rules probe:** a registrations create with a 6-digit phone is denied and a valid formatted one is allowed (extend the registration/lockdown e2e probes).
- **Manual:** run the backfill in dry-run against real data, read the review file, then `--apply` for one institution; confirm GENR8-3D Academy's Institution Profile (the admin wizard and the read-only student card) shows `+1-876-801-8972`; confirm a generated report PDF's "Tel:" line prints it correctly.

---

## 7. Implementation Order

1. Characterization tests for today's `formatPhone` and `phonePattern`.
2. `src/lib/phoneNanp.js` + `.d.ts`, with unit tests.
3. `phone.ts` live formatter (§4.2) using it; `canonicalizePhone`, `formatPhoneForDisplay`, `telHref`.
4. Pattern change (§4.4) in `fieldPatterns.ts` and `ParentForm.tsx`; rules update (§5); rules probe.
5. Entry points (§4.5): blur canonicalization in the existing forms, then Profile, registration, `ConvertToAccountsPanel`, student import (and its sample and tests).
6. Display sites and `tel:` links (§4.6).
7. Backfill script (§4.8): dry-run, review, apply per institution.
8. Manual verification against GENR8-3D Academy.

---

## 8. Documentation

- Note the validation change (7–15 digits) and the canonical phone format in the user-facing import instructions if the template or its sample text is shown in `USER_GUIDE.md`.
- Add a one-line pointer in `ISSUES_AND_GAPS.md` for the deferred items in §9 if they are to be tracked.

---

## 9. Explicitly Out of Scope

- **Non-NANP formatting:** any country code other than `+1` keeps the generic group-by-3 output. A real fix needs `libphonenumber-js` or equivalent, declined for bundle weight (§2).
- **A per-institution `phoneCountryCode` field:** the proper fix for the bare-number ambiguity (it would let a bare number be interpreted against a declared country rather than inferred from the institution phone). A schema and profile-wizard change beyond a formatting fix; revisit if a non-NANP tenant appears.
- **E.164 storage with display-time formatting** (`+18768018972`): the long-term storage form (the new pattern and rules already accept it). It would remove the "two formats" question entirely but means normalizing every stored value and every display site; not requested.
- **Backfilling registrations and the report-card / progress-report `institutionPhone` snapshots:** left as records; display-time formatting (§4.6) corrects how snapshots print.
- **Caret preservation** when editing mid-string (the caret still jumps to the end on reformat): existing behavior of every formatted field.
- **Rewriting stored values that merely fail the new pattern:** validation applies on save only.
