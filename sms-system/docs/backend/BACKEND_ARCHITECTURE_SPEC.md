# Backend (BE) Server — Architecture Spec

> **Status:** design / planned, **nothing built.** Written 2026-10-06 after a brainstorm with the project owner. No code, rules, config or scripts were changed by this spec.
>
> **Status update (2026-10-19; the design below is kept as written).** Still nothing built (no backend code in this repository; the remote `Genr83d/sms-be-server` is empty). Facts in the body that the frontend has since overtaken: (1) the Firestore cache row in the §2 table ("`persistentLocalCache` + `persistentMultipleTabManager`") and the paragraph in §8 "Browser persistence (D4)" that describes it: the app uses a memory-only Firestore cache (`memoryLocalCache` with an LRU collector) since `1802b87` (issue #51), and reference data is persisted only through the React Query allow-list (`src/lib/queryPersistence.ts`, per signed-in user), so the two-instance split of D4 is superseded in practice; (2) the spec never mentions the `spectator` role (read-only, reads what an administrator reads); (3) `GET /counts` is demoted further: class head-counts are stored on the class documents and kept by the client batches that change a student (`classes/{id}.population`, `populationBaseline`; issue #62), with the six `count()` queries only as the fallback; (4) new student fields the BE must carry: `classIds` and `classSubjects` (additional classes, read by the rules through `inMyClasses()`) and the `hasPhoto` flag (non-personal, a candidate to be owned by the BE); (5) the read paths now have named freshness windows (`src/lib/queryPolicies.ts`: reference data 10 minutes, people lists 5, live data 60 seconds) that a BE read cache must stay within. Line cites in this spec have moved: `src/lib/firebase.ts` is 132 lines (types in `src/types/*.ts`), `firestore.rules` is 2,118 lines. The details are in `internal/regarding-backend/FRONTEND_FACTS_FOR_BACKEND_2026-10-19.md` (git-ignored).
> **Companion docs:** [`PII_SPLIT_DESIGN.md`](./PII_SPLIT_DESIGN.md) (the `users` PII split that decision D1 makes the critical path) and [`OPENAPI_V0_ENDPOINTS.md`](./OPENAPI_V0_ENDPOINTS.md) (first endpoint contract).
> **Related, not repeated here:** `internal/security/SECURITY_REPORT_2026-10-06.md` (gitignored; referred to below by finding ID `S-nn`), `docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md`, `EMAIL_INTEGRATION_SPEC.md`, `INSTITUTION_LOGIN_EMAILS_SPEC.md`, `docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md`.
> Items marked **[VERIFY]** rest on search-snippet-level sources or on console state that could not be seen — confirm before relying on them.

---

## 1. Overview

The SPA (React 19 + Vite on Vercel) talks **directly** to Firebase (Firestore, Auth, RTDB) from the browser. There is no server of the project's own; every spec to date says "Spark-only, no Cloud Functions". Authorisation is `firestore.rules` (2,011 lines), privileged admin work runs from a laptop with a service-account key (`scripts/`), and user creation happens from an admin's browser over a secondary Auth instance.

This spec defines a **separate-repo backend server** (Admin SDK) that becomes the gate for privileged operations, the only reader of PII, the upload authority and the job runner — **without** becoming a transparent Firestore proxy, and **without** requiring the Firebase **Blaze** plan (the Admin SDK works on Spark; only Cloud Functions, PITR/backups, TTL, Cloud Storage and Identity Platform need billing).

### 1.1 Governing decisions (confirmed by the project owner, 2026-10-06)

| #      | Decision                                                                                                                                                                                 | Consequence                                                                                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | The BE serves **PII reads from the start**, in addition to privileged writes, anonymous endpoints, files and jobs.                                                                       | The PII split of `users/{uid}` and a repository layer for the PII collections become the critical path (§4.3, §17). Ship **per collection behind a flag**, never big-bang. |
| **D2** | **Render free** for the pilot; **paid always-on** before the first paying institution.                                                                                                   | Docker-portable, 12-factor, no Render-specific APIs (§13).                                                                                                                 |
| **D3** | **OpenAPI contract + a small shared package** (patterns, role-policy table, caps, audit constants). Separate BE repo.                                                                    | SPA generates types from the contract; drift tests pin rules ↔ package ↔ BE (§11).                                                                                         |
| **D4** | **Split Firestore caches**: a persistent-cache instance for **non-PII reference data only**; a memory-cache instance for everything else; PII via the BE with `Cache-Control: no-store`. | Keeps resume-token delta billing for reference data; PII never reaches IndexedDB (§8).                                                                                     |
| **D5** | **Accept free-host cold starts** (~1 min) with warm-up UX for the whole pilot.                                                                                                           | Engineering requirements in §13.2; sign-in must never depend on the BE.                                                                                                    |
| **D6** | **Files:** the BE verifies, strips metadata and de-duplicates; stored as native Firestore bytes; **no heavy compression** on the 0.1-CPU free host.                                      | `FileStore` interface (Firestore-bytes now, Cloud Storage after Blaze) (§9).                                                                                               |
| **D7** | **Blaze within ~6 months.**                                                                                                                                                              | Build to the Blaze prerequisites now; add a budget kill-switch; re-evaluate hosting then (§13.3).                                                                          |
| **D8** | **Custom domain within ~3 months.**                                                                                                                                                      | `app.<domain>` + `api.<domain>`; also the prerequisite for the email spec's verified sending sub-domain (§13.4).                                                           |

### 1.2 Non-goals

- Replacing Firebase Auth, Firestore or the rules language.
- Streaming data through the BE (Firestore listeners stay client-side).
- A GraphQL layer, a custom auth system, or a rewrite of the SPA's UI/state management.
- Making the teaching-day happy path (attendance marking, gradebook entry) depend on the BE being awake.

---

## 2. Background — what exists today

Evidence from three read-only codebase surveys (2026-10-06). `ROOT` = `sms-system/`.

| Area              | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Where                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firestore access  | 126 non-test files import `firebase/firestore`; ~57 `onSnapshot` call sites (37 files), 128 `getDocs` (61 files), 76 `getDoc` (42 files), ~100 write calls (34 `writeBatch`), **0** Firestore transactions, **0** `useMutation`                                                                                                                                                                                                                            | `src/`                                                                                                                                                      |
| Data-access layer | **None.** Only path helpers (`institutionCollection`, `institutionDoc`, …)                                                                                                                                                                                                                                                                                                                                                                                 | `src/lib/paths.ts:10-49`                                                                                                                                    |
| TanStack Query    | `staleTime` 60 s, `refetchOnWindowFocus:false`, `retry:1`, sessionStorage persister `sms_query_cache` (30-min `maxAge`, `meta.persist:false` opt-out, `Timestamp` reviver); ~19 hooks/13 files; keys `[collection, institutionId, …]`; invalidation is imperative after writes                                                                                                                                                                             | `src/lib/queryClient.ts:6-85`, `src/hooks/`                                                                                                                 |
| Firestore cache   | `persistentLocalCache` + `persistentMultipleTabManager` — chosen on purpose for **resume-token delta billing** (re-query within 30 min bills only changed docs)                                                                                                                                                                                                                                                                                            | `src/lib/firebase.ts:73-83`, `FIRESTORE_READ_CACHING_SPEC.md` §1.2                                                                                          |
| Auth              | role/institution read from the `users/{uid}` doc (not claims); `mustChangePassword` is a **UI-only** gate; failure paths call `firebaseSignOut` directly and skip cache clearing                                                                                                                                                                                                                                                                           | `src/lib/AuthContext.tsx:90-236`, `components/Protected.tsx:32-37`, rules `:353-366`                                                                        |
| User creation     | Browser, secondary Auth app `user-creation`, one Auth create + one batch per row; student import capped at 90 accounts (client per-IP limit)                                                                                                                                                                                                                                                                                                               | `AdminCreateUserForm.tsx:350-356,560`, `import/index.tsx:205-217`                                                                                           |
| Rules cost        | `me()` = `get(users/{uid})` → 1 billed read per authorised request; ≤10 `get/exists` per request                                                                                                                                                                                                                                                                                                                                                           | `firestore.rules:10-33`                                                                                                                                     |
| Files             | Base64 strings **inside Firestore docs**; photo ≤60,000 chars (~45 KB, 180 px canvas re-encode), documents ≤500 KiB source / 700,000 chars; no compression library; no Storage use. **Update 2026-10-09:** teacher and admin lesson-note / assignment files over 500 KiB (≤5 MiB) are kept in the Realtime Database as an interim store (`src/lib/blobStore.ts`, docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md); student submissions stay inline | `src/lib/imageUpload.ts`, `documentUpload.ts` Rubric files (2026-11-04) are another inline store, at `rubrics/{id}/file/current`, to migrate with the rest. |
| Brand images      | Logo/signature base64 is copied into the public `registration_directory`, **every report card** and **every progress report**; no sniffing, no output cap, no rules validation                                                                                                                                                                                                                                                                             | `generateReportCard.ts:362-363`, `generateProgressReport.ts:152-153`, `RegistrationDirectoryToggle.tsx`                                                     |
| Submissions       | Each submission stores the file twice (`submissions/{uid}` + `attempts/{n}`) plus a tombstone                                                                                                                                                                                                                                                                                                                                                              | `src/lib/submissions.ts:79-133`                                                                                                                             |
| Computation       | Report cards, progress reports and attendance summaries are computed in the browser; batch report-card generation re-reads the class roster **per student** (O(N²) reads)                                                                                                                                                                                                                                                                                  | `generateReportCard.ts:328-335`, `attendanceSummaryUtils.ts`                                                                                                |
| Registers         | Attendance register docs use random ids; save decides upsert vs create from a client lookup → concurrent saves can duplicate a register                                                                                                                                                                                                                                                                                                                    | `attendance/general/index.tsx:413-418`                                                                                                                      |
| Email             | Only `sendPasswordResetEmail` (super-admin → admin). EmailJS/SMTP2GO flows exist as specs only, designed client-side because there is no server                                                                                                                                                                                                                                                                                                            | `super-admin/manage-admins/index.tsx:42`, `EMAIL_INTEGRATION_SPEC.md`                                                                                       |
| Tests/CI          | 45 vitest files (~513 cases, pure logic); **no emulator, no rules tests, no CI**; e2e runs against the live `school-sms-v1` project                                                                                                                                                                                                                                                                                                                        | `src/lib/__tests__/`, `e2e/`, `playwright.config.ts`                                                                                                        |
| Env               | ~10 `VITE_*` vars read as unchecked `as string` casts; no runtime validation                                                                                                                                                                                                                                                                                                                                                                               | `src/lib/firebase.ts:8-15,70-72`                                                                                                                            |

---

## 3. The four roles of the BE

| Role                       | What the BE does                                                                                                                                                                                                                                                                              | Verdict               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **A. Gatekeeper (writes)** | Owns privileged writes via the Admin SDK: user create / role / status / disable / revoke / password; `student_parents` links; audit + activity log writers; registration intake; public-directory generation; outbound email; institution config. Client writes to these are denied by rules. | **Do**                |
| **B. Media authority**     | Re-validates uploads (magic bytes, full decode, caps), strips metadata, de-duplicates, stores native bytes, enforces per-tenant byte quotas.                                                                                                                                                  | **Do, narrowly** (D6) |
| **C. Reader**              | Serves **PII** (and counts/projections over it) with a shared server cache; never streams.                                                                                                                                                                                                    | **PII only** (D1)     |
| **D. Job runner**          | Report-card / progress-report / attendance-summary generation, retention, export/backup stopgap, bulk import, scheduled cleanup.                                                                                                                                                              | **Do**                |

### 3.1 What the BE must not become

- A transparent Firestore proxy. Reads of reference data and teaching-day data stay on the client SDK (it keeps listeners, offline cache and delta billing).
- A single point of failure for sign-in or for attendance/gradebook entry.
- The owner of real-time. If live updates are ever needed for BE-owned data, use short "invalidate" pings (SSE), never data streams.

---

## 4. Data classification (the key idea)

The class of a collection decides who writes it, how it is read, and where it may be persisted in the browser.

| Class                          | Meaning                                                                                                                                                                                                                | Writes                                         | Reads                                 | Browser persistence                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| **T0 — platform / identity**   | accounts, roles, status, claims, passwords, `student_parents`, institution config, audit + activity logs                                                                                                               | **BE only** (rules deny client writes)         | role-scoped                           | none                                             |
| **T1 — PII / sensitive**       | DOB, ID numbers (TRN/Citizen/student id), phone, address, emergency contacts, attendance excuse **reasons**, disciplinary records, activities/responsibilities, report-card comments, registration submissions, photos | BE (or tightly-ruled client where unavoidable) | **via BE**, `Cache-Control: no-store` | **never** (memory only)                          |
| **T2 — academic working data** | gradebook cells, attendance register while marking, lesson notes, assignments, submissions                                                                                                                             | client (tightened rules)                       | client SDK (live where needed)        | memory only                                      |
| **T3 — reference data**        | terms, classes, subjects, departments, houses, academic calendar                                                                                                                                                       | admin via client or BE                         | client SDK                            | **persistent OK** (non-PII; keeps delta billing) |

### 4.1 Initial collection → class map

| Collection / path                                                                                               | Class                              | Notes                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `users/{uid}` **public profile** (id, role, institutionId, status, displayName, classId, mustChangePassword, …) | T0/T3-like (non-PII)               | Stays client-readable under rules; `AuthContext` keeps its own-profile read here so **sign-in never depends on the BE** |
| `users/{uid}/private/profile` (new)                                                                             | **T1**                             | BE-only; see `PII_SPLIT_DESIGN.md`                                                                                      |
| `users/{uid}/photo/current`                                                                                     | T1                                 | BE batch endpoint replaces the N+1 per-user `getDoc`                                                                    |
| `student_parents`                                                                                               | T0                                 | BE-written links                                                                                                        |
| `enrollmentRegistrations`                                                                                       | T1                                 | public create via BE intake; review reads via BE                                                                        |
| `generalAttendance`, `subjectAttendance`                                                                        | T2 (marking) / T1 (excuse reasons) | marking stays client-live; reasons move to a teacher-only sub-document / BE (S-09 phase 1)                              |
| `disciplinaryActions`, `studentActivities`, `studentResponsibilities`, `reportCardComments`                     | T1                                 | per-collection slices behind flags                                                                                      |
| `reportCards`, `progressReports`, `attendanceSummaries`                                                         | T0 (authoritative, BE-computed)    | brand images referenced, not copied                                                                                     |
| `results`, `feedback_comments`, `gradebooks`                                                                    | T2                                 | grades are sensitive for minors; keep tight rules; consider BE-computed aggregates                                      |
| `terms`, `classes`, `subjects`, `departments`, `houses`, `academicYears`, `nonSchoolDays`                       | T3                                 | persistent-cache instance                                                                                               |
| `audit_log`, `activity_log`                                                                                     | T0                                 | BE-written only                                                                                                         |
| `registration_directory`                                                                                        | public                             | replaced by BE-generated small JSON; logo served separately                                                             |

### 4.2 Why classification, not "proxy everything"

- A BE read costs **the same Firestore quota** as a client read (Admin SDK reads/writes count against the same 50 K / 20 K per day on Spark).
- A BE read **cannot use resume-token delta billing** (the Admin SDK has no persistent cache), so every BE cache miss is a full read. The BE therefore needs its own cache (§7) — and caching is only exact where the BE is the **single writer**.
- Rewiring all ~260 read sites is a large change with no benefit for non-sensitive data.

### 4.3 What D1 requires (PII reads from day one)

1. **PII split of `users`** — otherwise the client can still read the whole doc directly (rules are not filters). Design in `PII_SPLIT_DESIGN.md`.
2. **Rules tightening for T1** (`read: false` on private sub-docs/collections) deployed **only after** the SPA no longer reads them: _BE live → SPA switched → rules tightened_. (Two whole-file rules-deploy incidents are already on record.)
3. **Repository layer + DTO mapper** for the T1 collections (none exists today).
4. **BE directory/detail/counts/photos endpoints** with an L2 cache; because the BE owns user writes, its users-directory cache is exactly coherent.
5. **Keep sign-in independent of the BE** (own-profile read on the client SDK).

---

## 5. Trust and authorisation model

- **Identity:** Firebase Auth ID token (`Authorization: Bearer`) verified with `verifyIdToken` (local signature check; certs cached; no quota). `checkRevoked` is an extra network call → cache the result for 30–60 s.
- **App Check:** `X-Firebase-AppCheck` verified with `appCheck().verifyToken` on anonymous and high-value endpoints; `{ consume: true }` (replay protection, Node SDK only, adds a round trip) only on the most sensitive ones.
- **Claims:** `role`, `institutionId`, `pwChangeRequired` as **custom claims set only by the BE** (≤1000 bytes). The tenant is derived from claims; handlers never trust a tenant id from the body. A `super_admin` supplies the tenant in the path and is audited.
- **Tenant-scoped repository:** handlers receive an object that can only reach `institutions/{claims.institutionId}/…` (and the user's own paths). A cross-tenant read is **unrepresentable**, not "remembered".
- **The Admin SDK bypasses rules and App Check.** On the BE path, _the code_ is the tenancy guard; rules remain defence-in-depth and the authority for T2/T3.
- **Revocation:** `revokeRefreshTokens` + `disabled:true` stop _renewal_; an already-issued ID token still passes rules until it expires (≤1 h). The BE can be stricter (`checkRevoked`); rules cannot. Keep a rules-visible `status` check where immediacy matters. After a role/status change the SPA force-refreshes (`getIdToken(true)`).
- **Claims backfill** (existing accounts) is a quota-aware script run before any rule relies on claims. Claims are also the long-term fix named in the nesting spec for the "`users` can't be nested because rules must `get()` the user" chicken-and-egg; a BE removes the assumption that an automatic claims-setter needs Blaze (`FIRESTORE_INSTITUTION_NESTING_SPEC.md` §14.5).
- **Server time:** `submittedAt`, `recordedAt` and similar come from the BE, closing the backdating gaps rules can only approximate.

### 5.1 Request pipeline

```
request-id → helmet/CORS(exact origins) → IP rate limit
  public:  App Check (+ Turnstile if abuse) → zod(.strict) → handler
  authed:  verifyIdToken (+cached checkRevoked) → claims → tenant guard
           → role-policy table → zod(.strict) → handler → audit → error mapper (no PII)
```

### 5.2 Security requirements for the BE itself (it becomes the highest-value target)

Dedicated least-privilege service account per environment (custom role: `firebaseauth.admin` + `datastore.user`; never Owner/Editor; separate from the script and deploy identities) · secrets in the host's secret store, rotated · `npm ci --ignore-scripts`, lockfile, Dependabot, gitleaks, `SECURITY.md` · `zod .strict()` everywhere (mass assignment) · request/connection timeouts and body limits · **`trustProxy` configured correctly** (behind a host proxy every client otherwise shares one IP for rate-limiting, or `X-Forwarded-For` is spoofable) · no stack traces to clients · PII-redacting logger (pino redaction) · exact-match CORS (a preview-URL regex must be fully anchored; an unanchored `*.vercel.app` pattern is an auth bypass) · no outbound fetch of user-supplied URLs (SSRF) · audit written in the same flow as the action · idempotency keys on mutations · integration tests on the Emulator with a **cross-tenant matrix**.

---

## 6. Resource & API conventions

Detailed in `OPENAPI_V0_ENDPOINTS.md`. Summary: REST + OpenAPI 3.1, `/v1` prefix (additive changes only — old SPA bundles will keep calling after deploys), ISO-8601 string dates in DTOs (not `Timestamp`), `Idempotency-Key` on mutations, a uniform error model, `Cache-Control: no-store` on every T1 response, strict request schemas, pagination by cursor.

---

## 7. Caching with TanStack Query

**The seam is the `queryFn`.** Today's hooks use `getDocs(...)`; for BE-served resources only the `queryFn` changes (`api.get('/v1/…')`), so migration is incremental, resource by resource.

| Layer              | Mechanism                                                                                                          | Job                             | Constraint                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- | --------------------------------- |
| L1 browser memory  | TanStack `staleTime`/`gcTime` by resource class                                                                    | avoid refetch within the window | T1: memory only, **no persister** |
| L2 BE shared cache | in-process LRU/TTL, **single-flight** (coalesce concurrent identical misses), key `tenant:resource:params:version` | 30 users → 1 Firestore read     | exact only for BE-owned data      |
| L3 Firestore       | billed reads                                                                                                       | last resort                     | —                                 |

- **Staleness classes** (suggested `staleTime`): reference/T3 5–30 min; rosters/directories 60 s (today's default); live registers/gradebook 0; public directory static JSON with long cache.
- **Server-driven invalidation.** Every BE mutation returns `{ data, invalidates: [queryKey…] }`; one shared helper applies `setQueryData`/`invalidateQueries` (replacing `FormModal`'s hard-coded table→key map). Optionally `GET /v1/sync?since=<cursor>` returns changed resource tags so the SPA invalidates only those keys without listeners.
- **Query keys:** standardise to `[tenantId, uid, resource, params]`. Adding `uid` fixes stale data being served to the next user in a tab and doubles as the BE cache tag.
- **Mutations:** adopt `useMutation` (0 uses today) with an `Idempotency-Key` so `retry` cannot double-create users or emails.
- **Coherence rule:** the BE caches only data **all of whose writers go through the BE**. T2/T3 are still client-written → not BE-cached.
- **HTTP caching vs shared lab PCs:** the browser's HTTP disk cache would store PII → T1 responses are `no-store`; the BE answers conditional requests from L2. Public non-PII (directory JSON) may be `public, max-age` + ETag.
- **DTO/`Timestamp`:** the persister's `Timestamp` reviver exists because documents carry `Timestamp`; BE DTOs carry ISO strings, so a thin DTO→domain mapper per resource (or shared-core DTOs) is needed. 18 uses in 12 files call `.toDate()/.toMillis()`.
- **Delta reads for T1:** the BE can partly replace lost resume-token savings with `where updatedAt > cursor` queries against its own cache, since it is the single writer of the users directory.

---

## 8. Browser persistence (D4)

> **Update 2026-10 (issue #51):** the two-instance split below was **not** built. The client-side tightening
> plan rejected it (33 `writeBatch(db)` sites and 2 transactions need one instance, a student save mixes
> `users` and `houses` in one batch, ~264 path helpers would need routing). Instead the SPA uses **one
> in-memory Firestore cache with an LRU collector**, an allow-listed per-user `sessionStorage` query cache,
> uid-keyed attendance drafts, a purge + reload on every sign-out path, and a one-time deletion of the old
> IndexedDB database. D4 is superseded by this; the rest of this section is kept for the BE-served PII design.

**Today:** `persistentLocalCache` stores every document the user has read (including DOB/ID numbers) in IndexedDB and is never cleared; implicit sign-out paths skip `queryClient.clear()`. It was chosen deliberately for delta billing, so `memoryLocalCache()` everywhere would trade privacy for read cost.

**Decision (D4):** two `FirebaseApp`/Firestore instances with a strict collection→instance map:

| Instance       | Cache                      | Collections                                              |
| -------------- | -------------------------- | -------------------------------------------------------- |
| `refDb`        | **persistent** (multi-tab) | T3 reference data only (non-PII)                         |
| `db` (default) | **memory**                 | everything else the client still reads (T2, own profile) |
| _(BE)_         | none                       | T1 via `fetch`, `no-store`, TanStack memory only         |

Complementary controls: `terminate()` + `clearIndexedDbPersistence()` on **every** auth-loss path (explicit, idle, revoked, token expiry — fix the `fetchRole` direct-sign-out paths); one purge choke-point on auth state change; allow-list TanStack persistence (`meta.persist === true` only for T3) and add `uid` to the persister buster; `Clear-Site-Data: "cache","storage"` from a tiny **same-origin static path on the app origin** (served via `vercel.json` `headers`, fetched at sign-out/idle-out; applies to the response's origin only, so it cannot be served from `api.`; call `terminate()` first **[VERIFY]** behaviour with open connections); `Cache-Control: no-store` on all BE PII; attendance drafts keyed by uid with a TTL (S-21). The BE cannot clear client storage by itself.

---

## 9. Files (D6)

### 9.1 Reality check

Lossless compression is the **smallest** lever: photos are already ≤~45 KB after a 180 px canvas re-encode (which also strips EXIF) and documents ≤500 KiB. Typical lossless gains: JPEG 5–10 % (jpegtran/mozjpeg), unoptimised PNG 30–50 % (oxipng), PDF highly variable (qpdf), DOCX/PPTX/XLSX ~0–5 % (already Deflate-zipped). On Render free (0.1 vCPU) heavy passes are slow and risky.

### 9.2 What the BE does instead

1. **Authoritative validation:** magic bytes + full decode (sharp, `limitInputPixels`, `sharp.concurrency(1)`), size/dimension caps, zip-bomb ratio limits for Office files, extension ↔ type match (today DOCX vs PPTX is told apart only by declared MIME/extension), filename sanitising + length cap (`fileName` is stored unsanitised and reused as the download name).
2. **Metadata stripping** — image attachments/submissions currently embed raw bytes with EXIF/GPS intact.
3. **De-duplication of copies** (bigger than any compression ratio): logo/signature stored **once** and referenced (today copied into the public directory, every report card and every progress report); a submission attempt references one blob instead of storing a second copy; assignment attachments move off the assignment doc (list `onSnapshot` currently pulls full payloads).
4. **Native bytes:** Firestore `Bytes` instead of base64 strings → **−25 %** stored size/egress; practical per-doc cap rises from ~500 KB to ~900 KB (field ≤ 1,048,487 bytes) without chunking.
5. **Per-tenant byte quotas** so one school cannot consume the shared 1 GiB.
6. Browser-side pre-checks stay (instant feedback); the BE is the authority; cap constants live in the shared package.

### 9.3 `FileStore` interface

`put(tenant, kind, bytes, meta) → ref`, `get(ref)`, `delete(ref)`, `quota(tenant)`. Implementations: **FirestoreBytesStore** (now), **CloudStorageStore** (after Blaze — new buckets need Blaze since 2026-02-03). An off-platform bucket (R2/B2) was considered and **not chosen** (new US processor of minors' data, extra credential, DPA).

### 9.4 Not feasible on the free host

Malware scanning (ClamAV needs ~1 GB RAM) — defer; bulk image optimisation — queue/202-poll or defer.

---

## 10. Jobs (role D)

| Job                          | Why                                                                                                                                                        | Notes                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch report-card generation | re-reads the roster per student today (O(N²))                                                                                                              | read roster/terms **once**, write cards in a batch; authoritative; enables a "print all cards" PDF                                                                        |
| Attendance-summary rebuild   | reads the whole `generalAttendance` collection in the browser                                                                                              | server aggregation; incremental by term                                                                                                                                   |
| Retention                    | TTL deletes need Blaze; `deleteAt` scheme may be a no-op on Spark. Realtime Database files have no TTL at all (owner-run `scripts/sweep-orphan-blobs.mjs`) | BE job replaces TTL until Blaze (D7), then retire it; also sweeps orphaned Realtime Database files; deletes count against 20 K/day                                        |
| Export / backup stopgap      | no PITR on Spark                                                                                                                                           | scripted Admin export; 1 read per doc; spread over days                                                                                                                   |
| Bulk import                  | 90-account cap is a client per-IP limit                                                                                                                    | queued, resumable; reuse `AUTH_CONCURRENCY=10`, 5 s chunk pacing and `withQuotaRetry` from `reset-role-default-passwords.mjs` (Identity Toolkit account updates ≈300/min) |
| Register upsert              | random ids can duplicate registers                                                                                                                         | Firestore **transaction** upsert on the natural key (class/subject, date, session) with a version check                                                                   |

**Scheduling on free hosting:** Render free has no cron/one-off jobs → an external scheduler (e.g. GitHub Actions cron) calls an authenticated endpoint (which also wakes the instance).

---

## 11. Validation, regex and the shared package (D3)

### 11.1 Where regex helps

| Target                              | Approach                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| names                               | anchored allow-list (`namePattern`); length first                                          |
| email                               | shape pre-filter (`emailPattern`) then zod `.email()`; real validity = verification email  |
| phone (NANP)                        | `phonePattern` + normalise to E.164 server-side                                            |
| ID numbers (TRN/Citizen/student id) | per-type anchored pattern (+ checksum if one exists) — **none exists today**               |
| file extension                      | allow-list lookup; **the decision is magic bytes + decode**, never the name                |
| free text                           | length caps + Unicode normalisation + output encoding; not regex "sanitising"              |
| URLs                                | `new URL()` + scheme allow-list                                                            |
| env vars                            | zod schema validated **at boot**, fail fast                                                |
| hardcoded credentials               | CI / pre-commit scanning (custom gitleaks rule) in the SPA repo — not a BE runtime feature |
| CORS origins                        | exact list first; any preview regex fully anchored                                         |

**ReDoS:** Node's regex engine backtracks → cap input length before matching, keep patterns anchored and linear, or use RE2 (`re2`) for unbounded text. Patterns are written **RE2-compatible** (no lookahead/backrefs) because Firestore rules use RE2.

### 11.2 Current gaps the shared package closes

No username exists (login is by email); email has **three** variants (shared `emailPattern`, a local `EMAIL_RE` in `login/index.tsx`, zod `.email()`) plus a fourth spelling in rules; names are regex-checked in only 3 of ~7 forms and not in rules; password policy is hand-copied in two files; only phone is pinned to rules by a test; `fileName` has no sanitising; free-text control-character filtering exists only in the public registration form.

### 11.3 Shared package contents (v0)

`fieldPatterns` (+ new ID/name patterns), `phone`/`phoneNanp` (plain JS precedent), the **role-policy table** (consumed by route guards, sidebar, rules tests and the BE), caps (photo/attachment/link counts, text lengths, byte quotas), audit constants (`auditEntry` key set, 300-char detail cap, `MAX_BATCH_OPERATIONS`), role/enum types **without** SDK types. Portable pure logic already unit-tested in Node: `reportCardUtils`, `attendanceStates/Totals/Windows/Missing/Term`, `holidays`, `gradeEntryTracking`, `gradeTrackingPeriods`, `gradebookRescale`, `classNames/classSubjects/teacherScope`, `sessionLockLogic`, `inactivityTimeout`. `src/lib/firebase.ts` (999 lines) mixes types with SDK init and **cannot** be imported by a server — split pure types/`Role`/enums out first. Distribution: OpenAPI for the wire contract; the package (or a JSON snapshot + drift test) for constants; drift tests in both repos pin rules ↔ package ↔ BE.

---

## 12. Stack and polyglot judgement

| Question                        | Verdict                                                                                         | Why                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js core                    | **Yes — Node 24 LTS + TypeScript**                                                              | shared TS logic/schemas; most complete `firebase-admin` (v14 needs Node ≥ 22; local is 22.19) **[VERIFY LTS status at build time]**                 |
| Framework                       | **Fastify 5** + `fastify-type-provider-zod`                                                     | schema-first validation/serialisation/OpenAPI; first-party helmet/cors/rate-limit/multipart; pino with redaction; ~2–3× Express throughput; low RAM |
| Express                         | acceptable, not recommended                                                                     | no built-in validation; security entirely bolt-on                                                                                                   |
| NestJS                          | no                                                                                              | heavy for a solo dev on a 512 MB instance; Fastify plugins give the same module boundaries                                                          |
| Go core                         | not now                                                                                         | every schema/role table/regex would exist twice and drift; bottleneck is Firestore quota, not CPU; Node-only App Check replay protection            |
| Go for isolated work            | possible only as a **separate worker** behind a narrow typed contract                           | `sharp` (libvips) already beats hand-rolled Go image code                                                                                           |
| "Sprinkles" of another language | only **native binaries/addons you don't author** (`sharp`, `oxipng`, `jpegtran`, `qpdf`, `re2`) | a second authored language doubles toolchains, CVE feeds and onboarding for a one-person team                                                       |

Other choices: `firebase-admin` with `preferRest` where it cuts cold-start/gRPC weight; `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit` (in-memory on a single instance), `@fastify/multipart` (hard limits); vitest + Emulator Suite; `engines` and `.nvmrc` set (neither exists in the SPA repo today).

**Priorities (in order):** 1 security & tenant isolation → 2 quota & cost protection (what "performance + scaling" means on Spark) → 3 availability/graceful degradation → 4 latency → 5 horizontal scaling (not the bottleneck) → 6 operability.

---

## 13. Hosting and operations

### 13.1 Free-hosting landscape (2026-10-06; re-check before committing)

| Host                                               | Free?                               | Notes                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Render free web service** (chosen for the pilot) | 750 h/mo/workspace                  | sleeps after 15 min, ~1 min cold start; **512 MB RAM / 0.1 CPU**; ephemeral disk; **no SMTP ports 25/465/587**; no cron/one-off jobs; Render says free is **not for production**; may suspend services with unusually high outbound traffic |
| Google Cloud Run                                   | Always Free 2 M req/mo etc.         | **needs a Cloud Billing account**; a "Starter Tier" (no card) exists — **[VERIFY]** whether it can attach to the existing Firebase project                                                                                                  |
| Netlify Functions                                  | 300 credits/mo **hard cap**         | serverless/stateless; the whole team's sites pause at the cap; thin endpoints only **[VERIFY]** commercial-use wording                                                                                                                      |
| Cloudflare Workers                                 | permanent free                      | cannot run `firebase-admin` (no Node/gRPC); 10 ms CPU — only a possible edge gate later                                                                                                                                                     |
| Vercel Functions (Hobby)                           | yes                                 | **non-commercial only** (same blocker as S-18)                                                                                                                                                                                              |
| Koyeb / Oracle / Fly / Railway                     | card / reduced / reclaim / not free | not recommended                                                                                                                                                                                                                             |

### 13.2 Cold-start requirements (D5)

- **Wake ping:** `GET /v1/healthz` (no auth, **no Firestore I/O**) on login-page mount and after every successful sign-in.
- **Never block sign-in on the BE:** `AuthContext` keeps its own-profile read on the client SDK.
- **Timeouts/retries:** first BE request timeout ≥ 90 s; `retryDelay` so TanStack's `retry:1` does not stack a second 60 s wait; distinguish "waking" (502/503/network from the host proxy) from real errors.
- **UX:** a deterministic "Warming up the server…" skeleton with elapsed-time messaging; **prefetch** the first PII queries right after sign-in.
- **Inactivity interacts:** staff auto-logout is 5 min (learners 30), so most logins follow an idle gap — expect cold starts most mornings.
- **Re-evaluation triggers (decided now):** first invoiced institution · any staff cold-start complaint · any abuse/outage · the Blaze upgrade · Render changing free-tier terms. **Avoid keep-alive pings** (gray area, fragile).
- **Region:** Firestore is `us-central1` → choose the nearest US region (Ohio/Oregon).

### 13.3 Path after the pilot (D2, D7)

Render paid always-on (~$7/mo) before the first paying institution (also the moment to move Vercel Hobby → Pro). At **Blaze time**, re-evaluate **Cloud Run in the same GCP project**: ~1–3 s cold starts, 2 M requests/month Always Free, `max-instances` as a cost cap, and an **attached runtime service account with no JSON key** (removes the "admin key in a host env var" secret). Keep one Dockerfile and 12-factor config so either move is a day's work.

### 13.4 Domain (D8)

`app.<domain>` (Vercel) + `api.<domain>` (custom domain on the BE host): same-site requests, exact-origin CORS, HSTS, stable `VITE_APP_URL` for emailed links, stable App Check/Auth-authorised-domain lists, and the **verified sending sub-domain** (SPF/DKIM) the email spec needs. HttpOnly cookie sessions (`createSessionCookie`) help much less than they seem while the SPA still uses the Firebase client SDK (an ID token still lives in sessionStorage) — treat as an optional later upgrade. `Clear-Site-Data` stays on the **app** origin. Until the domain exists: in-memory Bearer tokens only (`*.vercel.app` and `*.onrender.com` cannot share cookies).

### 13.5 Secrets, environments, compliance

- One BE environment per Firebase project: **dev/Emulator**, **staging** (own Firebase project, Vercel Preview → staging), **prod**. Never run BE integration tests against production.
- Service-account key (until Cloud Run): host secret store, dedicated SA, scheduled rotation.
- A new host/processor of minors' data (Render, SMTP2GO) needs a **written DPA and a US-transfer basis** (Data Protection Act s.30(5), s.31) and a Privacy Notice update **before** real data flows; keep security claims factual.
- Config: a zod-validated env module (fail fast); `.env.example` maintained.

---

## 14. Fit with free tiers

### 14.1 Firebase Spark

- The Admin SDK is allowed on Spark. BE reads/writes bill against the **same** quotas; the BE does not add quota but can save some: no rule-evaluation `get()` reads on BE writes, claims reduce `get(users/uid)`, single-flight + L2 cache dedupe identical reads, a counts endpoint replaces full-collection listeners (`UserCard`/`CountChart`), report-card jobs remove the O(N²) roster reads.
- Where the BE can **cost** quota: retention/export jobs, bulk import, audit/activity writes (batch/bucket per day), any per-student attendance projection (N writes per session). `/healthz` must do no I/O. Admin-SDK retries can multiply writes — cap them.
- Client signups are limited (~100/h/IP) but the Admin SDK has no such cap (per `SPREADSHEET_IMPORT_STUDENTS_SPEC.md`); Identity Toolkit account updates are ≈300/min — pace.
- Spark auth email limits: password-reset 150/day, verification 1,000/day (Firebase docs) — BE reset flows must respect them.
- Cloud Storage buckets need Blaze (since 2026-02-03) → files stay in Firestore as bytes until D7.

### 14.2 Vercel Hobby

- The SPA stays static; no Vercel Function usage if the BE is elsewhere. The BE does not fix S-18 (Hobby is non-commercial for serving paying customers).
- `vercel.json` currently has only the SPA rewrite → add `headers` (CSP etc., S-13) **including `connect-src` for the BE origin**.
- Preview deployments currently use production Firebase (S-05): a BE multiplies the problem → staging BE + staging Firebase + a CORS allow-list that matches preview URLs exactly.
- Optional same-origin proxy via `rewrites` (`/api/*` → BE) trades CORS for edge-request/transfer counts, an extra hop and (verify) body-size limits — send uploads directly to the BE.

---

## 15. Which security-report items the BE addresses

● primary fix · ◐ helps/completes a free fix · ○ not a BE matter · ⚠ introduced/worsened by the BE.

| ID                                       | Topic                                                          | BE?                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| S-01                                     | role-default password model; first-login gate UI-only          | ● server-side random one-time passwords + `pwChangeRequired` claim (removing literals is free client-side — do that first) |
| S-04                                     | App Check enforcement                                          | ◐ BE verifies on its endpoints; Firestore/RTDB enforcement is a console toggle                                             |
| S-05 / S-14                              | previews on prod; one project for everything                   | ⚠ BE adds an environment axis                                                                                              |
| S-06 / S-20                              | browser persistence of PII                                     | ◐ for BE-served PII; SPA changes still needed                                                                              |
| S-07                                     | anonymous intake and directory limits                          | ● intake endpoint + counters + static directory JSON                                                                       |
| S-08                                     | authenticated write floods                                     | ◐ BE-owned log writers with budgets                                                                                        |
| S-09 / S-10                              | over-exposure; rules integrity                                 | ◐ BE-served projections; BE-owned writes remove the worst                                                                  |
| S-11                                     | no backups on Spark                                            | ◐ scheduled export job                                                                                                     |
| S-15                                     | service-account key sprawl                                     | ⚠ new key holder → least-privilege SA, rotation                                                                            |
| S-17                                     | auth surface / recovery                                        | ◐ BE-mediated reset, server-side policy, server-side email                                                                 |
| S-23                                     | client-attested audit                                          | ● BE writes audit atomically with the action                                                                               |
| S-24                                     | session lock is UX only                                        | ◐ revoke/disable; real push still needs SSE                                                                                |
| S-29                                     | TTL needs billing                                              | ● BE retention job until Blaze                                                                                             |
| S-31                                     | secondary Auth app                                             | ● BE creates user + profile + audit with rollback                                                                          |
| S-33                                     | upload/import hardening                                        | ● server-side validation (no ClamAV on free)                                                                               |
| S-34                                     | deactivation doesn't disable Auth user                         | ● `disabled:true` + revoke + claim change                                                                                  |
| S-02/03/12/13/16/18/19/22/25–28/32/35–47 | config, hygiene, UI honesty, headers, GitHub/Vercel plan, deps | ○ do now per the report's Phase 0–2; **not gated on the BE**                                                               |

---

## 16. Impact on existing specs and docs

- **`EMAIL_INTEGRATION_SPEC.md` §8/§15 and `INSTITUTION_LOGIN_EMAILS_SPEC.md`:** both are client-side because there is no server (EmailJS public key in the browser, client-enforced per-account caps/monthly counters, a public `password_requests` write, an owner-run local reset script). The BE replaces all four: server-side send (SMTP2GO HTTPS API; Render free blocks SMTP ports), server-enforced caps, an intake endpoint with App Check/rate limits, and a hosted reset worker. Both specs already name "second institution live / abuse seen" as the trigger. The security report also advises against the pre-filled default-password login link; with BE-generated random one-time passwords that premise disappears — **revise those specs before building them.**
- **`sms-role-specification-v1.md`** already assumes server-side items: system-only audit writes, a server-computed class average suppressed when fewer than 3 results (k-anonymity), impersonation/PII-access gating.
- **`ISSUES_AND_GAPS.md`:** a BE closes #23 (forgeable audit), #24 (claims → fewer rule reads), #39 (`mustChangePassword` UI-only), #44 (audit flood), #14/#17/#19 (server-written stats/alerts), #33 (messaging needs a server intermediary).
- **`FIRESTORE_READ_CACHING_SPEC.md`:** unchanged for T3/T2; its Phase 0 persistent cache is narrowed to the reference-data instance (D4).
- **Testing/CI:** introduce the Emulator Suite, rules tests and a staging project; stop running e2e against production.

---

## 17. Roadmap and critical path

| Phase                                            | Where          | What                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** — now, no BE                               | SPA repo       | Security-report Phase 0–1 (remove default-password literals, enforce App Check, staging project, headers/CSP, rules fixes + emulator tests); fix implicit-sign-out cache leakage                                                                                                                                                                                                                                  |
| **1** — make the SPA BE-ready                    | SPA repo       | data-classification table; **PII split design**; **repository layer** (users, registrations, audit, photos); `uid` in query keys + one invalidation helper; DTO/ISO-date mapper; shared package v0; OpenAPI draft; the two Firestore instances (D4)                                                                                                                                                               |
| **2** — BE skeleton                              | BE repo        | Fastify + zod + auth/App Check/CORS/rate-limit/logging, zod-validated env, `/healthz`, Docker, Render **staging**, emulator integration tests, CI (lint/test/audit/gitleaks), OpenAPI generation                                                                                                                                                                                                                  |
| **3** — first endpoints                          | BE + SPA       | create-user (random passwords, claims, audit) → deactivate/revoke → public registration intake + directory JSON → audit/activity writers → email send                                                                                                                                                                                                                                                             |
| **3b** — PII reads, per collection behind a flag | BE + SPA       | PII backfill → users directory/detail/counts/photos → attendance reasons → disciplinary/activities → registrations review; each slice ends with that collection's rules tightening; `no-store`; PII removed from the persister                                                                                                                                                                                    |
| **4** — files                                    | BE + SPA       | `/v1/files` validate/strip/de-dup/bytes; logo/signature stored once; byte quotas; base64 → Bytes migration; **move the Realtime Database large files (`files/…`) behind the BE with real per-role access** and retire the capability-key model                                                                                                                                                                    |
| **5** — IndexedDB cleanup                        | SPA            | confirm no PII in the persistent instance/persister; terminate+clear on all sign-out paths; `Clear-Site-Data` endpoint                                                                                                                                                                                                                                                                                            |
| **6** — jobs                                     | BE + scheduler | retention, export, report-card/summary generation, bulk import, register upsert                                                                                                                                                                                                                                                                                                                                   |
| **7** — production posture                       | infra          | custom domain (~3 mo) + sending sub-domain; **Blaze (~6 mo)** with its prerequisites (App Check enforced, rules fixes, public directory list removed, caps, staging, budget alerts) → kill-switch, PITR + export, TTL (then retire the BE retention job), Cloud Storage via `FileStore`, Identity Platform (disable self-signup, admin MFA); re-evaluate hosting (Cloud Run, no key); Vercel Pro before invoicing |

**Critical path:** Phase 1 is the long pole — 126 files import `firebase/firestore`, ~100 write call sites, no repository layer, `Timestamp` in 12 files, `firebase.ts` unimportable by a server. Phases 2–3 can run in parallel in the new repo, but nothing is **adopted** until each collection has a single seam.

---

## 18. Risks and gotchas

1. **The Admin SDK bypasses rules.** One missing tenant filter = cross-tenant breach with no backstop → tenant-scoped repository + emulator cross-tenant tests are mandatory.
2. **Claims lag; revocation is not instant** (≤1 h in rules). Keep a rules-visible `status` where immediacy matters.
3. **Claims backfill** for every existing account (real + seed) before any rule relies on claims.
4. **Cold start (~60 s) × `retry:1`** = a two-minute worst case → §13.2.
5. **CORS preflight** on every authenticated call (the `Authorization` header forces it): `Access-Control-Max-Age` (Chrome caps at 2 h), batch endpoints.
6. **Auth + Firestore writes are not atomic:** create-user is a saga (Auth create → Firestore batch → claims → audit) with compensation and an idempotency key.
7. **Introduce Firestore transactions and `useMutation`** at the BE seam (0 today).
8. **Quota arithmetic still binds:** per-tenant budgets; spread export/retention over days.
9. **API versioning:** old SPA bundles call the BE after deploys; keep `/v1` additive.
10. **Port the scripts' Admin logic carefully:** the reset script's audit entry omits `recordedAt` and uses a `script:` actor — the BE must write `serverTimestamp()` and a real actor.
11. **No `scripts/lib`:** `initFirebaseAdmin()` is copy-pasted 9×; do not copy that into the BE.
12. **Schedule risk of D1:** PII reads touch the most-used screens; slice per collection behind a flag with an instant fallback to direct reads until its rules are tightened.
13. **Availability risk of D5:** real minors' data flows through a host Render says is not for production — hence the re-evaluation triggers.
14. **Privacy Notice claims** must stay factual; do not add BE-security claims that are untested.
15. **Mobile/desktop later:** the BE must accept App Check from App Attest/Play Integrity as well as reCAPTCHA and keep the API client-agnostic (OpenAPI, no cookies).

---

## 19. Open questions

1. Mobile/desktop client within ~12 months? (OpenAPI-first already covers it; affects App Check providers.)
2. Expected institutions/users in 6–12 months? (How long a single instance is plausible.)
3. Downtime tolerance per PII cutover slice? (Assumed: feature flag per slice, instant rollback to direct reads until the slice's rules are tightened.)
4. Confirm the security-report Phase 0–2 work proceeds independently of the BE.
5. Who operates the BE (patching, key rotation, on-call)?

---

## 20. Sources

Render — [Deploy for Free](https://render.com/docs/free) · [Instance types](https://render.com/docs/compute-plans). Google Cloud — [Cloud Run pricing](https://cloud.google.com/run/pricing) · [Always Free limits](https://docs.cloud.google.com/free/docs/free-cloud-features) · [Starter Tier](https://docs.cloud.google.com/docs/starter-tier). Firebase — [Verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens) · [App Check custom backend](https://firebase.google.com/docs/app-check/custom-resource-backend) · [Auth limits](https://firebase.google.com/docs/auth/limits) · [Storage size](https://firebase.google.com/docs/firestore/storage-size) · [Firestore quotas](https://docs.cloud.google.com/firestore/quotas) · [Cloud Storage requires Blaze](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024). Frameworks — [Fastify vs Express vs Hono](https://betterstack.com/community/guides/scaling-nodejs/fastify-vs-express-vs-hono/) · [NestJS vs Fastify vs Hono](https://encore.dev/articles/nestjs-vs-fastify-vs-hono). Browser — [Clear-Site-Data (MDN)](https://developer.mozilla.org/docs/Web/HTTP/Headers/Clear-Site-Data). Files — [mozjpeg lossless](https://pypi.org/project/mozjpeg-lossless-optimization/1.0.2/) · [oxipng](https://assets.transloadit.com/devtips/optimize-images-without-quality-loss-in-rust-with-oxipng/) · [qpdf-compress](https://cdn.jsdelivr.net/npm/qpdf-compress@0.6.3/README.md). Internal — `internal/security/SECURITY_REPORT_2026-10-06.md`, `FIRESTORE_READ_CACHING_SPEC.md`, `EMAIL_INTEGRATION_SPEC.md`, `INSTITUTION_LOGIN_EMAILS_SPEC.md`, `FIRESTORE_INSTITUTION_NESTING_SPEC.md`, `src/lib/{queryClient,firebase,fieldPatterns,imageUpload,documentUpload}.ts`.
