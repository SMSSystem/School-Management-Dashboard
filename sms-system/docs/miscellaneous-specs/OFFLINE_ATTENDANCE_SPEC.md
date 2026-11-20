# Offline attendance

**Status:** planned 2026-11-19. Slice A shipped in v2.54.0; slice B in progress. Slices C to E follow, one pull request each.
**Scope:** the General and Subject Attendance registers. The gradebook reuses the same parts later.

## Why

A school using the app has slow internet all day and loses it for a couple of hours most days. Today an outage can lose work:

- Unsaved saves live only in the Firestore SDK's memory and are lost on a reload.
- A reload while offline signs the person out, which wipes their attendance drafts.
- The 5-minute staff idle sign-out does the same.
- Without a service worker, the browser can't even load the app offline.

## Design rules

- **Nothing is scheduled by the clock.** The app decides it's offline from what actually happens: failed or timed-out requests, the browser's offline event, and a light check. A one-minute drop and a three-hour outage are handled the same way.
- **Slow is normal.** Pages show what they have, marked as possibly out of date, rather than waiting.
- **The server is the only source of truth.** The device keeps working copies and unsent work only.
- **Nothing personal is kept in plain text.** Data on the device is encrypted, and working copies are deleted at sign-out.

## Decisions

| Topic              | Decision                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reach              | Within a signed-in tab: reload, move between register pages and keep marking with no internet, for as long as it lasts. Closing the tab still ends the session                            |
| Idle while offline | Lock the screen and hide data instead of signing out. Unlock with the account password, checked against a record kept only for that tab's session. Online, the usual sign-out rules apply |
| Pages              | Both attendance registers. The gradebook comes later                                                                                                                                      |
| Code on device     | Core app plus the two register pages. Other pages say they need the internet                                                                                                              |
| Updates            | Switch at a safe moment: online, with nothing unsaved or unsent, on a page change or sign-in. Otherwise an "Update ready" notice. Never reloads during marking                            |
| Installable app    | Not in this work                                                                                                                                                                          |
| Safety switch      | A tested setting that removes the service worker from every device                                                                                                                        |
| Unsent work        | Encrypted, kept after sign-out for up to 7 days, sent when the same person signs in again                                                                                                 |
| Conflicts          | Different students merge. The same student changed on two devices goes to a keep-mine or keep-theirs choice                                                                               |
| Out of scope       | Online exams and student submissions                                                                                                                                                      |

## Parts

### Encrypted session store

- **Where:** `src/lib/offline/`, on IndexedDB, with a memory fallback.
- **Key:**
  - A random AES-GCM key per user, in an owner-only document, `users/{uid}/deviceKeys/outbox`.
  - Created at the first sign-in of a staff role.
  - Kept as raw bytes in `sessionStorage`, so it survives a reload and goes when the tab closes.
- **Records:** each one is encrypted with a fresh IV, and bound to its id.
- **Two kinds:**
  - **Working copies:** profile, institution, class lists, the week's registers and drafts. Deleted at sign-out.
  - **Unsent work:** kept after sign-out for up to 7 days (slice C).

### Offline-safe start (slice A)

- **Profile read failure:** if reading the profile fails because the device is offline, the app uses the working copy of the profile and institution, saved at the last online start of that tab. Only a real answer still signs out: a missing profile, an inactive account, or a reset session.
- **No working copy:** the app shows "Can't reach the server" and carries on when the connection returns.

### Register working copies (slice B)

- **While online:** a register page saves its class list, subject enrolment and the week's saved registers as working copies. The calendar, classes and subjects keep copies too, through the shared reference-data reads (`lib/offline/workingCopyReads.ts`).
- **After sign-in:** today's registers are fetched in the background, once a day on each device (`lib/offline/prefetchRegisters.ts`, remembered as `sms_offline_prefetched` and removed at sign-out): a senior teacher's homeroom, and each class of a subject a regular teacher has a session with today. Subjects taught to the whole institution are skipped; they get a copy when opened. Admins get no prefetch. While online, the sidebar also loads both register pages' code for every staff role that works offline (`preloadRegisterPages` in `routes/lazyPages.ts`): without it, a register not yet opened in the tab can't load offline. Back online, a register page reads its students again once the server answers, so the copy notice goes without leaving the page. When the browser already reports being offline, pages show the copy at once instead of waiting for Firestore to give up on the server, and a register says "Loading students…" rather than that the class is empty while its students are read.
- **Offline:** in a tab that's already open (loading the app offline needs slice E), pages read the copies. A read counts as offline when it fails for being offline, or when the Firestore SDK answers from its cache. Only server answers are kept. The week's registers lay the SDK's cache over the copy, so an edit made offline shows with the rest of the register.
- **Notices:** "Offline: showing the copy saved at …" while a page shows a copy, and "Waiting for connection" while a save waits. Saving itself is unchanged until slice C: the draft stays until the server confirms.

### Outbox (slice C)

- Typed save commands send per-student changes, with `lastOpByUser` so a repeated send can be recognised.
- One sender per person across tabs.
- Timeouts are treated as "unknown", not failed.
- Also: a tray of unsent work, status beside the connection banner, the keep-mine or keep-theirs screen, sign-out and sign-in notices, 7-day expiry with export, and a kill switch.

### Idle lock while offline (slice D)

- **Password unlock:** a PBKDF2 verifier is created at password sign-in and kept only in `sessionStorage`.
- **Failed attempts:** five wrong passwords sign out, keeping unsent work.
- **Accounts without a password** (sign-in links): the lock says "Reconnect to sign in".

### Service worker (slice E)

- **Plugin:** `vite-plugin-pwa`.
- **Kept on device:** the shell and the register pages' code. It never caches Firebase traffic or school data.
- **Navigation:** any page load falls back to the stored `index.html`.
- **Updates:** at a safe moment, as in the decisions above.
- **Hosting:** `vercel.json` serves `sw.js` uncached and outside the SPA rewrite.
- **Safety switch:** a self-removing build, documented in the deploy notes.

## Firebase

- **Rules:**
  - The key document is readable and creatable by its owner only. It can't be updated or deleted from the app.
  - A regular teacher may read a subject register that doesn't exist yet (slice C).
- **Indexes:** none.
- **Reads:** about one read per sign-in for the key. The prefetch reads today's registers only: about one read per student and one per saved register, so roughly 40 to 180 reads per teacher, once a day on each device. Copies cost no reads.

## Limits

- **Closing the tab ends offline use:** the key and session go with the tab, and signing in again needs the internet. Unsent work stays encrypted until the same person signs in.
- **Same student, two devices:** someone has to choose which change to keep.
- **No background sending:** nothing sends while the app is closed, including on iOS.
- **Script injection:** this design doesn't protect against it. The content security policy is the control.
