# NANP-Aware Phone Number Formatting — Feature Spec

> **Status:** Planned — not yet implemented (spec written before code, per this repo's standing convention)
> **Feature:** Fixes `formatPhone()`'s naive "group every digit string into 3s" logic, which mis-formats any NANP number (`+1` country code — covers the US, Canada, Jamaica, and ~20 other countries/territories) whose grouping should be 1-3-3-4, not 3-3-3-2. Adds NANP-specific detection to the shared formatter (used by all 8 phone-collecting forms app-wide) and backfills already-corrupted stored values.
> **Route:** No new routes. Existing forms affected: `AdminCreateUserForm.tsx`, the public registration form (`register/[institutionId]/index.tsx`), `institution-profile/index.tsx`, `TeacherForm.tsx`, `StudentForm.tsx`, `BrandForm.tsx`, `ParentForm.tsx`, `InstitutionAdminForm.tsx` — all share one function, so none of them individually change.
> **Primary roles:** Affects every role that can view or enter a phone number — this is a data-correctness fix, not a permissions change.
> **Resolves:** A reported display bug on the student-role "Institution Profile" view, where GENR8-3D Academy's phone number rendered as `+187 680 189 72` instead of `+1-876-801-8972`.

---

## 1. Overview

`formatPhone()` (`src/lib/phone.ts:10-31`) is the single shared function behind every phone-number input field in this app — both for live formatting as someone types, and (confirmed by tracing `institution-profile/index.tsx`, see §2) for the actual string that gets written to Firestore. Its "international" branch (anything starting with `+`, or longer than 10 digits) groups the digit string into chunks of exactly 3, with zero awareness of country-code structure:

```
input digits: 18768018972
naive groups of 3: 187 680 189 72   →  "+187 680 189 72"  (wrong)
```

A NANP number (`+1`) is structured as **1 digit country code + 3-digit area code + 3-digit exchange + 4-digit subscriber number** — a 1-3-3-4 shape, not repeating groups of 3. This spec adds a NANP-specific branch to `formatPhone()` and backfills the two collections that store phone numbers, per the decisions in §3.

---

## 2. Background / Investigation Findings

- **The bug produces stored data, not just a display artifact.** `institution-profile/index.tsx`'s phone field calls `formatPhone(e.target.value)` on every keystroke (`:457`) and writes that exact string to `institution.phone` on save (`:361`) — the read-only "Institution Info" card students/teachers/parents see renders `{institution.phone}` verbatim (`:884`), with no reformatting at render time. The malformed value is what's actually sitting in Firestore for GENR8-3D Academy today.
- **The digits themselves are intact** — `"+187 680 189 72"` strips down to `18768018972`, the fully correct, correctly-ordered digit sequence. This is purely a grouping/separator bug, not a data-corruption bug, which is why a backfill (§5) is safe: nothing needs to be re-derived or guessed, only reformatted.
- **`formatPhone()` is shared by 8 call sites**, confirmed via `grep` across `src/`: `AdminCreateUserForm.tsx`, `register/[institutionId]/index.tsx` (the public registration form), `institution-profile/index.tsx`, `TeacherForm.tsx`, `StudentForm.tsx`, `BrandForm.tsx`, `ParentForm.tsx`, `InstitutionAdminForm.tsx`. Every one of them gets fixed by this spec's single change to `phone.ts` — none of them need their own edit.
- **Exactly two collections actually store a phone number that reaches a live UI**: `institutions/{id}.phone` (the brand/profile fields, `firebase.ts:285`) and `users/{uid}.phone` / `users/{uid}.phone2` (`firebase.ts:205`, plus the second-phone field added alongside it). A third type, `ParentDocument` (`firebase.ts:195-197`, also carries a `phone` field), is declared but **confirmed dead code** — `grep` finds zero imports of it anywhere in `src/`. It is not a real collection and is out of scope for the backfill (§5).
- **`phonePattern`** (`src/lib/fieldPatterns.ts:6`, `/^\+?[0-9 ()-]{7,20}$/`) makes the leading `+` **optional** — many stored numbers may have no country code at all, which bounds what any formatter (hand-rolled or a real library) can reliably detect. Per §3's decision, this stays unchanged.
- **No `country` field exists anywhere in `InstitutionDocument` or `UserDocument`** — confirmed via `grep`. There is no fallback context to resolve an ambiguous number against; detection can only ever work from the digits actually present.
- **No phone-formatting library is currently a dependency** (`package.json` has no match for "phone"). Per §3's decision, none is added — this spec is a targeted NANP-only fix, not general country detection.
- **Reference implementation style**: `scripts/backfill-department-ids.mjs` is this project's existing template for a real (non-throwaway) backfill script — Admin SDK, `--dry-run`/`--key=` flags, batched writes, an idempotency check before each write, a summary count at the end. §5 follows this same shape.

---

## 3. Design Decisions

| Decision                            | Choice                                                                    | Rationale                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backfill existing data              | Yes — fix `formatPhone()` **and** correct already-stored malformed values | Your explicit choice. Safe per §2: the underlying digits in every malformed value are intact, nothing is guessed.                                                                                                                                                                                                         |
| Require a leading `+` going forward | No — `phonePattern` stays as-is, optional                                 | Your explicit choice. Bare national numbers remain valid input; they just don't get NANP-aware reformatting unless they happen to already contain the full 11-digit, leading-`1` NANP shape (§4.1).                                                                                                                       |
| Library vs. hand-rolled             | Hand-rolled, NANP-only — no new dependency                                | Your explicit choice over `libphonenumber-js`. **Scope tradeoff, stated plainly**: this fixes NANP numbers (US/Canada/Jamaica/Bahamas/Trinidad & Tobago/Barbados/etc. — every `+1` territory) specifically. Any other country code (`+44`, `+234`, etc.) keeps today's naive group-by-3 behavior, unchanged by this spec. |
| Rollout scope                       | All 8 call sites at once                                                  | Your explicit choice — free, since they all share one function; there's no per-form work to sequence.                                                                                                                                                                                                                     |

---

## 4. Design

### 4.1 `formatPhone()` — new NANP branch

NANP detection is digit-shape-based, not a real country lookup: **exactly 11 digits, starting with `1`** is treated as NANP, regardless of whether the caller typed a leading `+` — matching how the existing domestic branch already treats "≤10 digits, no `+`" as NANP-domestic without requiring the user to signal anything extra.

```diff
 export function formatPhone(raw: string): string {
   if (!raw) return raw;
   const isIntl = raw.trimStart().startsWith('+');
   const digits = raw.replace(/\D/g, '');

   if (!digits) return isIntl ? '+' : '';

   if (!isIntl && digits.length <= 10) {
     const d = digits.slice(0, 10);
     if (d.length <= 3) return d;
     if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
     return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
   }

+  // NANP (+1): 1-digit country code + 3-digit area code + 3-digit exchange +
+  // 4-digit subscriber number — a 1-3-3-4 shape, not the generic 3s-grouping
+  // below. Detected by digit shape (11 digits, leading '1'), not a real
+  // country lookup — covers the US, Canada, Jamaica, and every other +1
+  // territory identically, since they all share NANP's own internal
+  // structure. A number typed without a leading '+' still qualifies here
+  // (isIntl is irrelevant to this check) — matches how the NANP-domestic
+  // branch above already infers NANP from digit count alone.
+  if (digits.length === 11 && digits[0] === '1') {
+    const area = digits.slice(1, 4);
+    const exchange = digits.slice(4, 7);
+    const subscriber = digits.slice(7, 11);
+    return ['+1', area, exchange, subscriber].filter(Boolean).join('-');
+  }
+
   // International: group digits in threes after the leading '+'
   const limited = digits.slice(0, 15);
   const groups: string[] = [];
   for (let i = 0; i < limited.length; i += 3) {
     groups.push(limited.slice(i, i + 3));
   }
   return `+${groups.join(' ')}`;
 }
```

`['+1', area, exchange, subscriber].filter(Boolean).join('-')` handles partial typing gracefully — e.g. mid-entry at 7 digits (`1876801`), `subscriber` is `''` and gets filtered out, producing `+1-876-801` rather than a trailing dangling hyphen; at exactly 11 digits it produces the full `+1-876-801-8972`.

### 4.2 A real limitation, stated explicitly (not silently accepted)

This digit-shape detection **cannot** distinguish "a Jamaican number typed without its country code" (e.g. `8768018972` or `+8768018972`, 10 digits) from any other 10-digit non-NANP international number — there's no leading `1` to key off. A number in that shape falls through to the unchanged generic group-by-3 branch. This is the direct, expected consequence of §3's "no required `+`, no new dependency" decisions — flagged here so it's a known, accepted boundary rather than something discovered later as a surprise gap.

### 4.3 Backfill script

New file, `scripts/backfill-nanp-phone-format.mjs`, following `backfill-department-ids.mjs`'s existing structure (Admin SDK, `--dry-run`/`--key=` flags, batched writes, idempotency check, summary counts):

```js
// Re-implements §4.1's exact NANP branch (kept as a local copy, not an
// import — this is a Node/Admin-SDK script, not part of the Vite/browser
// build, and phone.ts isn't set up to be imported from scripts/ today).
function reformatIfNanp(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length !== 11 || digits[0] !== "1") return null; // not NANP shape — leave untouched
  const area = digits.slice(1, 4),
    exchange = digits.slice(4, 7),
    subscriber = digits.slice(7, 11);
  const next = ["+1", area, exchange, subscriber].join("-");
  return next === raw ? null : next; // null = already correct, nothing to write
}

async function backfillCollection(db, collectionName, fields, opts) {
  const snap = await db.collection(collectionName).get();
  let batch = db.batch(),
    opsInBatch = 0,
    changed = 0,
    unchanged = 0,
    notNanp = 0;

  for (const doc of snap.docs) {
    const updates = {};
    for (const field of fields) {
      const next = reformatIfNanp(doc.data()[field]);
      if (next) updates[field] = next;
    }
    if (Object.keys(updates).length === 0) {
      unchanged++;
      continue;
    }

    if (opts.dryRun) {
      console.log(
        `  [dry-run] would update ${collectionName}/${doc.id}:`,
        updates,
      );
    } else {
      batch.set(doc.ref, updates, { merge: true });
      opsInBatch++;
      if (opsInBatch >= 450) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }
    changed++;
  }
  if (!opts.dryRun && opsInBatch > 0) await batch.commit();
  console.log(
    `${collectionName}: ${opts.dryRun ? "would change" : "changed"} ${changed}, already correct/no phone ${unchanged}.`,
  );
}

// main(): backfillCollection(db, 'institutions', ['phone'], opts);
//         backfillCollection(db, 'users', ['phone', 'phone2'], opts);
```

**Idempotent** — `reformatIfNanp` returns `null` (no write) for anything already in the correct `+1-XXX-XXX-XXXX` shape or anything that isn't NANP-shaped at all, so re-running the script after it's already succeeded is a safe no-op. Matches §4.2's boundary: a bare 10-digit Jamaican number with no country code isn't touched by this backfill either, for the same reason `formatPhone()` itself can't reformat it going forward.

---

## 5. Firestore Rules

No changes. Both `institutions/{id}.phone` and `users/{uid}.phone`/`.phone2` already have no field-shape validation in `firestore.rules` (confirmed in earlier investigation this session, for the same "no restriction beyond `role`/`institutionId`" reason `mustChangePassword` and `phone2` itself needed no rules change) — an Admin-SDK backfill write and normal app writes are both already permitted.

---

## 6. Testing Considerations

- `npx tsc -b` / `npx eslint` / `npx vitest run` / `npm run build` — standing gate.
- `formatPhone()` is pure and already implicitly relied on by every form — new unit tests should cover: exactly 11 digits starting with `1` (full NANP format), partial NANP entry at 4/7/11 digits (progressive formatting while typing), an 11-digit number **not** starting with `1` (must still fall through to the generic branch, unchanged), a 10-digit number with a leading `+` and no country code (§4.2's known boundary — must produce the old generic output, not a false-positive NANP match), and the existing ≤10-digit-no-`+` branch (regression — must be byte-identical to before this change).
- `reformatIfNanp()` (§4.3) is separately testable with the same NANP/non-NANP cases, plus its idempotency guarantee (running it twice on the same input produces `null` the second time).
- Manual: re-run the backfill in `--dry-run` mode first against real data, review the logged changes, then run live. Confirm GENR8-3D Academy's Institution Profile (both the admin-editable wizard and the read-only student-facing card) shows `+1-876-801-8972` afterward with no further action needed.

---

## 7. Implementation Order

1. `phone.ts` — the new NANP branch (§4.1). Independently shippable and testable before the backfill exists.
2. `scripts/backfill-nanp-phone-format.mjs` (§4.3) — run in `--dry-run` first, review, then live, once the fixed formatter is confirmed correct.
3. Manual verification against GENR8-3D Academy specifically, matching the original report.

---

## 8. Explicitly Out of Scope

- **Non-NANP international formatting** — any country code other than `+1` keeps today's naive group-by-3 output. A real fix for that scope would need `libphonenumber-js` or equivalent, explicitly declined in §3.
- **Requiring a country code at entry time** — `phonePattern` is unchanged; bare national numbers remain valid and unformattable-by-country, per §3/§4.2.
- **A `country` field on `InstitutionDocument`/`UserDocument`** — would be the real fix for §4.2's boundary, but is a schema addition beyond a formatting-function fix; not requested.
- **`ParentDocument`'s `phone` field** — confirmed dead code (§2), not backfilled since it isn't real stored data anywhere.
