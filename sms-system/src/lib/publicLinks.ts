// Fixed public addresses of our own, shared by every signed-out surface: the sign-in footer
// (components/PublicFooter.tsx) and the landing page (src/landing/). Kept in one place so a change
// of domain is a one-line edit. Pure constants: safe to import from the landing page, which must
// never import Firebase (see src/landing/__tests__/landingBoundaries.test.ts).
//
// These are our own sites, so links to them skip the "You're leaving" check (OutsideLink without
// `leaving`); see components/OutsideLink.tsx.

/** The public demo school (fictional data), opened from "Try the demo". */
export const DEMO_URL = "https://sms-demo.solutions.genr83d.com/";

/** The designer's site, behind the "Designed by" credit. */
export const DESIGNER_URL = "https://solutions.genr83d.com/";

/** The operator named in copyright lines and credits. */
export const OPERATOR_NAME = "GENR8-3D Digital Solutions";
