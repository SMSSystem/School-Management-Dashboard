// Data mode (mock / blank / live) and the mock datasets, which are for development only.
// The datasets themselves live in src/dev/mock (development only); this file picks the data mode and hands them out.

import { mockTeachers, mockStudents, mockParents } from '@/dev/mock/people';
import { mockSubjects, mockClasses, mockLessons, mockExams, mockAssignments } from '@/dev/mock/academic';
import { mockResults, mockActivityLog, mockAuditLog, mockTerms, mockFeedbackComments, mockDepartments } from '@/dev/mock/records';
import { mockEvents, mockAnnouncements, mockCalendarEvents } from '@/dev/mock/events';

// ─── Data mode ──────────────────────────────────────────────────────────────
// VITE_USE_MOCK_DATA (env var) sets the per-environment default.
// localStorage key 'sms_data_mode_v2' ('mock' | 'blank' | 'live') overrides it per session.
// Key renamed from 'sms_data_mode' to avoid misinterpreting the old 'live' value (which meant
// blank/empty) as the new 'live' value (which fires real Firestore queries).
// Changing the key requires a page reload to take effect.
export type DataMode = 'mock' | 'blank' | 'live';

const _valid: DataMode[] = ['mock', 'blank', 'live'];

// Production always uses live data. The mock/blank defaults and localStorage
// override only apply in dev, where the DevDataModeToggle is visible.
const _defaultMode: DataMode = !import.meta.env.DEV
  ? 'live'
  : import.meta.env.VITE_USE_MOCK_DATA === 'true'
  ? 'mock'
  : 'blank';

const _stored =
  import.meta.env.DEV && typeof localStorage !== 'undefined'
    ? localStorage.getItem('sms_data_mode_v2')
    : null;

const _override =
  _stored && (_valid as string[]).includes(_stored)
    ? (_stored as DataMode)
    : null;

export const DATA_MODE: DataMode = _override ?? _defaultMode;
export const USE_MOCK = DATA_MODE === 'mock'; // backwards compat — existing consumers unchanged

// ─── Conditional re-exports ──────────────────────────────────────────────────
// All existing imports in page components remain unchanged.
// When USE_MOCK is false every array is empty, producing blank-data empty states.
export const teachersData         = USE_MOCK ? mockTeachers         : [];
export const studentsData         = USE_MOCK ? mockStudents         : [];
export const parentsData          = USE_MOCK ? mockParents          : [];
export const subjectsData         = USE_MOCK ? mockSubjects         : [];
export const classesData          = USE_MOCK ? mockClasses          : [];
export const lessonsData          = USE_MOCK ? mockLessons          : [];
export const examsData            = USE_MOCK ? mockExams            : [];
export const assignmentsData      = USE_MOCK ? mockAssignments      : [];
export const resultsData          = USE_MOCK ? mockResults          : [];
export const eventsData           = USE_MOCK ? mockEvents           : [];
export const announcementsData    = USE_MOCK ? mockAnnouncements    : [];
export const calendarEvents       = USE_MOCK ? mockCalendarEvents : [];
export const activityLogData      = USE_MOCK ? mockActivityLog      : [];
export const auditLogData         = USE_MOCK ? mockAuditLog         : [];
export const termsData            = USE_MOCK ? mockTerms            : [];
export const feedbackCommentsData = USE_MOCK ? mockFeedbackComments : [];
export const departmentsData      = USE_MOCK ? mockDepartments      : [];
