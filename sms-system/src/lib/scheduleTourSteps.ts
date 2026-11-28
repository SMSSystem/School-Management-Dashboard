import type { Step } from "nextstepjs";
import { pageTourStep } from "./pageTourStep";
import type { Role } from "@/types/people";

// The Schedule page's tour (docs/miscellaneous-specs/SCHEDULE_PAGE_REDESIGN_SPEC.md section 7). It is started by the
// page's "Take a tour" button, never by itself, and it never opens a dialog or asks anyone to act. Like the Rubrics
// tour, it spotlights only what is always on the page once the timetable is drawn (the button shows only then);
// anything that may be missing (a parent's child chips, a senior teacher's editing access) is explained in a centred
// step instead. The steps come from the role alone, because useTourSteps builds every tour from the role. The card is
// centred under its target, so a narrow target at a screen edge (the heading on the left, Add slot on the right) aligns
// the card to that edge instead, or on a phone it would run off the screen.

const step = pageTourStep;

const HEADING = {
  staff: step(
    "Your schedule",
    "This is the timetable laid on real dates: the weekly pattern of lessons, with holidays and breaks taken out. The title under Schedule names whose week you are looking at.",
    "#tour-schedule-heading",
    "bottom-left",
  ),
  student: step(
    "Your timetable",
    "This is your week on real dates, across all your classes, with holidays and breaks taken out.",
    "#tour-schedule-heading",
    "bottom-left",
  ),
  parent: step(
    "Your child's timetable",
    "This is your child's week on real dates, across all their classes, with holidays and breaks taken out.",
    "#tour-schedule-heading",
    "bottom-left",
  ),
};

const CHOOSE = {
  admin: step(
    "Whose week",
    "Under Show, pick A class or A teacher, then the class or teacher. The page address keeps your choice, so you can bookmark it or share it with other staff.",
    "#tour-schedule-choose",
  ),
  senior: step(
    "Whose week",
    "The page opens on your own week. Under Show, pick A class or A teacher to look at someone else's. The teacher list is made of the teachers named on subjects.",
    "#tour-schedule-choose",
  ),
};

const CHILDREN = step(
  "Your children",
  "If you have more than one child linked to your account, chips under Showing: switch between them. The page remembers your choice while you are signed in.",
);

const WEEK_NAV = step(
  "Moving through weeks",
  "Use ‹ and › to move a week at a time and Today to come back. The arrows stop at the first and last weeks of the school year (or the active time blocks), with a note saying so. Week shows the whole week as a grid; Day shows one day as a list. Phones always show Day.",
  "#tour-schedule-week-nav",
);

const TIMETABLE = {
  staff: step(
    "The timetable",
    "Each row starts at a lesson time, and gaps of 15 minutes or more show as Free time. The lesson on now has a green ring and today is tinted. Holidays and breaks are greyed with their name. Lessons that overlap get a red Clash tag, and the footer counts the week's lessons and clashes.",
    "#tour-schedule-timetable",
  ),
  family: step(
    "The timetable",
    "Each lesson shows its subject, teacher and room. Gaps of 15 minutes or more show as Free time, the lesson on now has a green ring, and holidays and breaks show their name.",
    "#tour-schedule-timetable",
  ),
};

const EDIT = {
  admin: step(
    "Adding and changing lessons",
    "Add slot creates a timetable slot: a subject, teacher, class, days, start time and length. Each lesson has Edit and Delete buttons. This is the editor until the Lessons feature arrives.",
    "#tour-schedule-add",
    "bottom-right",
  ),
  senior: step(
    "Adding and changing lessons",
    "When your administrator gives you schedule access, Add slot appears here, and Edit and Delete appear on the lessons of teachers in your own department.",
  ),
};

const DELEGATE = step(
  "Giving access",
  "Delegate Schedule Access lets chosen senior teachers add and edit slots for their own department. Every grant and revoke is recorded in the Audit Log.",
  "#tour-schedule-delegate",
);

/** The steps for this person's role. */
export function scheduleTourSteps(role: Role | null | undefined): Step[] {
  switch (role) {
    case "institution_admin":
      return [
        HEADING.staff,
        CHOOSE.admin,
        WEEK_NAV,
        TIMETABLE.staff,
        EDIT.admin,
        DELEGATE,
      ];
    case "spectator":
      return [HEADING.staff, CHOOSE.admin, WEEK_NAV, TIMETABLE.staff];
    case "senior_teacher":
      return [
        HEADING.staff,
        CHOOSE.senior,
        WEEK_NAV,
        TIMETABLE.staff,
        EDIT.senior,
      ];
    case "regular_teacher":
      return [HEADING.staff, WEEK_NAV, TIMETABLE.staff];
    case "student":
      return [HEADING.student, WEEK_NAV, TIMETABLE.family];
    case "parent":
      return [HEADING.parent, CHILDREN, WEEK_NAV, TIMETABLE.family];
    default:
      return [HEADING.staff];
  }
}
