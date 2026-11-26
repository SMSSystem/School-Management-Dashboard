# Offline attendance

**Status:** planned 2026-11-19. Slice A shipped in v2.54.0 and slice B in v2.55.0. Slice C is split in two: C1 (the outbox, behind a per-institution switch) shipped in v2.56.0, and C2 (the tray, notices and expiry) in v2.57.0; the pilot school can now get the switch. Slice D (the idle lock while offline) shipped in v2.58.0 and slice E (the service worker) in v2.61.0, completing phase 1. The Lock button for offline staff follows slice D's design (below).
**Scope:** the General and Subject Attendance registers. The gradebook reuses the same parts later.

## Why

A school using the app has slow internet all day and loses it for a couple of hours most days. Today an outage can lose work:

- Unsaved saves live only in the Firestore SDK's memory and are lost on a reload.
- A reload while offline signs the person out, which wipes their attendance drafts.
- The 5-minute staff idle sign-out does the same.
- Without a service worker, the browser can't even load the app offline (slice E adds one).

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
- **Offline:** in a tab that's already open, or reloaded offline (slice E keeps the app's code), pages read the copies. A read counts as offline when it fails for being offline, or when the Firestore SDK answers from its cache. Only server answers are kept. The week's registers lay the SDK's cache over the copy, so an edit made offline shows with the rest of the register.
- **Notices:** "Offline: showing the copy saved at …" while a page shows a copy, and "Waiting for connection" while a save waits. With the outbox on (slice C), a save waiting for the connection is kept on the device and sent later; with it off, the draft stays until the server confirms.

### Outbox (slice C)

- **Switch:** on only where a super admin has set `offlineOutbox: true` on the institution document, read at sign-in at no extra cost. Missing or false means saves go straight to the server as before; anything already queued is kept but not sent. The switch is read at sign-in, so turning it on or off takes effect at each person's next sign-in or reload. Until the sender has started (the switch is on), nothing is sent and no retry is scheduled. Slice C2 has shipped, so the pilot school can now get it; the owner sets it in the console.
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

### Idle lock and Lock button while offline (slice D)

- **When it locks:** a teacher, senior teacher or institution admin (the roles that work offline) reaches the idle limit (5 minutes) while the device is offline: the browser says so, or the app couldn't reach its servers (the same signals as the connection banner). Instead of signing out, the tab locks. Everyone else, and everyone online, is signed out as before. A sign-out offline would delete the device's drafts and reload to a sign-in page that can't sign anyone in without the internet.
- **What the lock does:** the lock screen replaces the whole dashboard (`components/IdleLockGate.tsx` in `Protected.tsx`). The header, sidebar and page are unmounted, so no school data is on screen or in the page. It shows the school's name and logo and the person's name. Register drafts were already saved, encrypted, and come back after unlocking. The lock lives in the tab's `sessionStorage` (`lib/offline/idleLock.ts`), so a reload stays locked. The idle timer stops while locked and starts afresh after unlocking. The lock screen is part of the app's main code, not loaded on demand, because it shows when nothing new can be downloaded.
- **Unlocking:** with the account password, checked against a verifier kept only in that tab's `sessionStorage` (`lib/offline/unlockVerifier.ts`): PBKDF2-SHA-256, 600,000 iterations, a random 16-byte salt and a 32-byte hash. The password itself is never stored. The verifier is made at every password sign-in (in the background) and again when the password changes, so an old password can't unlock. A check takes about 0.1 s on a desktop and up to a second or so on an older phone.
- **Back online while locked:** the tab stays locked until the password is typed, then carries on. If it is still locked after 30 minutes online without a break (`LOCKED_ONLINE_LIMIT_MS`), it signs out through the usual sign-out, keeping unsent register saves. A locked tab keeps the account's single session (`lib/sessionLock.ts`), so without this limit the person couldn't sign in on another device. The time it came online is kept with the lock, so a reload doesn't restart the count; going offline again does. The lock screen says so while online.
- **The forced change-password page** is behind the same lock: its inactivity guard can lock the tab offline just as the dashboard's does.
- **Lock button:** staff who work offline can lock the screen on purpose before stepping away from a shared computer (`components/LockButton.tsx`, in the top bar before Logout). It shows only when `manualLockAllowed` (`lib/offline/idleLock.ts`) says so:
  - **offline** (the same signals as the banner): online, Logout already does the job, and a lock made online would start the 30-minute online sign-out at once;
  - **a role that works offline**;
  - **a tab with a verifier**: without one the tab couldn't be unlocked offline.

  It locks through the same `lockTab`, so everything above applies. A page with unsaved changes asks first, as Logout does. The lock keeps why it locked (`reason`: `"idle"` or `"manual"`, older records read as idle), and the screen's first line says "You locked the screen." or "You were away while offline, so the screen locked." The 10-second warning before an idle timeout says "The screen will lock in …" when it will lock, and "You'll be signed out in …" otherwise.
- **Wrong passwords:** five wrong passwords sign out, through the usual sign-out. Unsent register saves are kept, because the outbox is never deleted at sign-out.
- **A tab with no verifier** (signed in before this shipped, or with storage blocked): it locks all the same, says it can't be unlocked offline, and signs out as soon as it's back online.
- **Sign out instead:** the lock screen offers it, after a warning that the device's unsaved drafts are deleted and, offline, that signing in again needs the connection (the sign-in page itself opens offline since slice E).
- **Limits:** someone with the browser's developer tools on that tab could copy the verifier and try passwords against it elsewhere; PBKDF2 makes each guess slow. A duplicated tab copies `sessionStorage`, so it has the same verifier and the same lock. Anyone at the computer can still press Sign out instead; that's the same as waiting for the five wrong passwords, and unsent saves are kept either way.

### Service worker (slice E)

- **Plugin:** `vite-plugin-pwa` 2.0.0 with `injectManifest`. The worker is `src/sw.ts`, built with workbox 7.4.1 (`workbox-precaching`, `workbox-routing`). The app isn't installable: there is no web manifest.
- **Kept on device:** the app's code only, never school data. `lib/serviceWorker/precacheSelection.ts` picks the files from Vite's build manifest (`build.manifest`): the page, the core app and both registers, each with what they import, plus the unsent-work tray and the Realtime Database code the single-session check loads at every start; and the logo and icons. Everything else, such as the PDF and spreadsheet code, stays online-only. About 1.5 MB (about 60 files) on each device, fetched once per version. The build fails if a register or one of those pieces can't be found, rather than shipping a worker that doesn't work offline.
- **Never cached:** Firebase, reCAPTCHA and EmailJS traffic. They're on other origins, which the worker never sees, and it has no other caching.
- **Page loads:** every page load is answered with the stored `index.html`, except `/assets/`, `/sw.js` and paths with a file extension, as the Vercel rewrite does. A signed-in tab can then reload offline and stays signed in (the session lives in the tab's `sessionStorage`), and the sign-in page opens offline after a sign-out, though signing in needs the internet.
- **Other pages offline:** their code isn't on the device, so they show "This page needs the internet" (`components/PageErrorBoundary.tsx`) instead of an error. `lib/chunkReload.ts` still never reloads offline, since a reload can't fetch the missing code either.
- **Who gets it:** every visitor, in production builds. It holds only code, so a shared computer gets it from whoever opened the app first. `npm run dev` and the e2e tests (which run on the dev server) have no worker.
- **Registering and checking:** `lib/serviceWorker/swRegistration.ts`, from `main.tsx`, registers `/sw.js` with `updateViaCache: "none"` once the page has finished loading, so the worker's download doesn't slow the first visit. It checks for a new version at each load, hourly, when the connection returns and when the tab is shown. The first install takes over open tabs at once (`clients.claim()`), so they're covered without a reload.
- **Updates at a safe moment:** a new version installs in the background and waits. `components/UpdateController.tsx` moves the tab to it at a page change, or straight away on the sign-in page with nobody signed in while nothing has been typed there (so a half-typed email or password is never wiped). The page change straight after signing in doesn't count, since the sign-in's background work (the offline unlock check, the device key, the sign-in log) may still be running; the next one does. It switches only when `lib/serviceWorker/safeMoment.ts` says it's safe: online, not locked, no register draft (`hasAnyDraft`) and nothing in the outbox (`hasOutboxItems`, which reads only the rows' owner tags). It tells the waiting worker to take over (`SKIP_WAITING`, the only way it does), then reloads once. It never switches during marking.
- **"Update ready":** until then, a small notice offers "Update now" and "Later". Update is disabled offline. With drafts or unsent saves, it first says they're kept on the device and come back after the update. "Later" hides the notice for that page load; the safe-moment switch still happens.
- **Several tabs:** when one tab moves to the new version, the others are running old code under the new worker. Each reloads at its own next safe moment, with the same notice meanwhile.
- **Hosting:** `vercel.json` keeps `/sw.js` out of the app rewrite and serves it with `Cache-Control: no-cache` and `Service-Worker-Allowed: /`, so a new version, or the safety switch, reaches every device at its next check. The content security policy already allows `worker-src 'self'`.
- **Safety switch:** if a worker ever misbehaves:
  1. In Vercel → Project → Settings → Environment Variables, add `SERVICE_WORKER` = `remove` for Production (and Preview, if needed).
  2. Redeploy the current production commit.
  3. That build's `sw.js` removes itself and its caches from each device at its next visit and reloads the open tabs once, and the app registers nothing. Drafts and unsent saves are in IndexedDB and local storage, not the worker's cache, so they're kept.
  4. To restore the worker, delete the variable and redeploy.

  Check a remove build locally with `SERVICE_WORKER=remove npm run build`: `dist/sw.js` is then a short script that unregisters itself.
- **Lock button:** added after this slice; see the idle lock section (slice D).

## Firebase

- **Rules:**
  - The key document is readable and creatable by its owner only. It can't be updated or deleted from the app.
  - A regular teacher of the subject may read a subject register that doesn't exist yet, identified by its fixed `sa_` id (slice C). The outbox's transaction reads the register before its first save.
- **Indexes:** none.
- **Reads:** about one read per sign-in for the key. With the outbox on, each register save reads its register once in the sending transaction (plus one rule `get` for a subject register that doesn't exist yet); a repeat recognised by `lastOpByUser` writes nothing. The prefetch reads today's registers only: about one read per student and one per saved register, so roughly 40 to 180 reads per teacher, once a day on each device. Copies cost no reads.

## Limits

- **Closing the tab ends offline use:** the key and session go with the tab, and signing in again needs the internet. Unsent work stays encrypted until the same person signs in.
- **The first visit needs the internet:** the service worker and the app's code are stored then. They're kept per browser, so another browser on the same computer starts again online.
- **Only the registers open offline:** other pages need the internet.
- **Same student, two devices:** someone has to choose which change to keep.
- **No background sending:** nothing sends while the app is closed, including on iOS.
- **Script injection:** this design doesn't protect against it. The content security policy is the control.
