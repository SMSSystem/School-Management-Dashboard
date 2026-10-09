# Backend API — OpenAPI v0 Endpoint Contract

> **Status:** design / draft v0, **nothing built.** Written 2026-10-06. This is the first wire contract for the backend described in [`BACKEND_ARCHITECTURE_SPEC.md`](./BACKEND_ARCHITECTURE_SPEC.md); the PII field split it relies on is defined in [`PII_SPLIT_DESIGN.md`](./PII_SPLIT_DESIGN.md).
> **Scope of v0:** the endpoints needed for roadmap Phases 3 and 3b (privileged writes, public intake, PII reads) plus the files and sync endpoints they depend on. Later phases (jobs, reports, institution config) are listed as *reserved* in §5 and are not specified yet.
> The YAML in §6 is a complete, parseable OpenAPI 3.1 document. When the BE repo exists, it becomes the source of truth and the SPA generates its types from it; until then this file is the review copy.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| **Base URL** | `https://api.<domain>/v1` (production), `https://api-staging.<domain>/v1` (staging); until the domain exists the pilot host's own URL + `/v1`. |
| **Versioning** | Path prefix `/v1`. Changes within a major version are **additive only** (new optional fields, new endpoints); old SPA bundles keep calling after deploys. Removals go through a `Deprecation`/`Sunset` header and a new major. |
| **Authentication** | `Authorization: Bearer <Firebase ID token>`. Verified with `verifyIdToken`; revocation (`checkRevoked`) is checked and cached 30–60 s. Role, tenant and `pwChangeRequired` come from **custom claims**, never from the request body. |
| **App Check** | `X-Firebase-AppCheck: <token>` on every request that is not `GET /healthz`. Replay protection (`consume`) is applied only to the operations marked `x-sms-appcheck-consume: true`. Until App Check enforcement is on (security report S-04), a missing token is logged, not rejected, on authenticated routes; on **public** routes it is required. |
| **Tenant** | Tenant-scoped routes use the caller's `institutionId` claim. A `super_admin` must send `X-Institution-Id`; for every other role a mismatching header is `403`. The body never carries a tenant id. |
| **Idempotency** | `Idempotency-Key: <uuid>` is **required** on `POST` operations that create or send something. The BE remembers the response for 10 minutes (in memory; lost on restart). `POST /users` is additionally idempotent by e-mail (Auth e-mail uniqueness) so a retry after a lost response cannot create a second account. |
| **Validation** | Every request body is a strict schema (`additionalProperties: false`): unknown fields are rejected, never ignored. Patterns come from the shared package (`fieldPatterns`, RE2-compatible). |
| **Dates** | ISO-8601 strings. Instants are UTC (`2026-10-06T10:32:17.000Z`); dates of birth are `YYYY-MM-DD`. No Firestore `Timestamp` on the wire. |
| **Pagination** | `limit` (default 50, max 200) and opaque `cursor`; responses are `{ items, nextCursor }` (`nextCursor` is `null` on the last page). |
| **Caching** | Every response that can contain PII is `Cache-Control: no-store` (also keeps it out of the HTTP disk cache). `GET /public/directory` is `public, max-age=300, stale-while-revalidate=600` with an `ETag`. Directory/list endpoints may answer conditional requests from the BE cache. |
| **Invalidation** | Every mutation response carries `meta.invalidates`: the TanStack Query keys (`[tenantId, uid, resource, …]`, as arrays) the SPA should invalidate. `GET /sync` returns the same tags for changes made by *other* users since a cursor. |
| **Errors** | `application/problem+json` (RFC 9457) with a stable `code` and the `requestId` (§3). Messages never contain PII or stack traces. |
| **Rate limits** | Per IP (public), per uid and per tenant (authenticated). `429` carries `Retry-After` and `RateLimit-*` headers. |
| **CORS** | Exact-origin allow-list; `Access-Control-Max-Age` set (preflight is forced by the `Authorization` header). |
| **Cold start** | The host may be asleep (~1 min). `GET /healthz` performs **no I/O and needs no auth**; the SPA calls it on login-page mount and after sign-in. Clients treat network errors and `502/503` from the host proxy as "waking up", not as failures. |

---

## 2. Authorisation summary

Roles: `super_admin`, `institution_admin`, `senior_teacher`, `regular_teacher`, `student`, `parent`. The authoritative **role-policy table** lives in the shared package; the table below is the intended v0 outcome per endpoint (details in the endpoint descriptions).

| Endpoint | super_admin | institution_admin | senior_teacher | regular_teacher | student | parent | anonymous |
|---|---|---|---|---|---|---|---|
| `GET /healthz` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `POST /users` | any tenant | own tenant (non-admin roles) | — | — | — | — | — |
| `GET /users` (directory) | any tenant | own tenant | own tenant | own tenant | — | — | — |
| `GET /users/{uid}` | any | own tenant | students in own classes¹ | students in own classes¹ | self | linked child | — |
| `PATCH /users/{uid}` | any | own tenant, not another admin | — | — | — | — | — |
| `POST /users/{uid}/status` | any | own tenant, not another admin | — | — | — | — | — |
| `POST /users/{uid}/password-reset` | any | own tenant, non-admin roles | — | — | — | — | — |
| `GET /me/private` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| `GET /counts` | any | own tenant | own tenant | own tenant | — | — | — |
| `GET /photos` | any | own tenant | own tenant | own tenant | self | linked child | — |
| `POST /public/registrations` | — | — | — | — | — | — | ✔ (App Check, rate limited) |
| `GET /public/directory` | — | — | — | — | — | — | ✔ |
| `GET /registrations` | any | own tenant | — | — | — | — | — |
| `POST /files` | ✔ | ✔ | ✔ | ✔ | ✔ (submissions) | — | — |
| `POST /audit-events` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| `GET /sync` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |

¹ Today's rules let **any teacher in the institution** read every student's full document (a known over-exposure). v0 restricts the *private* part to teachers who teach the student (class/subject enrolment) and exposes only the public projection otherwise. The exact scope is a policy decision recorded in the shared role-policy table, not in this contract.

---

## 3. Error model

`application/problem+json`:

```json
{
  "type": "https://api.<domain>/problems/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "code": "validation_failed",
  "detail": "One or more fields are invalid.",
  "requestId": "01J9ZQ5X6Y8N3V2K4T7M1B0C9D",
  "errors": [{ "field": "email", "code": "pattern", "message": "Enter a valid e-mail address." }]
}
```

| `code` | HTTP | Meaning |
|---|---|---|
| `unauthenticated` | 401 | Missing/invalid/expired ID token, or revoked session |
| `app_check_failed` | 401 | Missing/invalid App Check token on a route that requires it |
| `forbidden` | 403 | Authenticated but not allowed (role, tenant, relationship) |
| `account_inactive` | 403 | The caller's account is deactivated |
| `password_change_required` | 403 | `pwChangeRequired` claim is set; only `/me/password-change-complete` is allowed |
| `not_found` | 404 | Unknown id, **or** an id in another tenant (indistinguishable by design) |
| `conflict` | 409 | e.g. e-mail already in use, duplicate student id |
| `idempotency_mismatch` | 409 | Same `Idempotency-Key` with a different body |
| `validation_failed` | 422 | Schema or pattern failure (`errors[]` populated) |
| `payload_too_large` | 413 | Body or file over its cap |
| `unsupported_media_type` | 415 | File type not allowed (decided by magic bytes, not the name) |
| `rate_limited` | 429 | Per-IP/uid/tenant limit |
| `quota_exhausted` | 503 | Tenant or platform write/storage budget exhausted (`Retry-After`) |
| `upstream_unavailable` | 503 | Firebase/Auth/Email provider failure |
| `internal_error` | 500 | Unexpected; details only in server logs, referenced by `requestId` |

---

## 4. Endpoint index (v0)

| # | Method + path | Purpose | Phase | Class |
|---|---|---|---|---|
| 1 | `GET /healthz` | Liveness/wake ping (no I/O, no auth) | 2 | — |
| 2 | `POST /users` | Create an account (random one-time password, claims, Firestore profile, audit) | 3 | T0 |
| 3 | `PATCH /users/{uid}` | Admin edit of a user's public and/or private fields | 3b | T0/T1 |
| 4 | `POST /users/{uid}/status` | Activate/deactivate (Firestore flag + Auth `disabled` + revoke + claim + audit) | 3 | T0 |
| 5 | `POST /users/{uid}/password-reset` | Admin-initiated reset to a new random one-time password | 3 | T0 |
| 6 | `POST /me/password-change-complete` | Clear `pwChangeRequired` after the user changed their password | 3 | T0 |
| 7 | `GET /users` | Directory (public projection, filters, cursor) | 3b | non-PII |
| 8 | `GET /users/{uid}` | Detail: public profile + (policy permitting) private profile | 3b | T1 |
| 9 | `GET /me/private` | The caller's own private profile (profile page) | 3b | T1 |
| 10 | `GET /counts` | Counts/aggregates replacing full-collection listeners | 3b | non-PII |
| 11 | `GET /photos` | Batch photo lookup by uid | 3b | T1 |
| 12 | `POST /public/registrations` | Anonymous enrolment-registration intake | 3 | T1 (write) |
| 13 | `GET /public/directory` | Small public JSON of institutions accepting registrations | 3 | public |
| 14 | `GET /registrations` | Admin review queue | 3b | T1 |
| 15 | `POST /files` | Upload (validate, strip, de-dup, store as bytes) | 4 | T1 |
| 16 | `POST /audit-events` | Client-attested audit/activity event for actions that stay client-side | 3 | T0 |
| 17 | `GET /sync` | Changed resource tags since a cursor | 3b | — |

### 4.1 Notes per endpoint

1. **`/healthz`** — returns `{ "status": "ok", "version": "<git sha>" }`. Must not touch Firestore/Auth (it would burn quota on every wake ping).
2. **`POST /users`** — validates against the shared patterns; checks uniqueness server-side (`institutionStudentId`, `idNumber`, homeroom conflicts — these checks must always hit the server and are not cacheable); generates a random one-time password; Auth `createUser`; writes the **public** doc and the **private** doc in one batch; sets claims `{role, institutionId, pwChangeRequired:true}`; writes the audit entry with a server timestamp; compensates (`deleteUser`) on any failure. The one-time password is returned **once**, in this response only, and is never logged. Replaces the browser-side secondary-Auth flow and the 90-account import cap rationale.
3. **`PATCH /users/{uid}`** — partial update; `role` and `institutionId` are immutable and rejected if present; an `institution_admin` cannot edit another admin; changing `classId`/`departmentId` etc. is audited. Fields are routed to the public or private doc by the shared field map.
4. **`POST /users/{uid}/status`** — sets `status`, Auth `disabled`, calls `revokeRefreshTokens`, updates claims, audits. The caller must refresh their ID token to see claim changes (≤1 h otherwise).
5. **`POST /users/{uid}/password-reset`** — refuses admin roles (as the existing reset script does); sets a new random one-time password, `pwChangeRequired`, revokes tokens, audits; optionally sends it by e-mail (Phase 3 e-mail work). Returns the password once.
6. **`POST /me/password-change-complete`** — called after the client's own `updatePassword`; the BE verifies the account's password-update time is after the token's `pwChangeRequired` issuance, clears the claim and the flag, revokes older tokens.
7. **`GET /users`** — **non-PII projection only**: `uid, name, firstName, lastName, role, status, gender, classId, houseId/houseName, departmentId/department, institutionStudentId, assignedClass…` (the exact public/private split is defined in `PII_SPLIT_DESIGN.md` §3). Filters `role`, `classId`, `status`, `q` (name prefix), `updatedSince`. Served from the single-writer cache; `ETag`.
8. **`GET /users/{uid}`** — public profile plus `private` when the policy allows; otherwise the `private` key is omitted (not `null`). `no-store`.
9. **`GET /me/private`** — the caller's own phone/address/emergency contact etc. The sign-in path does **not** call this (sign-in uses the public doc only).
10. **`GET /counts`** — `?kind=users&role=student&groupBy=gender|classId|status`; `?kind=classes`. Replaces `UserCard`/`CountChart` listeners that read whole role sets just to count.
11. **`GET /photos?ids=a,b,c`** — up to 50 ids; returns `{ photos: { uid: { dataUrl, updatedAt } | null } }`; replaces the per-user N+1 `getDoc`.
12. **`POST /public/registrations`** — App Check required (`consume`), Turnstile if abuse is seen; per-IP and per-institution counters; strict schema mirroring today's rule shapes (`student`, `mother`, `father`, `academicYearId`); server sets `submittedAt`, `status:'pending'`, `possibleDuplicate:false`; returns `202` with an opaque reference. Replaces the anonymous direct Firestore create.
13. **`GET /public/directory`** — `[{ id, name, slug?, acceptingRegistrations, logoVersion }]` only; the logo is **not** embedded (served by a separate cached URL later). Replaces the public full-collection read.
14. **`GET /registrations`** — admin review queue with `status` filter and cursor; review/convert actions are reserved (§5).
15. **`POST /files`** — `multipart/form-data` (`kind`, `file`); hard size limit per `kind`; type by magic bytes + full decode; strips metadata; computes `sha256` and de-duplicates per tenant; stores bytes through the `FileStore` interface; returns a `fileId` to be referenced from the owning document. Photos/logos/signatures are stored **once** and referenced.
16. **`POST /audit-events`** — for actions the client still performs directly (e.g. saving an attendance register). The BE stamps `performedBy` from the token and `recordedAt` from server time; `eventType` must be in the shared allow-list for the caller's role; `detail` ≤ 300 chars. BE-performed actions write their own audit entries and never use this endpoint.
17. **`GET /sync`** — `?since=<cursor>` → `{ cursor, changes: [{ resource, ids?, at }] }`; the SPA maps changes to query keys and invalidates only those.

---

## 5. Reserved (not specified in v0)

`POST /users:import` (+ `GET /jobs/{id}`) · `PATCH /registrations/{id}` and `POST /registrations/{id}/convert` (replace the client-side conversion flow) · `GET /audit-events` · `PUT /institutions/{id}/brand` (logo/signature as file refs) · `GET /files/{id}` · `POST /jobs/report-cards`, `/jobs/attendance-summaries` · `POST /public/password-requests` (revisit the login-email spec first) · attendance excuse-reason, disciplinary, activities and report-card-comment read endpoints (Phase 3b later slices).

---

## 6. OpenAPI 3.1 document

```yaml
openapi: 3.1.0
info:
  title: SMS Backend API
  version: 0.1.0
  summary: Privileged writes, public intake, PII reads and file handling for the School Management System.
  description: |
    Draft v0. See BACKEND_ARCHITECTURE_SPEC.md and PII_SPLIT_DESIGN.md.
    Every response that can contain PII is Cache-Control: no-store.
servers:
  - url: https://api.example.invalid/v1
    description: Production (placeholder host until the custom domain exists)
  - url: https://api-staging.example.invalid/v1
    description: Staging (placeholder host)
tags:
  - name: system
  - name: users
  - name: registrations
  - name: files
  - name: audit
  - name: sync
security:
  - bearerAuth: []
    appCheck: []
paths:
  /healthz:
    get:
      tags: [system]
      operationId: getHealth
      summary: Liveness / wake ping (no I/O, no auth)
      security: []
      responses:
        '200':
          description: The service is up.
          headers:
            Cache-Control:
              schema: { type: string, const: no-store }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Health' }
  /users:
    post:
      tags: [users]
      operationId: createUser
      summary: Create an account
      description: |
        Creates the Auth user, the public profile, the private profile, claims and the audit entry in one
        flow, compensating on failure. Returns the one-time password once.
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
        - $ref: '#/components/parameters/InstitutionIdHeader'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateUserRequest' }
      responses:
        '201':
          description: Account created.
          headers:
            Cache-Control:
              schema: { type: string, const: no-store }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CreateUserResponse' }
        '409': { $ref: '#/components/responses/Conflict' }
        '422': { $ref: '#/components/responses/ValidationFailed' }
        default: { $ref: '#/components/responses/Problem' }
    get:
      tags: [users]
      operationId: listUsers
      summary: Directory (public projection only)
      parameters:
        - $ref: '#/components/parameters/InstitutionIdHeader'
        - $ref: '#/components/parameters/Limit'
        - $ref: '#/components/parameters/Cursor'
        - name: role
          in: query
          schema: { $ref: '#/components/schemas/Role' }
        - name: classId
          in: query
          schema: { type: string, maxLength: 100 }
        - name: status
          in: query
          schema: { $ref: '#/components/schemas/UserStatus' }
        - name: q
          in: query
          description: Case-insensitive name prefix.
          schema: { type: string, minLength: 1, maxLength: 50 }
        - name: updatedSince
          in: query
          schema: { type: string, format: date-time }
      responses:
        '200':
          description: A page of public profiles.
          headers:
            ETag:
              schema: { type: string }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/UserPage' }
        default: { $ref: '#/components/responses/Problem' }
  /users/{uid}:
    parameters:
      - $ref: '#/components/parameters/Uid'
      - $ref: '#/components/parameters/InstitutionIdHeader'
    get:
      tags: [users]
      operationId: getUser
      summary: User detail (public profile plus private profile when the policy allows)
      responses:
        '200':
          description: The user.
          headers:
            Cache-Control:
              schema: { type: string, const: no-store }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/UserDetail' }
        '404': { $ref: '#/components/responses/NotFound' }
        default: { $ref: '#/components/responses/Problem' }
    patch:
      tags: [users]
      operationId: updateUser
      summary: Admin edit of public and/or private fields
      description: role and institutionId are immutable and rejected if present.
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateUserRequest' }
      responses:
        '200':
          description: Updated.
          headers:
            Cache-Control:
              schema: { type: string, const: no-store }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/UserMutationResponse' }
        '404': { $ref: '#/components/responses/NotFound' }
        '422': { $ref: '#/components/responses/ValidationFailed' }
        default: { $ref: '#/components/responses/Problem' }
  /users/{uid}/status:
    post:
      tags: [users]
      operationId: setUserStatus
      summary: Activate or deactivate an account
      parameters:
        - $ref: '#/components/parameters/Uid'
        - $ref: '#/components/parameters/IdempotencyKey'
        - $ref: '#/components/parameters/InstitutionIdHeader'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/SetStatusRequest' }
      responses:
        '200':
          description: Status changed (Auth disabled/enabled, tokens revoked, claims updated, audited).
          content:
            application/json:
              schema: { $ref: '#/components/schemas/UserMutationResponse' }
        '404': { $ref: '#/components/responses/NotFound' }
        default: { $ref: '#/components/responses/Problem' }
  /users/{uid}/password-reset:
    post:
      tags: [users]
      operationId: resetUserPassword
      summary: Reset to a new random one-time password
      description: Refuses admin roles. The password is returned once and never logged.
      x-sms-appcheck-consume: true
      parameters:
        - $ref: '#/components/parameters/Uid'
        - $ref: '#/components/parameters/IdempotencyKey'
        - $ref: '#/components/parameters/InstitutionIdHeader'
      requestBody:
        required: false
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PasswordResetRequest' }
      responses:
        '200':
          description: Reset done.
          headers:
            Cache-Control:
              schema: { type: string, const: no-store }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PasswordResetResponse' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        default: { $ref: '#/components/responses/Problem' }
  /me/password-change-complete:
    post:
      tags: [users]
      operationId: completePasswordChange
      summary: Clear the pwChangeRequired claim after the user changed their password
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      responses:
        '204':
          description: Cleared. The client must refresh its ID token (getIdToken(true)).
        '409': { $ref: '#/components/responses/Conflict' }
        default: { $ref: '#/components/responses/Problem' }
  /me/private:
    get:
      tags: [users]
      operationId: getMyPrivateProfile
      summary: The caller's own private profile
      responses:
        '200':
          description: The caller's private profile.
          headers:
            Cache-Control:
              schema: { type: string, const: no-store }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PrivateProfile' }
        default: { $ref: '#/components/responses/Problem' }
  /counts:
    get:
      tags: [users]
      operationId: getCounts
      summary: Aggregate counts (replaces full-collection listeners)
      parameters:
        - $ref: '#/components/parameters/InstitutionIdHeader'
        - name: kind
          in: query
          required: true
          schema: { type: string, enum: [users, classes] }
        - name: role
          in: query
          schema: { $ref: '#/components/schemas/Role' }
        - name: groupBy
          in: query
          schema: { type: string, enum: [gender, classId, status] }
      responses:
        '200':
          description: Counts.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CountsResponse' }
        default: { $ref: '#/components/responses/Problem' }
  /photos:
    get:
      tags: [users]
      operationId: getPhotos
      summary: Batch photo lookup
      parameters:
        - $ref: '#/components/parameters/InstitutionIdHeader'
        - name: ids
          in: query
          required: true
          description: Comma-separated uids, at most 50.
          schema: { type: string, maxLength: 2000 }
      responses:
        '200':
          description: Photos by uid (null when none).
          headers:
            Cache-Control:
              schema: { type: string, const: no-store }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PhotosResponse' }
        default: { $ref: '#/components/responses/Problem' }
  /public/registrations:
    post:
      tags: [registrations]
      operationId: submitRegistration
      summary: Anonymous enrolment-registration intake
      description: |
        App Check required; per-IP and per-institution counters apply. The server sets submittedAt,
        status and possibleDuplicate.
      x-sms-appcheck-consume: true
      security:
        - appCheck: []
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/SubmitRegistrationRequest' }
      responses:
        '202':
          description: Accepted for review.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/RegistrationAccepted' }
        '422': { $ref: '#/components/responses/ValidationFailed' }
        '429': { $ref: '#/components/responses/RateLimited' }
        default: { $ref: '#/components/responses/Problem' }
  /public/directory:
    get:
      tags: [registrations]
      operationId: getPublicDirectory
      summary: Institutions accepting registrations (small, cacheable JSON)
      security:
        - appCheck: []
      responses:
        '200':
          description: The directory.
          headers:
            Cache-Control:
              schema: { type: string, const: 'public, max-age=300, stale-while-revalidate=600' }
            ETag:
              schema: { type: string }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PublicDirectory' }
        '304':
          description: Not modified.
  /registrations:
    get:
      tags: [registrations]
      operationId: listRegistrations
      summary: Admin review queue
      parameters:
        - $ref: '#/components/parameters/InstitutionIdHeader'
        - $ref: '#/components/parameters/Limit'
        - $ref: '#/components/parameters/Cursor'
        - name: status
          in: query
          schema: { $ref: '#/components/schemas/RegistrationStatus' }
      responses:
        '200':
          description: A page of registrations.
          headers:
            Cache-Control:
              schema: { type: string, const: no-store }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/RegistrationPage' }
        default: { $ref: '#/components/responses/Problem' }
  /files:
    post:
      tags: [files]
      operationId: uploadFile
      summary: Upload a file (validate, strip metadata, de-duplicate, store as bytes)
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
        - $ref: '#/components/parameters/InstitutionIdHeader'
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              additionalProperties: false
              required: [kind, file]
              properties:
                kind: { $ref: '#/components/schemas/FileKind' }
                file: { type: string, contentEncoding: base64 }
      responses:
        '201':
          description: Stored (or matched an existing identical file in this tenant).
          content:
            application/json:
              schema: { $ref: '#/components/schemas/FileRef' }
        '413': { $ref: '#/components/responses/Problem' }
        '415': { $ref: '#/components/responses/Problem' }
        default: { $ref: '#/components/responses/Problem' }
  /audit-events:
    post:
      tags: [audit]
      operationId: recordAuditEvent
      summary: Record a client-attested audit/activity event
      description: |
        performedBy comes from the token and recordedAt from server time; eventType must be in the shared
        allow-list for the caller's role. BE-performed actions write their own entries.
      parameters:
        - $ref: '#/components/parameters/InstitutionIdHeader'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/AuditEventRequest' }
      responses:
        '202':
          description: Recorded.
        '422': { $ref: '#/components/responses/ValidationFailed' }
        default: { $ref: '#/components/responses/Problem' }
  /sync:
    get:
      tags: [sync]
      operationId: getSync
      summary: Resource changes made by others since a cursor
      parameters:
        - $ref: '#/components/parameters/InstitutionIdHeader'
        - name: since
          in: query
          description: Opaque cursor from a previous response; omit on first call.
          schema: { type: string, maxLength: 200 }
      responses:
        '200':
          description: Changes and the next cursor.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SyncResponse' }
        default: { $ref: '#/components/responses/Problem' }
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: Firebase ID token (JWT)
    appCheck:
      type: apiKey
      in: header
      name: X-Firebase-AppCheck
  parameters:
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: true
      schema: { type: string, format: uuid }
    InstitutionIdHeader:
      name: X-Institution-Id
      in: header
      required: false
      description: Required for super_admin on tenant-scoped routes; a mismatching value is 403 for every other role.
      schema: { type: string, maxLength: 100 }
    Uid:
      name: uid
      in: path
      required: true
      schema: { type: string, minLength: 1, maxLength: 128 }
    Limit:
      name: limit
      in: query
      schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
    Cursor:
      name: cursor
      in: query
      schema: { type: string, maxLength: 500 }
  responses:
    Problem:
      description: Error.
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    Forbidden:
      description: Not allowed.
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    NotFound:
      description: Not found (or in another tenant).
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    Conflict:
      description: Conflict.
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    ValidationFailed:
      description: Validation failed.
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    RateLimited:
      description: Rate limited.
      headers:
        Retry-After:
          schema: { type: integer }
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
  schemas:
    Health:
      type: object
      additionalProperties: false
      required: [status]
      properties:
        status: { type: string, const: ok }
        version: { type: string }
    Problem:
      type: object
      required: [type, title, status, code, requestId]
      properties:
        type: { type: string }
        title: { type: string }
        status: { type: integer }
        code: { type: string }
        detail: { type: string }
        requestId: { type: string }
        errors:
          type: array
          items:
            type: object
            required: [field, code]
            properties:
              field: { type: string }
              code: { type: string }
              message: { type: string }
    Role:
      type: string
      enum: [super_admin, institution_admin, senior_teacher, regular_teacher, student, parent]
    UserStatus:
      type: string
      enum: [active, inactive]
    Gender:
      type: string
      enum: [Male, Female]
    Name:
      type: string
      minLength: 1
      maxLength: 100
      description: Matches the shared namePattern.
    Email:
      type: string
      maxLength: 254
      description: Matches the shared emailPattern and passes zod .email().
    Phone:
      type: string
      description: Matches the shared phonePattern; stored canonicalised (E.164 for NANP).
    IsoDate:
      type: string
      format: date
      description: YYYY-MM-DD
    Invalidates:
      type: array
      description: TanStack Query keys the SPA should invalidate.
      items:
        type: array
        items: { type: [string, number, boolean, 'null'] }
    Meta:
      type: object
      properties:
        invalidates: { $ref: '#/components/schemas/Invalidates' }
    PublicProfile:
      type: object
      additionalProperties: false
      required: [uid, name, role, institutionId, status]
      properties:
        uid: { type: string }
        name: { type: string }
        firstName: { type: string }
        lastName: { type: string }
        role: { $ref: '#/components/schemas/Role' }
        institutionId: { type: string }
        status: { $ref: '#/components/schemas/UserStatus' }
        classId: { type: ['string', 'null'] }
        houseId: { type: ['string', 'null'] }
        houseName: { type: ['string', 'null'] }
        departmentId: { type: ['string', 'null'] }
        department: { type: ['string', 'null'] }
        institutionStudentId: { type: ['string', 'null'] }
        gender:
          description: Public by recommendation (PII_SPLIT_DESIGN.md decision C); move to PrivateProfile if policy changes.
          oneOf: [{ $ref: '#/components/schemas/Gender' }, { type: 'null' }]
        assignedClassId: { type: ['string', 'null'] }
        assignedClassName: { type: ['string', 'null'] }
        homeroomRoom: { type: ['string', 'null'] }
        homeroomBuilding: { type: ['string', 'null'] }
        canGenerateSchedule: { type: boolean }
        mustChangePassword: { type: boolean }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
    PrivateProfile:
      type: object
      additionalProperties: false
      description: |
        PII. Lives in users/{uid}/private/profile and is readable only through the BE.
        The authoritative field map is in PII_SPLIT_DESIGN.md.
      properties:
        email: { $ref: '#/components/schemas/Email' }
        phone: { $ref: '#/components/schemas/Phone' }
        phone2: { oneOf: [{ $ref: '#/components/schemas/Phone' }, { type: 'null' }] }
        idNumber: { type: ['string', 'null'], maxLength: 50 }
        dateOfBirth: { oneOf: [{ $ref: '#/components/schemas/IsoDate' }, { type: 'null' }] }
        address: { type: ['string', 'null'], maxLength: 300 }
        emergencyContact: { type: ['string', 'null'], maxLength: 300 }
        linkedAccounts: { type: ['string', 'null'], maxLength: 300 }
        updatedAt: { type: string, format: date-time }
    UserDetail:
      type: object
      additionalProperties: false
      required: [profile]
      properties:
        profile: { $ref: '#/components/schemas/PublicProfile' }
        private:
          $ref: '#/components/schemas/PrivateProfile'
        photo:
          oneOf: [{ $ref: '#/components/schemas/Photo' }, { type: 'null' }]
    UserPage:
      type: object
      additionalProperties: false
      required: [items, nextCursor]
      properties:
        items:
          type: array
          items: { $ref: '#/components/schemas/PublicProfile' }
        nextCursor: { type: ['string', 'null'] }
    CreateUserRequest:
      type: object
      additionalProperties: false
      required: [role, firstName, lastName, email]
      properties:
        role: { $ref: '#/components/schemas/Role' }
        firstName: { $ref: '#/components/schemas/Name' }
        lastName: { $ref: '#/components/schemas/Name' }
        email: { $ref: '#/components/schemas/Email' }
        phone: { $ref: '#/components/schemas/Phone' }
        phone2: { $ref: '#/components/schemas/Phone' }
        idNumber: { type: string, maxLength: 50 }
        address: { type: string, maxLength: 300 }
        emergencyContact: { type: string, maxLength: 300 }
        classId: { type: string, maxLength: 100 }
        dateOfBirth: { $ref: '#/components/schemas/IsoDate' }
        gender: { $ref: '#/components/schemas/Gender' }
        institutionStudentId: { type: string, maxLength: 50 }
        departmentId: { type: string, maxLength: 100 }
        assignedClassId: { type: string, maxLength: 100 }
        homeroomRoom: { type: string, maxLength: 100 }
        homeroomBuilding: { type: string, maxLength: 100 }
        photoFileId:
          type: string
          description: A fileId returned by POST /files (kind=photo).
    CreateUserResponse:
      type: object
      additionalProperties: false
      required: [profile, oneTimePassword, meta]
      properties:
        profile: { $ref: '#/components/schemas/PublicProfile' }
        oneTimePassword:
          type: string
          description: Shown once; never logged or returned again.
        meta: { $ref: '#/components/schemas/Meta' }
    UpdateUserRequest:
      type: object
      additionalProperties: false
      minProperties: 1
      description: role and institutionId are not accepted.
      properties:
        firstName: { $ref: '#/components/schemas/Name' }
        lastName: { $ref: '#/components/schemas/Name' }
        email: { $ref: '#/components/schemas/Email' }
        phone: { $ref: '#/components/schemas/Phone' }
        phone2: { oneOf: [{ $ref: '#/components/schemas/Phone' }, { type: 'null' }] }
        idNumber: { type: ['string', 'null'], maxLength: 50 }
        address: { type: ['string', 'null'], maxLength: 300 }
        emergencyContact: { type: ['string', 'null'], maxLength: 300 }
        classId: { type: ['string', 'null'], maxLength: 100 }
        dateOfBirth: { oneOf: [{ $ref: '#/components/schemas/IsoDate' }, { type: 'null' }] }
        gender: { oneOf: [{ $ref: '#/components/schemas/Gender' }, { type: 'null' }] }
        institutionStudentId: { type: ['string', 'null'], maxLength: 50 }
        departmentId: { type: ['string', 'null'], maxLength: 100 }
        houseId: { type: ['string', 'null'], maxLength: 100 }
        canGenerateSchedule: { type: boolean }
        assignedClassId: { type: ['string', 'null'], maxLength: 100 }
        homeroomRoom: { type: ['string', 'null'], maxLength: 100 }
        homeroomBuilding: { type: ['string', 'null'], maxLength: 100 }
        photoFileId: { type: ['string', 'null'] }
    UserMutationResponse:
      type: object
      additionalProperties: false
      required: [profile, meta]
      properties:
        profile: { $ref: '#/components/schemas/PublicProfile' }
        meta: { $ref: '#/components/schemas/Meta' }
    SetStatusRequest:
      type: object
      additionalProperties: false
      required: [status]
      properties:
        status: { $ref: '#/components/schemas/UserStatus' }
        reason: { type: string, maxLength: 300 }
    PasswordResetRequest:
      type: object
      additionalProperties: false
      properties:
        sendEmail:
          type: boolean
          default: false
          description: Deliver the new password by e-mail instead of returning it (needs the e-mail phase).
    PasswordResetResponse:
      type: object
      additionalProperties: false
      required: [meta]
      properties:
        oneTimePassword:
          type: string
          description: Present unless sendEmail was requested and succeeded. Shown once.
        emailed: { type: boolean }
        meta: { $ref: '#/components/schemas/Meta' }
    CountsResponse:
      type: object
      additionalProperties: false
      required: [total]
      properties:
        total: { type: integer, minimum: 0 }
        groups:
          type: object
          additionalProperties: { type: integer, minimum: 0 }
    Photo:
      type: object
      additionalProperties: false
      required: [dataUrl]
      properties:
        dataUrl:
          type: string
          description: Kept as a data URL in v0 for SPA compatibility; stored as bytes server-side.
        updatedAt: { type: string, format: date-time }
    PhotosResponse:
      type: object
      additionalProperties: false
      required: [photos]
      properties:
        photos:
          type: object
          additionalProperties:
            oneOf: [{ $ref: '#/components/schemas/Photo' }, { type: 'null' }]
    Guardian:
      type: object
      additionalProperties: false
      required: [lastName, firstName, address, contact, email, occupation]
      properties:
        lastName: { type: string, maxLength: 100 }
        firstName: { type: string, maxLength: 100 }
        address: { type: string, maxLength: 300 }
        contact: { $ref: '#/components/schemas/Phone' }
        email: { $ref: '#/components/schemas/Email' }
        occupation: { type: string, maxLength: 100 }
        work: { type: string, maxLength: 100 }
    RegistrationStudent:
      type: object
      additionalProperties: false
      required: [lastName, firstName, requestedClass, dateOfBirth, gender, email]
      properties:
        lastName: { type: string, maxLength: 100 }
        firstName: { type: string, maxLength: 100 }
        middleName: { type: string, maxLength: 100 }
        requestedClass: { type: string, maxLength: 50 }
        dateOfBirth: { $ref: '#/components/schemas/IsoDate' }
        gender: { $ref: '#/components/schemas/Gender' }
        email: { $ref: '#/components/schemas/Email' }
        lastSchoolAttended: { type: string, maxLength: 200 }
        phone: { $ref: '#/components/schemas/Phone' }
        phone2: { $ref: '#/components/schemas/Phone' }
        citizenId: { type: string, maxLength: 50 }
        photoFileId:
          type: string
          description: A fileId from an anonymous-scope photo upload (reserved), not an inline data URL.
    SubmitRegistrationRequest:
      type: object
      additionalProperties: false
      required: [institutionId, academicYearId, student]
      properties:
        institutionId: { type: string, maxLength: 100 }
        academicYearId: { type: string, maxLength: 100 }
        student: { $ref: '#/components/schemas/RegistrationStudent' }
        mother:
          oneOf: [{ $ref: '#/components/schemas/Guardian' }, { type: 'null' }]
        father:
          oneOf: [{ $ref: '#/components/schemas/Guardian' }, { type: 'null' }]
    RegistrationAccepted:
      type: object
      additionalProperties: false
      required: [reference]
      properties:
        reference: { type: string }
    RegistrationStatus:
      type: string
      enum: [pending, reviewed, converted, rejected]
    PublicDirectory:
      type: object
      additionalProperties: false
      required: [institutions]
      properties:
        institutions:
          type: array
          items:
            type: object
            additionalProperties: false
            required: [id, name, acceptingRegistrations]
            properties:
              id: { type: string }
              name: { type: string }
              slug: { type: string }
              acceptingRegistrations: { type: boolean }
              logoVersion: { type: string }
    RegistrationPage:
      type: object
      additionalProperties: false
      required: [items, nextCursor]
      properties:
        items:
          type: array
          items:
            type: object
            required: [id, status, submittedAt, student]
            properties:
              id: { type: string }
              status: { $ref: '#/components/schemas/RegistrationStatus' }
              academicYearId: { type: string }
              academicYearName: { type: string }
              possibleDuplicate: { type: boolean }
              submittedAt: { type: string, format: date-time }
              student: { $ref: '#/components/schemas/RegistrationStudent' }
              mother: { oneOf: [{ $ref: '#/components/schemas/Guardian' }, { type: 'null' }] }
              father: { oneOf: [{ $ref: '#/components/schemas/Guardian' }, { type: 'null' }] }
        nextCursor: { type: ['string', 'null'] }
    FileKind:
      type: string
      enum: [photo, logo, signature, attachment, submission]
    FileRef:
      type: object
      additionalProperties: false
      required: [fileId, contentType, size, sha256]
      properties:
        fileId: { type: string }
        contentType: { type: string }
        size: { type: integer, minimum: 0 }
        sha256: { type: string, pattern: '^[0-9a-f]{64}$' }
        deduplicated: { type: boolean }
    AuditEventRequest:
      type: object
      additionalProperties: false
      required: [eventType, targetUid, targetName]
      properties:
        eventType:
          type: string
          description: Must be in the shared audit allow-list for the caller's role.
        detail: { type: string, maxLength: 300 }
        targetUid: { type: string, maxLength: 128 }
        targetName: { type: string, maxLength: 200 }
    SyncResponse:
      type: object
      additionalProperties: false
      required: [cursor, changes]
      properties:
        cursor: { type: string }
        changes:
          type: array
          items:
            type: object
            additionalProperties: false
            required: [resource, at]
            properties:
              resource: { type: string }
              ids:
                type: array
                items: { type: string }
              at: { type: string, format: date-time }
```
