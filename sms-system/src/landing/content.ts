// Every word, link and image the landing page shows, in one place, so copy can be reviewed and changed without
// touching layout. OWNER REVIEW: all copy and claims are drafts until the owner signs them off. Claims stay within
// shipped features, and the privacy points within docs/compliance/PRIVACY_NOTICE.md (itself a draft in legal review),
// so re-check them before launch (docs/miscellaneous-specs/LANDING_PAGE_SPEC.md, launch checklist).
//
// Images: screenshots of the public demo school (fictional data) live in public/landing/shots/ as
// `<shot>-<width>.webp` and `<shot>-dark-<width>.webp` (see components/Screenshot.tsx). Never use real school data.

import { DEMO_URL, OPERATOR_NAME } from "@/lib/publicLinks";

/** Working name, not final (internal note: LANDING_PAGE_INTENT.md section 2). One constant to change. */
export const PRODUCT_NAME = "Scholarch";

export { DEMO_URL, OPERATOR_NAME };

/** The app's sign-in page. Served by the app shell (dist/app.html) through the Vercel rewrite. */
export const LOGIN_URL = "/login";

/** The widths every desktop screenshot is saved at, for srcset (components/Screenshot.tsx). */
export const SHOT_WIDTHS = [800, 1600, 2560] as const;

/** Screenshot names in public/landing/shots/ (without theme or width). */
export type ShotName =
  | "dashboard"
  | "attendance"
  | "gradebook"
  | "report-cards"
  | "exams"
  | "lessons";

export const ui = {
  skipLink: "Skip to content",
  mainNavLabel: "Main",
  menuOpen: "Menu",
  menuLabel: "Site menu",
  themeGroupLabel: "Colour theme",
  themeLabel: "Theme",
  themeOptions: {
    system: "Use device theme",
    light: "Light theme",
    dark: "Dark theme",
  },
  demo: "Try the demo",
  login: "Log in",
  newTab: "(opens in a new tab)",
  brandHome: "back to top",
  footerNavLabel: "Footer",
  privacySoon: "Privacy notice (coming soon)",
  termsSoon: "Terms (coming soon)",
  designedBy: "Designed by",
  swipePrev: "Previous feature",
  swipeNext: "Next feature",
  swipeRegionLabel: "Features, swipe or use the arrow keys",
};

export const nav = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#steps" },
  { label: "Privacy", href: "#privacy" },
];

export const hero = {
  eyebrow: "School management, made calm",
  title: "Run your whole school from one place.",
  body: "Attendance, grades, report cards and exams for administrators, teachers, parents and students. Each person sees what is theirs, and nothing else.",
  shot: "dashboard" as ShotName,
  shotAlt:
    "The administrator home page of a demo school, with totals for students, teachers, parents and classes and an attendance chart.",
  phoneShotAlt:
    "The attendance register of a demo class on a phone, with present, absent, late and sick marks.",
};

export const trust = [
  "Dashboards for administrators, teachers, parents and students",
  "Each school's data kept apart",
  "Registers that keep working when the connection drops",
  "No advertising or tracking cookies",
];

export type Story = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  shot: ShotName;
  alt: string;
  tint: "blue" | "lavender" | "mint";
};

export const featuresSection = {
  kicker: "Features",
  title: "Everything a school day needs, nothing it doesn’t.",
};

export const stories: Story[] = [
  {
    id: "attendance",
    kicker: "Attendance",
    title: "Registers that keep up with the school day.",
    body: "Take AM and PM registers in a few taps, fill a whole session at once, then change only the marks that differ. At schools that switch it on, staff registers keep working offline and send when the connection is back.",
    shot: "attendance",
    alt: "The general attendance register for a demo class, with present, absent, late and sick marks across the week.",
    tint: "blue",
  },
  {
    id: "gradebook",
    kicker: "Gradebook",
    title: "One gradebook for every class and subject.",
    body: "Enter coursework and exam marks in a single grid. Weights are applied for you and averages update as you type.",
    shot: "gradebook",
    alt: "A gradebook grid with homework, quiz, class test and term exam columns and each student's average.",
    tint: "lavender",
  },
  {
    id: "report-cards",
    kicker: "Report cards",
    title: "Report cards from the marks you already have.",
    body: "Averages and class positions are worked out from the gradebook, ready to review and print for every student.",
    shot: "report-cards",
    alt: "A list of report cards showing each student's class, average and class position.",
    tint: "mint",
  },
  {
    id: "exams",
    kicker: "Exams",
    title: "Exams planned, timed and in the right room.",
    body: "Schedule term exams by class, date, time and room, and set exams online for students to take.",
    shot: "exams",
    alt: "A list of term exams with class, date, time, room and total marks.",
    tint: "blue",
  },
  {
    id: "lessons",
    kicker: "Lessons",
    title: "Lesson notes and rubrics, shared in one place.",
    body: "Teachers write lesson notes for their classes, attach files and share rubrics, so students and parents can follow along.",
    shot: "lessons",
    alt: "A list of lesson notes with titles, classes, subjects and teachers.",
    tint: "lavender",
  },
];

export const stepsSection = {
  kicker: "How it works",
  title: "Live in three steps.",
};

export const steps = [
  {
    n: "01",
    title: "Set up your school",
    body: "Add your classes, subjects, houses and term dates. Your colours and crest appear across the dashboard.",
    shot: "dashboard" as ShotName,
    alt: "The administrator home page after setup, with the school's totals.",
  },
  {
    n: "02",
    title: "Add your people",
    body: "Create accounts for teachers, students and parents. Each person gets a sign-in email and changes their password on first sign-in.",
    shot: "report-cards" as ShotName,
    alt: "A list of students with their classes, averages and class positions.",
  },
  {
    n: "03",
    title: "Go live",
    body: "Teachers take registers and enter marks; parents and students see their own grades, attendance and lessons.",
    shot: "attendance" as ShotName,
    alt: "A teacher's attendance register for the week, ready to fill in.",
  },
];

export const privacy = {
  kicker: "Privacy",
  title: "Built with privacy in mind",
  body: "Schools hold information about children. We treat that seriously.",
  points: [
    {
      title: "Access by role and by school",
      body: "Staff, students and parents only reach what their role allows, inside their own school.",
    },
    {
      title: "Encrypted in transit and at rest",
      body: "Provided by our hosting. Offline registers are stored encrypted on the device.",
    },
    {
      title: "No advertising, no tracking cookies",
      body: "Your information is not sold or used for advertising.",
    },
    {
      title: "Written for Jamaica's Data Protection Act, 2020",
      body: "Our privacy notice is in legal review and will be published here.",
    },
  ],
};

export const cta = {
  title: "See it with your own eyes.",
  body: "Explore a demo school filled with fictional data. No sign-up needed.",
};
