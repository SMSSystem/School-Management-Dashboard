# Walkthrough Tour Feature — Specification

**Status:** Design complete; open questions noted in §9  
**Package:** nextstepjs (React Router variant)  
**Role with real steps:** institution_admin  
**All other roles:** stubbed with placeholder step

---

## 1. Objective

Provide new users with a guided, multi-page walkthrough of the platform. The tour auto-triggers once on first login (per role) and can be replayed at any time via a "Start Tour" button at the bottom of the sidebar. Seen state is persisted per-role in the Firestore user document so the auto-trigger never fires more than once.

---

## 2. Technical Prerequisites

### 2a. Package Installation

```bash
npm install nextstepjs motion
```

Neither `nextstepjs` nor `motion` is in `package.json`. `motion` (Framer Motion) is a peer dependency of nextstepjs — it powers the spotlight overlay animation and card transition effects between steps.

### 2b. New File — next/navigation Mock

**Path:** `src/lib/nextNavigationMock.ts`

nextstepjs internally imports from `next/navigation` (a Next.js module). Vite cannot resolve this. A stub that satisfies the import shape is required:

```ts
export const useRouter = () => ({
  push: (_url: string) => {},
  replace: (_url: string) => {},
  prefetch: (_url: string) => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
});
export const usePathname = () => '';
export const useSearchParams = () => new URLSearchParams();
export const useParams = (): Record<string, string> => ({});
```

### 2c. Vite Alias Update

**File:** `vite.config.ts`

Add alias entry so `'next/navigation'` resolves to the mock:

```ts
resolve: {
  alias: {
    '@': path.resolve(__dirname, 'src'),
    'next/navigation': path.resolve(__dirname, 'src/lib/nextNavigationMock.ts'),
  },
},
```

---

## 3. Firestore: Seen Flag

**Document:** `users/{uid}`  
**Field shape:**

```json
{ "toursCompleted": { "institution_admin": true } }
```

This is a per-role object. Setting one role's flag does not affect others — enabling future role tours independently.

**TypeScript — add to `UserDocument` in `src/lib/firebase.ts`:**

```ts
toursCompleted?: Record<string, boolean>;
```

**Write operation (on complete or skip):**

```ts
await updateDoc(doc(db, 'users', user.uid), {
  [`toursCompleted.${role}`]: true,
});
```

---

## 4. Tour Trigger Behaviour

| Trigger | Mechanism | Resets Firestore flag? |
|---|---|---|
| Auto (first login) | `useEffect` in App.tsx; fires if `toursCompleted?.[role]` is falsy | N/A — writes flag on complete/skip |
| Manual ("Start Tour" button) | Calls `startNextStep(role)` unconditionally | No — flag stays set; tour replays for the current session only |

**Skip behaviour:** treated identically to completing — writes the seen flag permanently. Auto-trigger is suppressed forever after either action.

---

## 5. Role Tour Map

| Role | Tour ID | Steps |
|---|---|---|
| institution_admin | `institution_admin` | Real steps — see §6 |
| super_admin | `super_admin` | Stub — see §7 |
| senior_teacher | `senior_teacher` | Stub |
| regular_teacher | `regular_teacher` | Stub |
| student | `student` | Stub |
| parent | `parent` | Stub |

---

## 6. institution_admin Tour Steps

All steps use a centered modal card (no `selector`) — this avoids spotlight breakage from conditional UI. The route sequence navigates Home → Institution Profile → Academic Calendar → Create User.

### Step 1 — Home: Welcome

| Field | Value |
|---|---|
| Route | `/dashboard` |
| Selector | none |
| Title | "Welcome to your dashboard" |
| Content | "This is your command centre. Here you'll find a live snapshot of your institution — student, teacher, parent, and class counts; attendance trends; quick-action shortcuts; upcoming calendar events; and announcements. Let's walk you through the key areas of the platform." |
| `nextRoute` | (none — stays on `/dashboard`) |

**Decision:** This is the only home page step. No selector spotlights on individual sections.

### Step 2 — Institution Profile: Wizard state

| Field | Value |
|---|---|
| Route | `/dashboard/institution-profile` |
| Selector | none |
| Title | "Set up your institution profile" |
| Content | "Before the platform is fully operational, complete your institution profile. This 7-step wizard collects your institution's name, contact details, logo, authorised signature, role labels, and grading system. You can return and update these details at any time once setup is complete." |
| `prevRoute` | `/dashboard` |
| `nextRoute` | (none — stays on `/dashboard/institution-profile`) |

### Step 3 — Institution Profile: Completed state

| Field | Value |
|---|---|
| Route | `/dashboard/institution-profile` |
| Selector | none |
| Title | "Your institution profile" |
| Content | "Your institution profile is complete. This page displays your registered institution details — name, address, contact information, logo, and role labels. You can update any section at any time using the edit controls on this page." |
| `nextRoute` | `/dashboard/academic-calendar` |

> Both steps 2 and 3 are always present in the step array. Since neither has a selector, the user sees a centered card regardless of which view is currently rendered. The copy for each step describes the relevant state, so whichever the user is in, the matching step provides useful context.

### Step 4 — Academic Calendar: Wizard state

| Field | Value |
|---|---|
| Route | `/dashboard/academic-calendar` |
| Selector | none |
| Title | "Set up your academic calendar" |
| Content | "The Academic Calendar wizard guides you through creating your institution's academic year. You'll define the year's start and end dates, configure terms, set your school week, mark public holidays, and log non-school days. The attendance register depends on this calendar to function correctly." |
| `prevRoute` | `/dashboard/institution-profile` |

### Step 5 — Academic Calendar: Management state

| Field | Value |
|---|---|
| Route | `/dashboard/academic-calendar` |
| Selector | none |
| Title | "Managing your academic calendar" |
| Content | "Your academic calendar is active. This page lets you view the current academic year, browse terms, review non-school days, and begin preparing the next academic year when the time comes." |
| `nextRoute` | `/dashboard/create-user` |

> Same pattern as steps 2/3 — both always present; user sees the description for the state they're in.

### Step 6 — Create User: Overview

| Field | Value |
|---|---|
| Route | `/dashboard/create-user` |
| Selector | none |
| Title | "Create a user account" |
| Content | "Use this form to create login accounts for staff, students, and parents. Fill in the name, email, and a temporary password, then select the appropriate role for the new user." |
| `prevRoute` | `/dashboard/academic-calendar` |

### Step 7 — Create User: Role select spotlight

| Field | Value |
|---|---|
| Route | `/dashboard/create-user` |
| Selector | `#tour-create-user-role` |
| Title | "The Role field controls the form" |
| Content | "Selecting a role here dynamically adjusts the form. Student accounts ask for class assignment, date of birth, and student ID. Teacher accounts ask for department. Choose carefully — the role determines what the user can see and do on the platform." |
| side | `bottom` |

**Decision:** Two create-user steps — one overview (centered) and one spotlight on the Role select.

---

## 7. Stub Step (All Other Roles)

```ts
const stub: Step[] = [
  {
    title: 'Tour coming soon',
    content: 'A guided tour for your role is on its way. Check back in a future update.',
  },
];
```

**Decision:** Shown for all roles. Non-institution_admin users see the "Coming soon" stub step when they click it.

---

## 8. ID Attribute Naming Convention

Format: `tour-{page-slug}-{element-descriptor}`

All interactive elements on all tour pages receive `id` attributes regardless of whether a tour step currently spotlights them — this preserves future expandability without requiring a second pass.

### 8a. Shared Layout

**File:** `src/scenes/(dashboard)/index.tsx`

| Element | id |
|---|---|
| `<aside>` sidebar | `tour-sidebar` |

**File:** `src/components/Menu.tsx`

| Element | id |
|---|---|
| Collapse toggle `<button>` | `tour-sidebar-collapse-toggle` |
| Home NavLink | `tour-sidebar-nav-home` |
| Create User NavLink | `tour-sidebar-nav-create-user` |
| Teachers NavLink | `tour-sidebar-nav-teachers` |
| Students NavLink | `tour-sidebar-nav-students` |
| Parents NavLink | `tour-sidebar-nav-parents` |
| Subjects NavLink | `tour-sidebar-nav-subjects` |
| Departments NavLink | `tour-sidebar-nav-departments` |
| Houses NavLink | `tour-sidebar-nav-houses` |
| Classes NavLink | `tour-sidebar-nav-classes` |
| Terms NavLink | `tour-sidebar-nav-terms` |
| Schedule NavLink | `tour-sidebar-nav-schedule` |
| Lessons NavLink | `tour-sidebar-nav-lessons` |
| Exams NavLink | `tour-sidebar-nav-exams` |
| Assignments NavLink | `tour-sidebar-nav-assignments` |
| Results NavLink | `tour-sidebar-nav-results` |
| Feedback NavLink | `tour-sidebar-nav-feedback` |
| Report Card Comments NavLink | `tour-sidebar-nav-report-card-comments` |
| Report Cards NavLink | `tour-sidebar-nav-report-cards` |
| Report Builder NavLink | `tour-sidebar-nav-report-builder` |
| Academic Calendar NavLink | `tour-sidebar-nav-academic-calendar` |
| General Register NavLink | `tour-sidebar-nav-general-register` |
| Summary Register NavLink | `tour-sidebar-nav-summary-register` |
| Subject Register NavLink | `tour-sidebar-nav-subject-register` |
| Backfill Classes NavLink | `tour-sidebar-nav-backfill-classes` |
| Rebuild Summaries NavLink | `tour-sidebar-nav-rebuild-summaries` |
| User Profile NavLink | `tour-sidebar-nav-profile` |
| Brand Settings NavLink | `tour-sidebar-nav-brand-settings` |
| Institution Profile NavLink | `tour-sidebar-nav-institution-profile` |
| Institution Info NavLink | `tour-sidebar-nav-institution-info` |
| "Start Tour" button (new element) | `tour-sidebar-start-tour` |

### 8b. Home Page

**File:** `src/scenes/(dashboard)/admin/index.tsx` and child components

| Element | Component / File | id |
|---|---|---|
| `PendingInstitutionProfileCard` root | `src/components/PendingInstitutionProfileCard.tsx` | `tour-home-pending-profile-card` |
| Card CTA link/button | same | `tour-home-pending-profile-cta` |
| `PendingAcademicYearCard` root | `src/components/attendance/PendingAcademicYearCard.tsx` | `tour-home-pending-year-card` |
| Card CTA link/button | same | `tour-home-pending-year-cta` |
| Overdue register alert container | `admin/index.tsx` | `tour-home-overdue-alert` |
| "View register →" link | same | `tour-home-overdue-alert-link` |
| Students UserCard root | `src/components/UserCard.tsx` | `tour-home-user-card-students` |
| Teachers UserCard root | same | `tour-home-user-card-teachers` |
| Parents UserCard root | same | `tour-home-user-card-parents` |
| Classes UserCard root | same | `tour-home-user-card-classes` |
| CountChart root | `src/components/CountChart.tsx` | `tour-home-count-chart` |
| AttendanceChart root | `src/components/AttendanceChart.tsx` | `tour-home-attendance-chart` |
| AdminQuickActions root | `src/components/AdminQuickActions.tsx` | `tour-home-quick-actions` |
| Add Teacher Link | same | `tour-home-quick-action-teacher` |
| Add Student Link | same | `tour-home-quick-action-student` |
| Manage Classes Link | same | `tour-home-quick-action-classes` |
| Announcements Link | same | `tour-home-quick-action-announcements` |
| CalendarCard root | `src/components/CalendarCard.tsx` | `tour-home-calendar-card` |
| EventsList root | `src/components/EventsList.tsx` | `tour-home-events-list` |
| InstitutionBrandCard root | `src/components/InstitutionBrandCard.tsx` | `tour-home-brand-card` |
| Announcements root | `src/components/Announcements.tsx` | `tour-home-announcements` |

### 8c. Institution Profile Page

**File:** `src/scenes/(dashboard)/institution-profile/index.tsx`

Full element list to be compiled during implementation (file is large). Covers:
- All wizard step navigation buttons (Next, Previous, Submit)
- All wizard form inputs (name, contact, logo upload, signature upload, role label inputs, grading inputs)
- All edit buttons in the completed read-only view
- Any inline save/cancel buttons

ID pattern: `tour-institution-profile-{descriptor}`  
Examples: `tour-institution-profile-wizard-next`, `tour-institution-profile-logo-upload`, `tour-institution-profile-edit-contact`

### 8d. Academic Calendar Page

**File:** `src/scenes/(dashboard)/academic-calendar/index.tsx`

Full element list to be compiled during implementation (file is large). Covers:
- Wizard step navigation (Next, Previous, Submit/Publish)
- All wizard form inputs (year date pickers, term name inputs, school week checkboxes, holiday toggles, non-school day entries)
- Management view action buttons (add term, edit year, etc.)

ID pattern: `tour-academic-calendar-{descriptor}`  
Examples: `tour-academic-calendar-wizard-next`, `tour-academic-calendar-year-start`, `tour-academic-calendar-publish`

### 8e. Create User Page

**File:** `src/components/forms/AdminCreateUserForm.tsx`

| Element | id |
|---|---|
| First Name input | `tour-create-user-first-name` |
| Last Name input | `tour-create-user-last-name` |
| Email input | `tour-create-user-email` |
| Password input | `tour-create-user-password` |
| Confirm Password input | `tour-create-user-confirm-password` |
| Phone input | `tour-create-user-phone` |
| Role select | `tour-create-user-role` |
| Institution input (read-only for institution_admin) | `tour-create-user-institution` |
| Department select (conditional — teacher roles) | `tour-create-user-department` |
| Assigned Class select (conditional — senior_teacher) | `tour-create-user-assigned-class` |
| Class select (conditional — student) | `tour-create-user-class` |
| Date of Birth input (conditional — student) | `tour-create-user-dob` |
| Student ID input (conditional — student) | `tour-create-user-student-id` |
| Gender select (conditional — student) | `tour-create-user-gender` |
| Submit button | `tour-create-user-submit` |

---

## 9. New Files & Changed Files Summary

| Action | File |
|---|---|
| NEW | `src/lib/nextNavigationMock.ts` |
| NEW | `src/lib/tourSteps.ts` |
| EDIT | `vite.config.ts` — add `'next/navigation'` alias |
| EDIT | `src/lib/firebase.ts` — add `toursCompleted?` to `UserDocument` |
| EDIT | `src/App.tsx` — add `NextStepProvider`, `NextStepReact`, auto-trigger logic, callbacks |
| EDIT | `src/components/Menu.tsx` — add Start Tour button; add `id` to all NavLinks and collapse toggle |
| EDIT | `src/scenes/(dashboard)/index.tsx` — add `id` to `<aside>` |
| EDIT | `src/scenes/(dashboard)/admin/index.tsx` — add `id` to overdue alert and its link |
| EDIT | `src/components/AdminQuickActions.tsx` — add `id` to root and each `<Link>` |
| EDIT | `src/components/PendingInstitutionProfileCard.tsx` — add `id` to root and CTA |
| EDIT | `src/components/attendance/PendingAcademicYearCard.tsx` — add `id` to root and CTA |
| EDIT | `src/components/UserCard.tsx` — add `id` differentiated by `type` prop |
| EDIT | `src/components/CountChart.tsx` — add `id` to root |
| EDIT | `src/components/AttendanceChart.tsx` — add `id` to root |
| EDIT | `src/components/CalendarCard.tsx` — add `id` to root |
| EDIT | `src/components/EventsList.tsx` — add `id` to root |
| EDIT | `src/components/InstitutionBrandCard.tsx` — add `id` to root |
| EDIT | `src/components/Announcements.tsx` — add `id` to root |
| EDIT | `src/scenes/(dashboard)/institution-profile/index.tsx` — add `id` to all interactive elements |
| EDIT | `src/scenes/(dashboard)/academic-calendar/index.tsx` — add `id` to all interactive elements |
| EDIT | `src/components/forms/AdminCreateUserForm.tsx` — add `id` to all form inputs and submit button |

---

## 10. App.tsx Integration Pattern

`NextStepProvider` wraps the entire app. `NextStepReact` receives the step map, navigation adapter, and lifecycle callbacks. Auto-trigger logic lives in a child component so `useNextStep()` can be called inside the provider.

```tsx
// App.tsx (simplified structure)
import { NextStepProvider, NextStepReact } from 'nextstepjs';
import { useReactRouterAdapter } from 'nextstepjs/adapters/react-router';
import { tourSteps } from '@/lib/tourSteps';

function TourAutoTrigger() {
  const { user, role } = useAuth();
  const { startNextStep } = useNextStep();

  useEffect(() => {
    if (!user || !role) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      const data = snap.data() as UserDocument | undefined;
      if (!data?.toursCompleted?.[role]) {
        startNextStep(role);
      }
    });
  }, [user?.uid, role]);

  return null;
}

function App() {
  const adapter = useReactRouterAdapter();

  return (
    <NextStepProvider>
      <NextStepReact
        steps={tourSteps}
        navigationAdapter={adapter}
        onComplete={() => markTourSeen(user.uid, role)}
        onSkip={() => markTourSeen(user.uid, role)}
      >
        <TourAutoTrigger />
        <Protected>
          {/* ... routes ... */}
        </Protected>
      </NextStepReact>
    </NextStepProvider>
  );
}
```

---

## 11. tourSteps.ts Structure

```ts
import type { Step } from 'nextstepjs';

const stub: Step[] = [
  {
    title: 'Tour coming soon',
    content: 'A guided tour for your role is on its way. Check back in a future update.',
  },
];

export const tourSteps: Record<string, Step[]> = {
  institution_admin: [
    // Step 1 — Home: Welcome
    {
      title: 'Welcome to your dashboard',
      content: '...',
    },
    // Steps 2–3 — Institution Profile (wizard + completed)
    // Steps 4–5 — Academic Calendar (wizard + management)
    // Step 6 — Create User
  ],
  super_admin:       stub,
  senior_teacher:    stub,
  regular_teacher:   stub,
  student:           stub,
  parent:            stub,
};
```

---

## 12. Implementation Order

1. `npm install nextstepjs motion`
2. Create `src/lib/nextNavigationMock.ts`
3. Update `vite.config.ts` — add `'next/navigation'` alias
4. Add `toursCompleted?` to `UserDocument` in `src/lib/firebase.ts`
5. Create `src/lib/tourSteps.ts` — write all step content (institution_admin + stubs)
6. Update `src/App.tsx` — provider, step wiring, auto-trigger, callbacks
7. Update `src/components/Menu.tsx` — Start Tour button + NavLink `id` attributes
8. Update `src/scenes/(dashboard)/index.tsx` — `id` on `<aside>`
9. Update home page child components — `id` attributes on roots and CTAs (AdminQuickActions, UserCard, CountChart, AttendanceChart, CalendarCard, EventsList, InstitutionBrandCard, Announcements, PendingInstitutionProfileCard, PendingAcademicYearCard)
10. Update `src/scenes/(dashboard)/admin/index.tsx` — `id` on overdue alert
11. Update `src/scenes/(dashboard)/institution-profile/index.tsx` — `id` on all interactive elements
12. Update `src/scenes/(dashboard)/academic-calendar/index.tsx` — `id` on all interactive elements
13. Update `src/components/forms/AdminCreateUserForm.tsx` — `id` on all inputs and submit button
14. Run `tsc -b` and resolve any type errors
15. Manual end-to-end test: auto-trigger on fresh login, step navigation across all 4 pages, skip behaviour, manual restart via sidebar button

---

## 13. Resolved Design Decisions

All design questions have been answered. No open questions remain.

| # | Question | Decision |
| --- | --- | --- |
| Q1 | Home page step count | One overview step only — no spotlights on individual sections |
| Q2 | Create User step count | Two steps: overview (centered) + Role select spotlight |
| Q3 | Tour card styling | Custom styles matching the app's Tailwind design system (white/slate, rounded-xl, dark mode) — use nextstepjs `cardComponent` prop to supply a custom card |
| Q4 | Start Tour flag on re-click | Flag is not reset — tour replays for current session only; auto-trigger stays suppressed |
| Q5 | Start Tour button visibility | Shown for all roles — non-institution_admin users see the "Coming soon" stub |

### Custom Card Implementation Note

nextstepjs accepts a `cardComponent` prop on `<NextStepReact>` to replace the default card with a custom React component. The custom card must accept nextstepjs's standard card props (step data, navigation callbacks). This allows full Tailwind styling with dark mode support, `rounded-xl`, and the app's slate/white colour palette.
