# Role-Default Password Reset Script

> **Status:** Implemented and verified — `scripts/reset-role-default-passwords.mjs`.
> **Purpose:** One-time/one-off Admin SDK maintenance script that brings **pre-existing** student/teacher/parent accounts — created before `ROLE_DEFAULT_PASSWORDS` and the `mustChangePassword` forced-first-login-change feature existed — onto the same footing as accounts created since: a known, role-specific default password, with the owner forced to pick their own real one at next sign-in.
> **Run locally only** — requires a service-account key (`scripts/service-account.json`, gitignored, never committed), same as every other `scripts/*.mjs` tool in this repo.

---

## 1. Background

`ROLE_DEFAULT_PASSWORDS` (`src/lib/roleDefaultPasswords.ts`) and the `mustChangePassword` flag it feeds (`src/lib/firebase.ts`, enforced by `src/components/Protected.tsx`) only apply going forward, to accounts created through `AdminCreateUserForm` from the point that feature landed. Any account created **before** that has whatever password its creator originally chose, with no forced-change mechanism ever applied to it. This script closes that gap for accounts that already exist.

## 2. What it does

For each eligible account (role `student`, `parent`, `regular_teacher`, or `senior_teacher` — `institution_admin`/`super_admin` are always excluded, since no default password exists for those roles):

1. Resets the Firebase Auth password to that role's `ROLE_DEFAULT_PASSWORDS` entry.
2. Sets `mustChangePassword: true` on `users/{uid}`, so `Protected.tsx`'s existing gate forces a real password choice at next sign-in — no app-side logic needed beyond what already exists.
3. Revokes the account's existing Auth refresh tokens, forcing re-authentication with the new credential.
4. Writes one `institutions/{institutionId}/audit_log` entry (`eventType: 'password_reset'`) — `AuditEventType` already declares this event; this is its first real writer.

## 3. Usage

Two mutually exclusive modes:

```
node scripts/reset-role-default-passwords.mjs --institution=<id> [--live] [--key=<path>]
node scripts/reset-role-default-passwords.mjs --email=<addr>     [--live] [--key=<path>]
node scripts/reset-role-default-passwords.mjs --uid=<uid>        [--live] [--key=<path>]
```

- **Bulk mode** (`--institution=<id>`) — every eligible account in one named institution.
- **Single-account override** (`--email=<addr>` or `--uid=<uid>`, no `--institution`) — one account, resolved directly wherever it lives. An ineligible role (e.g. an institution_admin targeted directly) is a hard, non-zero-exit error, not a silent no-op.
- **Dry-run by default** — deliberately deviates from this repo's other bulk scripts (`seed-bulk-institution.mjs`, `teardown-bulk-institution.mjs`), which default to live. This script touches real accounts' real credentials, not disposable seed data, so `--live` must be passed explicitly to write anything.
- `--key=<path>` falls back to `GOOGLE_APPLICATION_CREDENTIALS`, matching every other script in `scripts/`.

## 4. Key design decisions

| Decision                 | Choice                                                                  | Why                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope                    | One institution, or one account by email/uid — never "all institutions" | Matches the actual use case; avoids multiplying blast radius unnecessarily.                                                                |
| Already-changed accounts | Reset regardless, unconditionally                                       | The script does not attempt to distinguish "never changed" from "already changed" — see the security tradeoff in §5.                       |
| Session invalidation     | `revokeRefreshTokens()` on every account touched                        | Password change alone doesn't end an active session — Firebase ID tokens stay valid for their normal lifetime regardless. Both are needed. |
| Default safety posture   | Dry-run unless `--live`                                                 | This operates on real credentials, not disposable data.                                                                                    |

## 5. Gotchas

- **This script overwrites a real, private password a user may have already chosen for themselves.** It does not distinguish "never changed" from "already changed" accounts — every matching account in scope gets the same treatment. After a run, anyone who knows the role's default password (a plain string literal in this repo's own client bundle) can sign into any affected account until its owner changes it again. This is a deliberate tradeoff, not an oversight — treat each run as reopening that same temporary exposure window, including on re-runs.
- **`mustChangePassword`'s enforcement isn't instantaneous for an already-open session.** `AuthContext.tsx` reads this field via a one-time `getDoc` on auth-state-change, not a live listener — an already-signed-in tab won't redirect to `/change-password` until it reloads or re-authenticates. `revokeRefreshTokens()` forces that re-authentication eventually, but not down to the second.
- **Firebase Auth's account-update operations are rate-limited to 300 requests/minute per project** — this script makes two such calls per account (`updateUser` + `revokeRefreshTokens`). Concurrency alone doesn't cap sustained throughput; the script paces requests between chunks (`CHUNK_PACING_MS`) and retries with exponential backoff specifically on `auth/quota-exceeded` (`withQuotaRetry()`) as a safety net. This was discovered the hard way during verification (§7) — an earlier version reused a concurrency width copied from `seed-bulk-institution.mjs`'s `createUser()` precedent, which turned out not to be safe for this script's two-calls-per-account shape.
- **The script's local `ROLE_DEFAULT_PASSWORDS` copy is independent of `AdminCreateUserForm.tsx`'s** (a Node/Admin-SDK script can't import browser component code) — verify the two stay in sync before relying on this script if that constant is ever edited.
- **Idempotent, but not "safe to re-run" in the low-risk sense.** Re-running produces the same end state, but because already-changed accounts are reset unconditionally (see above), a second run carries the same exposure cost as the first — it is not a no-op for accounts that moved on since the previous run.

## 6. Firebase free-tier impact

Everything here is a direct Admin SDK call — no Cloud Functions, no Blaze-plan requirement. Per account: 1 Firestore read (discovery query) + 2 Firestore writes (`mustChangePassword`, `audit_log`) + 2 Auth API calls (`updateUser`, `revokeRefreshTokens`, which draw from Auth's own quota, not Firestore's). At this project's realistic institution sizes (tens of accounts), this is trivial against the Spark plan's 50,000 reads/20,000 writes per day. No composite Firestore index is required for the discovery query (`institutionId ==` + `role in [...]` — a single equality clause plus a single `in` clause needs only automatic single-field indexes).

## 7. Verification history

- Full dry-run → live path proven against a disposable 2,492-account seed institution first, not against real data. First live attempt failed on 2,110 accounts with `auth/quota-exceeded`; fixed (see §5) and re-verified clean: 2,492 reset, 0 failed.
- Run against the real motivating target, GENR8-3D Academy (25 eligible accounts: 24 student, 1 regular_teacher): dry-run reviewed first, then a live run — 25 reset, 0 failed.
- Verified end-to-end: `mustChangePassword: true` and a matching `audit_log` entry confirmed directly in Firestore for every reset account; a real browser sign-in confirmed the old password now fails, the role-default password succeeds and lands on `/change-password`, and completing that flow works as expected.

## 8. Explicitly out of scope

- An "all institutions at once" mode.
- A default password for `institution_admin`/`super_admin`.
- Distinguishing "never changed" from "already changed" accounts.
- Email notification to affected users.
- A permanent, reusable in-app "reset to default" admin UI button — this stays a one-off CLI script.
