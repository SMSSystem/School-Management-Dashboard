import { useState, useEffect, useMemo } from 'react';
import { collection, getDoc, getDocs, doc, query, where } from 'firebase/firestore';
import type { Tour, Step } from 'nextstepjs';
import { db, type InstitutionDocument, type AcademicYearDocument } from '@/lib/firebase';

const stub: Step[] = [
  {
    icon: null,
    title: 'Tour coming soon',
    content: 'A guided tour for your role is on its way. Check back in a future update.',
    showControls: true,
    showSkip: true,
  },
];

const gradebookSteps: Step[] = [
  {
    icon: null,
    title: 'The Gradebook',
    content:
      'The Gradebook gives you an editable grade grid for any class, subject, and term combination. Enter scores, conduct grades, and teacher comments for each student, then save them as a batch. Grades recorded here feed directly into report card generation.',
    showControls: true,
    showSkip: true,
  },
  {
    icon: null,
    title: 'Choose your class, subject, and term',
    content:
      'Use these selectors to navigate to the gradebook you want to work on. Each class, subject, and term combination has its own independent grid.',
    selector: '#tour-gradebook-selectors',
    side: 'bottom',
    viewportID: 'main-viewport',
    showControls: true,
    showSkip: true,
  },
  {
    icon: null,
    title: 'Define your assessment columns',
    content:
      "Click + Column to add assessment types — tests, assignments, exams, or any custom category. Each column has a name, maximum score, and weight. The weighted average across all columns determines each student's overall grade.",
    selector: '#tour-gradebook-add-column',
    side: 'bottom',
    viewportID: 'main-viewport',
    showControls: true,
    showSkip: true,
  },
  {
    icon: null,
    title: 'Enter grades directly in the grid',
    content:
      'Click any score cell to enter a mark. Conduct grades and teacher comments sit at the right of each row. All changes are held locally until you click Save — the amber warning banner appears when there are unsaved edits.',
    selector: '#tour-gradebook-grid',
    side: 'top',
    viewportID: 'main-viewport',
    showControls: true,
    showSkip: true,
  },
];

const reportBuilderSteps: Step[] = [
  {
    icon: null,
    title: 'The Report Builder',
    content:
      'The Report Builder lets you filter and segment student data to produce custom academic reports. Define your population, apply conditions, select output columns, and run the report — or export it as a PDF.',
    showControls: true,
    showSkip: true,
  },
  {
    icon: null,
    title: 'Choose who the report covers',
    content:
      'The Population section controls which students are included. You can scope the report to the whole institution, a specific class, grade level, cohort, or house. Sub-selectors appear automatically based on your choice.',
    selector: '#tour-report-builder-population',
    side: 'bottom',
    viewportID: 'main-viewport',
    showControls: true,
    showSkip: true,
  },
  {
    icon: null,
    title: 'Run and export',
    content:
      "Once you've configured your filters and selected your output columns, click Run report to see the results. Use Export PDF to produce a formatted document ready for printing or sharing.",
    selector: '#tour-report-builder-run',
    side: 'right',
    viewportID: 'main-viewport',
    showControls: true,
    showSkip: true,
  },
];

type CalendarStatus = 'none' | 'draft' | 'active';

function buildInstitutionAdminSteps(
  profileComplete: boolean,
  calendarStatus: CalendarStatus,
): Step[] {
  const profileStep: Step = profileComplete
    ? {
        icon: null,
        title: 'Your institution profile',
        content:
          'Your institution profile is complete. This page displays your registered institution details — name, address, contact information, logo, and role labels. You can update any section at any time using the edit controls on this page.',
        nextRoute: '/dashboard/academic-calendar',
        prevRoute: '/dashboard',
        showControls: true,
        showSkip: true,
      }
    : {
        icon: null,
        title: 'Set up your institution profile',
        content:
          "Begin here — enter your institution's name, contact details, and address. The 7-step wizard will also collect your logo, authorised signature, role labels, and grading system. You can return and update any of these details at any time once setup is complete.",
        selector: '#tour-institution-profile-name',
        side: 'bottom',
        viewportID: 'main-viewport',
        nextRoute: '/dashboard/academic-calendar',
        prevRoute: '/dashboard',
        showControls: true,
        showSkip: true,
      };

  const calendarStep: Step =
    calendarStatus === 'active'
      ? {
          icon: null,
          title: 'Managing your academic calendar',
          content:
            'Your academic calendar is active. This page lets you view the current academic year, browse terms, review non-school days, and begin preparing the next academic year when the time comes.',
          nextRoute: '/dashboard/create-user',
          prevRoute: '/dashboard/institution-profile',
          showControls: true,
          showSkip: true,
        }
      : calendarStatus === 'draft'
        ? {
            icon: null,
            title: 'Your academic year is pending activation',
            content:
              'A draft academic year has been set up and is ready to be confirmed. Review the dates, terms, and school week settings on this page, then click Confirm and Activate to make it live. Attendance registers and calendar features become available once the year is active.',
            selector: '#tour-academic-calendar-draft-confirm',
            side: 'top',
            viewportID: 'main-viewport',
            nextRoute: '/dashboard/create-user',
            prevRoute: '/dashboard/institution-profile',
            showControls: true,
            showSkip: true,
          }
        : {
            icon: null,
            title: 'Set up your academic calendar',
            content:
              "Start by entering your academic year's start date. The wizard will then guide you through configuring terms, your school week, public holidays, and non-school days. The attendance register depends on this calendar to work correctly.",
            selector: '#tour-academic-calendar-year-start',
            side: 'bottom',
            viewportID: 'main-viewport',
            nextRoute: '/dashboard/create-user',
            prevRoute: '/dashboard/institution-profile',
            showControls: true,
            showSkip: true,
          };

  return [
    // Step 1 — Home: Welcome
    {
      icon: null,
      title: 'Welcome to your dashboard',
      content:
        "This is your command centre. Here you'll find a live snapshot of your institution — student, teacher, parent, and class counts; attendance trends; quick-action shortcuts; upcoming calendar events; and announcements. Let's walk you through the key areas of the platform.",
      showControls: true,
      showSkip: true,
    },
    // Step 2 — Home: User counts
    {
      icon: null,
      title: 'Your institution at a glance',
      content:
        'These cards show a live count of your students, teachers, parents, and classes. They update automatically as new users are added to the platform.',
      selector: '#tour-home-user-card-row',
      side: 'bottom',
      viewportID: 'main-viewport',
      showControls: true,
      showSkip: true,
    },
    // Step 3 — Home: Attendance chart
    {
      icon: null,
      title: 'Attendance trends',
      content:
        "The attendance chart plots your institution's daily attendance over time. Once registers are being submitted regularly, you'll see patterns here — making it easier to spot attendance concerns early.",
      selector: '#tour-home-attendance-chart',
      side: 'top',
      viewportID: 'main-viewport',
      nextRoute: '/dashboard/institution-profile',
      showControls: true,
      showSkip: true,
    },
    // Step 4 — Institution Profile (conditional on profileComplete)
    profileStep,
    // Step 5 — Academic Calendar (conditional on calendarStatus)
    calendarStep,
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
      viewportID: 'main-viewport',
      showControls: true,
      showSkip: true,
    },
  ];
}

export function useTourSteps(institutionId: string | null | undefined): {
  tours: Tour[];
  isLoading: boolean;
} {
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);

  useEffect(() => {
    if (!institutionId || institutionId === '*') {
      setProfileComplete(false);
      setCalendarStatus('none');
      return;
    }

    setProfileComplete(null);
    setCalendarStatus(null);

    getDoc(doc(db, 'institutions', institutionId)).then((snap) => {
      const data = snap.data() as InstitutionDocument | undefined;
      setProfileComplete(data?.profileComplete ?? false);
    });

    getDocs(
      query(collection(db, 'academicYears'), where('institutionId', '==', institutionId)),
    ).then((snap) => {
      const docs = snap.docs.map((d) => d.data() as AcademicYearDocument);
      const hasActive = docs.some((y) => y.status === 'active');
      const hasDraft = docs.some((y) => y.status === 'draft');
      setCalendarStatus(hasActive ? 'active' : hasDraft ? 'draft' : 'none');
    });
  }, [institutionId]);

  const isLoading = profileComplete === null || calendarStatus === null;

  const tours = useMemo<Tour[]>(
    () => [
      {
        tour: 'institution_admin',
        steps: buildInstitutionAdminSteps(profileComplete ?? false, calendarStatus ?? 'none'),
      },
      { tour: 'gradebook', steps: gradebookSteps },
      { tour: 'report_builder', steps: reportBuilderSteps },
      { tour: 'super_admin', steps: stub },
      { tour: 'senior_teacher', steps: stub },
      { tour: 'regular_teacher', steps: stub },
      { tour: 'student', steps: stub },
      { tour: 'parent', steps: stub },
    ],
    [profileComplete, calendarStatus],
  );

  return { tours, isLoading };
}
