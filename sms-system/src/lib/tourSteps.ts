import type { Step, Tour } from 'nextstepjs';

const stub: Step[] = [
  {
    icon: null,
    title: 'Tour coming soon',
    content: 'A guided tour for your role is on its way. Check back in a future update.',
    showControls: true,
    showSkip: true,
  },
];

const institutionAdminSteps: Step[] = [
  // Step 1 — Home: Welcome
  {
    icon: null,
    title: 'Welcome to your dashboard',
    content:
      "This is your command centre. Here you'll find a live snapshot of your institution — student, teacher, parent, and class counts; attendance trends; quick-action shortcuts; upcoming calendar events; and announcements. Let's walk you through the key areas of the platform.",
    nextRoute: '/dashboard/institution-profile',
    showControls: true,
    showSkip: true,
  },
  // Step 2 — Institution Profile: Wizard state
  {
    icon: null,
    title: 'Set up your institution profile',
    content:
      "Before the platform is fully operational, complete your institution profile. This 7-step wizard collects your institution's name, contact details, logo, authorised signature, role labels, and grading system. You can return and update these details at any time once setup is complete.",
    prevRoute: '/dashboard',
    showControls: true,
    showSkip: true,
  },
  // Step 3 — Institution Profile: Completed state
  {
    icon: null,
    title: 'Your institution profile',
    content:
      'Your institution profile is complete. This page displays your registered institution details — name, address, contact information, logo, and role labels. You can update any section at any time using the edit controls on this page.',
    nextRoute: '/dashboard/academic-calendar',
    showControls: true,
    showSkip: true,
  },
  // Step 4 — Academic Calendar: Wizard state
  {
    icon: null,
    title: 'Set up your academic calendar',
    content:
      "The Academic Calendar wizard guides you through creating your institution's academic year. You'll define the year's start and end dates, configure terms, set your school week, mark public holidays, and log non-school days. The attendance register depends on this calendar to function correctly.",
    prevRoute: '/dashboard/institution-profile',
    showControls: true,
    showSkip: true,
  },
  // Step 5 — Academic Calendar: Management state
  {
    icon: null,
    title: 'Managing your academic calendar',
    content:
      'Your academic calendar is active. This page lets you view the current academic year, browse terms, review non-school days, and begin preparing the next academic year when the time comes.',
    nextRoute: '/dashboard/create-user',
    showControls: true,
    showSkip: true,
  },
  // Step 6 — Create User: Overview
  {
    icon: null,
    title: 'Create a user account',
    content:
      'Use this form to create login accounts for staff, students, and parents. Fill in the name, email, and a temporary password, then select the appropriate role for the new user.',
    prevRoute: '/dashboard/academic-calendar',
    showControls: true,
    showSkip: true,
  },
  // Step 7 — Create User: Role select spotlight
  {
    icon: null,
    title: 'The Role field controls the form',
    content:
      'Selecting a role here dynamically adjusts the form. Student accounts ask for class assignment, date of birth, and student ID. Teacher accounts ask for department. Choose carefully — the role determines what the user can see and do on the platform.',
    selector: '#tour-create-user-role',
    side: 'bottom',
    showControls: true,
    showSkip: true,
  },
];

export const tourSteps: Tour[] = [
  { tour: 'institution_admin', steps: institutionAdminSteps },
  { tour: 'super_admin',       steps: stub },
  { tour: 'senior_teacher',    steps: stub },
  { tour: 'regular_teacher',   steps: stub },
  { tour: 'student',           steps: stub },
  { tour: 'parent',            steps: stub },
];
