# Offline attendance

**Status:** planned 2026-11-19. Slice A shipped in v2.54.0 and slice B in v2.55.0. Slice C is split in two: C1 (the outbox, behind a per-institution switch) shipped in v2.56.0, and C2 (the tray, notices and expiry) in v2.57.0; the pilot school can now get the switch. Slice D (the idle lock while offline) is in progress, and slice E follows.
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

- **Switch:** on only where a super admin has set `offlineOutbox: true` on the institution document, read at sign-in at no extra cost. Missing or false means saves go straight to the server as before; anything already queued is kept but not sent. The switch is read at sign-in, so turning it on or off takes effect at each person's next sign-in or reload. Until the sender has started (the switch is on), nothing is sent and no retry is scheduled. The pilot school gets it once slice C2 has shipped.
- **Every save goes through it** where it is on, online too: queued first, then sent at once. One code path, and a save that hangs on a weak link is never lost.
- **Storage:** its own encrypted IndexedDB database, `sms_outbox`, which sign-out does not delete (`lib/offline/outboxStore.ts`). Each item is sealed with the person's key; the owner and the register are one-way tags on disk. A second save of the same register folds into an item not yet tried and not expired.
- **Commands:** per-student changes, each with the value it was changed from (`lib/offline/registerCommands.ts`). A save is compared with the saved register plus the person's own unsent changes, so changing a queued mark back is sent too.
- **Sending** (`lib/offline/outboxSender.ts`): one sender per person across tabs (a Web Lock), started by the sidebar on any page, and woken again when the person's key arrives after a fresh sign-in, so work left unsent at sign-out goes then. Each item is one transaction that reads the register: if `lastOpByUser.{uid}` already holds the item's id, an earlier try landed and nothing is written. Otherwise each student is applied, skipped, or set aside as a clash, and the register, `lastOpByUser`, `markedAt` and an audit entry are written together. A try longer than 12 seconds is "unknown" and retried; errors back off with jitter, a refused save is retried three times before it is shown as refused, and an exhausted quota holds sending until 08:00 UTC (`lib/offline/outboxPolicy.ts`). Each class's summary is rebuilt once after a round.
- **Pages:** Save buttons say "saved on this device", "Sending…" or ✓. The page keeps its draft until the save is sent, so queued marks stay on screen. A Save All queues one item, with one audit entry, per session.
- **Clashes** (a student someone else changed meanwhile; a renamed student with the same mark isn't one) wait for a choice, per student with "keep all mine" and "keep all theirs". A choice is queued as its own item, never folded into an older one. A refused save shows its reason and can be discarded; its marks stay in the draft.
- **Tray (slice C2):** for staff who work offline, the header shows "N unsent" while anything waits, with a dot when a register needs a choice, was refused or expired. It opens a list of every register saved on this device and not yet sent, with "Choose marks", "Send anyway" (expired), "Discard" (two clicks: "Discard for good?"), "Send now" and "Export all". Counts are of registers, not saves. With the switch off it still lists what is there, for export or discard. The tray is loaded on demand (`components/attendance/OutboxTray.tsx`) and reads only the device's outbox: no Firestore reads. If its code can't load, the header shows nothing in its place and the app carries on. Known limit: a Logout in the first moment after sign-in, before the tray has loaded, doesn't warn; the work still stays and is sent at the next sign-in.
- **Sign-out (slice C2):** Logout with unsent work first says how many registers haven't been sent and that they stay on this device, encrypted, for up to 7 days. It offers "Send now" (online, switch on, something to send: signs out once everything that sends on its own has gone, leaving clashes, refusals and expired saves on the device, or gives the choice back after 15 seconds), "Export" and "Sign out anyway". The idle sign-out doesn't ask: the work stays, and the next sign-in says so.
- **Sign-in (slice C2):** once per sign-in in a tab, a notice says how many saves an earlier session left and that they are being sent (or waiting, with the switch off). A reload doesn't repeat it.
- **Expiry (slice C2):** an item 7 days old stops sending on its own, so a week-old mark can't overwrite newer work, and holds its register's later items behind it. A new save of that register is queued as its own item. A dialog lists expired items with "Export", "Send anyway" (another 7 days, tried at once) and "Discard" (two clicks). The register's Save button stops saying "saved on this device" for it. Nothing of the person's is deleted without their click; a device clock set ahead only brings the dialog early.
- **Tidying (slice C2):** at sign-in, rows of anyone on the device that expired more than 7 days earlier (14 days after they were queued) are removed, reading only their plain expiry time. Another person's seal is never opened.
- **Export (slice C2):** a CSV made in the browser, `unsent-attendance-YYYY-MM-DD.csv`, one row per student change: register, student, mark, reason, previous mark, when it was queued and its state. Once saved, the file is the person's to look after.
- **Connection banner:** it sits at the bottom of the screen, below dialogs, so it no longer covers the header's Logout button or a dialog's buttons. While it shows, the page keeps room for it at the bottom (`--offline-banner-h`), so the end of a page, such as a register's Save buttons, is never under it. The tray's dialogs are drawn at the page's top level, outside the sticky header.

### Idle lock while offline (slice D)

- **When it locks:** a teacher, senior teacher or institution admin (the roles that work offline) reaches the idle limit (5 minutes) while the device is offline: the browser says so, or the app couldn't reach its servers (the same signals as the connection banner). Instead of signing out, the tab locks. Everyone else, and everyone online, is signed out as before. A sign-out offline would delete the device's drafts and reload to a sign-in page that can't load until slice E.
- **What the lock does:** the lock screen replaces the whole dashboard (`components/IdleLockGate.tsx` in `Protected.tsx`). The header, sidebar and page are unmounted, so no school data is on screen or in the page. It shows the school's name and logo and the person's name. Register drafts were already saved, encrypted, and come back after unlocking. The lock lives in the tab's `sessionStorage` (`lib/offline/idleLock.ts`), so a reload stays locked. The idle timer stops while locked and starts afresh after unlocking. The lock screen is part of the app's main code, not loaded on demand, because it shows when nothing new can be downloaded.
- **Unlocking:** with the account password, checked against a verifier kept only in that tab's `sessionStorage` (`lib/offline/unlockVerifier.ts`): PBKDF2-SHA-256, 600,000 iterations, a random 16-byte salt and a 32-byte hash. The password itself is never stored. The verifier is made at every password sign-in (in the background) and again when the password changes, so an old password can't unlock. A check takes about 0.1 s on a desktop and up to a second or so on an older phone.
- **Back online while locked:** the tab stays locked until the password is typed, then carries on.
- **Wrong passwords:** five wrong passwords sign out, through the usual sign-out. Unsent register saves are kept, because the outbox is never deleted at sign-out.
- **A tab with no verifier** (signed in before this shipped, or with storage blocked): it locks all the same, says it can't be unlocked offline, and signs out as soon as it's back online.
- **Sign out instead:** the lock screen offers it, after a warning that the device's unsaved drafts are deleted and, offline, that the sign-in page won't open until the connection is back.
- **Limits:** someone with the browser's developer tools on that tab could copy the verifier and try passwords against it elsewhere; PBKDF2 makes each guess slow. A duplicated tab copies `sessionStorage`, so it has the same verifier and the same lock. A button to lock on purpose is deferred (`docs/BACKLOG.md`).

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
  - A regular teacher of the subject may read a subject register that doesn't exist yet, identified by its fixed `sa_` id (slice C). The outbox's transaction reads the register before its first save.
- **Indexes:** none.
- **Reads:** about one read per sign-in for the key. With the outbox on, each register save reads its register once in the sending transaction (plus one rule `get` for a subject register that doesn't exist yet); a repeat recognised by `lastOpByUser` writes nothing. The prefetch reads today's registers only: about one read per student and one per saved register, so roughly 40 to 180 reads per teacher, once a day on each device. Copies cost no reads.

## Limits

- **Closing the tab ends offline use:** the key and session go with the tab, and signing in again needs the internet. Unsent work stays encrypted until the same person signs in.
- **Same student, two devices:** someone has to choose which change to keep.
- **No background sending:** nothing sends while the app is closed, including on iOS.
- **Script injection:** this design doesn't protect against it. The content security policy is the control.
