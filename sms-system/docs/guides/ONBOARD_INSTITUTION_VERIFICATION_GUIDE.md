# Onboard Institution — Verification Guide

Manual test checklist for the two-step institution onboarding flow at `/onboard-institution`. Run these checks against a live Firebase project after any change to `OnboardInstitutionPage`, `InstitutionForm`, or `AdminCreateUserForm`.

---

## Prerequisites

1. **App running locally** — run `npm run dev` from `sms-system/`.
2. **Live Firebase project connected** — the onboard flow always writes to real Firestore and Firebase Auth regardless of the `DATA_MODE` setting. A working `sms-system/.env.local` with valid `VITE_FIREBASE_*` keys is required.
3. **A `super_admin` account** — credentials for a user whose Firestore `users/{uid}` document has `role: "super_admin"`.
4. **Firebase Console open** — keep a second browser tab at Firebase Console → your project → Firestore Database to inspect documents as they are created.

---

## 1. Route Access Control

| Test | Steps | Expected result |
|---|---|---|
| `super_admin` can reach the page | Sign in as `super_admin`. Navigate to `/onboard-institution`. | Page loads with "Onboard Institution" heading and a two-node step indicator. |
| Other roles are blocked | Sign in as `institution_admin`, `senior_teacher`, `regular_teacher`, `student`, or `parent`. Navigate to `/onboard-institution` directly in the address bar. | Immediately redirected to `/`. |

---

## 2. Entry Point — Quick Action on the Super Admin Dashboard

1. Sign in as `super_admin`.
2. Go to `/` (the dashboard).
3. Locate the **Onboard Institution** quick-action card/button.
4. Click it.

**Expected:** navigates to `/onboard-institution` (not `/create-user`).

---

## 3. Step Indicator — Initial State

On arrival at `/onboard-institution`, verify the following before interacting with the form:

- **Node 1** ("Create Institution") — filled sky circle showing **1**, label in sky colour.
- **Node 2** ("Create Admin") — grey circle showing **2**, label in grey.
- **Connector line** between the two nodes — grey.

---

## 4. Step 1 — Institution Name Validation

With the form in step 1, submit each of the following inputs and verify the error message:

| Input | Expected error |
|---|---|
| Empty name field | "Name is required." |
| Name longer than 100 characters | "Name must be 100 characters or less." |
| Valid name (e.g. `Greenfield Academy`) | No error — proceeds to step 2. |

---

## 5. Step 1 — Firestore Write

After a successful step 1 submission, open Firestore Console → **institutions** collection and locate the newly created document. Verify it contains exactly the following fields:

| Field | Expected value |
|---|---|
| `name` | The institution name you entered. |
| `institutionId` | Matches the Firestore document ID exactly. |
| `status` | `"active"` |
| `createdAt` | A Firestore `Timestamp` object (not an ISO string). |

---

## 6. Step Indicator — After Step 1

After step 1 completes, verify the step indicator updates:

- **Node 1** — sky circle with a **checkmark** SVG (not a number), label remains sky colour.
- **Node 2** — sky circle showing **2**, label turns sky colour.
- **Connector line** — turns sky-500 (blue).
- A blue callout banner appears above the form: *"Institution created — completing this step links the admin account to it."*

---

## 7. Step 2 — Pre-filled and Locked Fields

In the Create User form, verify the following fields are non-editable:

- **Institution ID** — disabled input, pre-populated with the institution ID generated in step 1.
- **Role** — disabled readonly input displaying `"Institution Admin"` (not a dropdown `<select>`).

---

## 8. Step 2 — User Creation Validation

Test form validation before submitting valid data:

| Test case | Expected error |
|---|---|
| Blank first name | "First name must be at least 2 characters." |
| Blank last name | "Last name must be at least 2 characters." |
| Invalid email (e.g. `notanemail`) | "Enter a valid email address." |
| Password shorter than 8 characters | "Password must be at least 8 characters." |
| Password with no uppercase letter | "Password needs at least one uppercase letter." |
| Password with no number | "Password needs at least one number." |
| Confirm password does not match password | "Passwords do not match." |

---

## 9. Step 2 — Firebase Auth and Firestore Write

Submit the form with valid data. Use a fresh email address not already registered in Firebase Auth (e.g. `jane.smith.test@example.com`, password `Test1234!`).

### Firebase Auth Console (Authentication → Users)

A new user entry for the email address you entered must appear.

### Firestore Console → `users/{uid}`

| Field | Expected value |
|---|---|
| `uid` | Matches the Firebase Auth UID for the new user. |
| `firstName` | As entered in the form. |
| `lastName` | As entered in the form. |
| `name` | `"firstName lastName"` concatenated with a space. |
| `email` | Lowercase-normalised version of the email entered. |
| `role` | `"institution_admin"` |
| `institutionId` | The institution ID from step 1. |
| `status` | `"active"` |
| `createdAt` | A Firestore `Timestamp` object (not an ISO string). |
| `createdBy` | The UID of the `super_admin` performing the action. |

---

## 10. Done State — Success Card

After step 2 completes, verify the success card:

- An emerald-bordered card appears with a filled checkmark circle.
- **Institution** row — shows the institution name entered in step 1.
- **Institution ID** row — shows the Firestore document ID in a monospaced `<code>` element.
- **Admin account** row — shows the full name (first + last) of the user created in step 2.
- Two buttons are visible: **Go to Dashboard** and **Onboard Another Institution**.
- Both step indicator nodes show checkmarks.

---

## 11. Done State — Action Buttons

| Button | Expected |
|---|---|
| **Go to Dashboard** | Navigates to `/`. |
| **Onboard Another Institution** | Resets the page to step 1: empty institution name field, step indicator returns to its initial state, success card is gone. |

---

## 12. Orphan Institution Recovery (Caveat Verification)

This check verifies the orphan-institution caveat documented in `ONBOARD_INSTITUTION_PLAN.md`.

1. Complete step 1 (institution document is created in Firestore).
2. While on step 2, navigate away — use the browser back button or type a different URL.
3. Open Firestore Console → **institutions** collection and confirm the document created in step 1 still exists with no associated admin.
4. **Recover:** go to `/create-user`, create an `institution_admin`, and manually paste the orphaned institution's Firestore document ID into the Institution ID field.
5. Confirm the resulting `users/{uid}` document has `institutionId` matching the orphaned institution.

---

## 13. TypeScript Sanity Check

From `sms-system/`, run:

```sh
npx tsc --noEmit
```

**Expected:** no output (zero errors).
