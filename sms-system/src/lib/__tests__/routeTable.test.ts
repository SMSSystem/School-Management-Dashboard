import { Fragment, createElement } from 'react';
import { createRoutesFromChildren } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { appSource, routingFile } from './appSource';
import { generalRoutes } from '../../routes/generalRoutes';
import { peopleRoutes } from '../../routes/peopleRoutes';
import { academicRoutes } from '../../routes/academicRoutes';
import { attendanceRoutes } from '../../routes/attendanceRoutes';
import { reportingRoutes } from '../../routes/reportingRoutes';

// The route files only build elements; the one component they import statically reaches Firebase.
vi.mock('../../components/NoAccessPage', () => ({ default: () => null }));

// Every route the app registers, and whether it redirects some people to /dashboard ("guarded") or
// shows the page to whoever reaches it ("open"; the role rules of the page itself apply). App.tsx
// is being split into route files; this table fails if a route is dropped, duplicated or loses its
// guard on the way. The guard wording itself is pinned by appRoutesSpectator and spectatorPages.

const EXPECTED: Record<string, 'guarded' | 'open'> = {
  '/login': 'open',
  '/login/:institutionId/:role': 'open',
  '/register': 'guarded',
  '/register/:institutionId': 'guarded',
  '/': 'open',
  '/dashboard': 'open',
  '/dashboard/list/teachers': 'open',
  '/dashboard/list/teachers/:id': 'open',
  '/dashboard/list/students': 'open',
  '/dashboard/list/students/:id': 'open',
  '/dashboard/list/parents': 'open',
  '/dashboard/list/spectators': 'guarded',
  '/dashboard/list/subjects': 'open',
  '/dashboard/list/subjects/:id': 'guarded',
  '/dashboard/list/classes': 'open',
  '/dashboard/list/classes/:id': 'guarded',
  '/dashboard/list/terms/:id': 'guarded',
  '/dashboard/list/lessons': 'open',
  '/dashboard/list/exams': 'open',
  '/dashboard/list/exams/:examId/build': 'guarded',
  '/dashboard/list/exams/:examId/preview': 'guarded',
  '/dashboard/list/exams/:examId/take': 'guarded',
  '/dashboard/list/exams/:examId/results': 'guarded',
  '/dashboard/list/assignments': 'open',
  '/dashboard/list/assignments/:id': 'open',
  '/dashboard/list/rubrics': 'guarded',
  '/dashboard/list/lesson-notes': 'guarded',
  '/dashboard/list/results': 'open',
  '/dashboard/list/gradebook': 'guarded',
  '/dashboard/list/events': 'open',
  '/dashboard/list/announcements': 'open',
  '/dashboard/list/terms': 'open',
  '/dashboard/list/feedback': 'open',
  '/dashboard/list/departments': 'open',
  '/dashboard/list/houses': 'guarded',
  '/dashboard/list/houses/:id': 'guarded',
  '/dashboard/report-card-comments': 'guarded',
  '/dashboard/schedule': 'open',
  '/dashboard/report-cards': 'open',
  '/dashboard/progress-reports': 'open',
  '/dashboard/disciplinary-actions': 'open',
  '/dashboard/import': 'guarded',
  '/dashboard/registrations': 'guarded',
  '/dashboard/reports/builder': 'guarded',
  '/dashboard/create-user': 'guarded',
  '/dashboard/admin/audit-log': 'guarded',
  '/dashboard/onboard-institution': 'guarded',
  '/dashboard/manage-admins': 'guarded',
  '/dashboard/academic-calendar': 'guarded',
  '/dashboard/attendance/general': 'guarded',
  '/dashboard/attendance/my': 'guarded',
  '/dashboard/attendance/child': 'guarded',
  '/dashboard/attendance/subject': 'guarded',
  '/dashboard/attendance/gridsheet': 'guarded',
  '/dashboard/admin/backfill-student-classes': 'guarded',
  '/dashboard/admin/rebuild-attendance-summaries': 'guarded',
  '/dashboard/admin/grade-entry-tracking': 'guarded',
  '/dashboard/brand-settings': 'guarded',
  '/dashboard/institution-profile': 'guarded',
  '/dashboard/profile': 'open',
  '/dashboard/settings': 'guarded',
  '*': 'open',
};

// [path, source of that <Route> up to the next one]
function routes(): Array<[string, string]> {
  const marks = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => [m[1], m.index ?? 0] as const);
  return marks.map(([path, at], i) => {
    const end = i + 1 < marks.length ? marks[i + 1][1] : appSource.length;
    return [path, appSource.slice(at, end).split('</Routes>')[0]];
  });
}

const isGuarded = (path: string, block: string) =>
  path !== '/' && path !== '*' && /<Navigate to="\/dashboard" replace \/>/.test(block) && block.includes('?');

describe('the route table', () => {
  it('has each path once', () => {
    const paths = routes().map(([p]) => p);
    expect(paths.filter((p, i) => paths.indexOf(p) !== i)).toEqual([]);
  });

  it('has exactly the expected paths', () => {
    expect(routes().map(([p]) => p).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('keeps each route guarded or open as before', () => {
    const actual = Object.fromEntries(routes().map(([p, block]) => [p, isGuarded(p, block) ? 'guarded' : 'open']));
    expect(actual).toEqual(EXPECTED);
  });
});

describe('the route files, as React Router reads them', () => {
  // <Routes> flattens fragments but ignores anything else, so this is what it would actually register.
  const registered = (role: Parameters<typeof generalRoutes>[0]) =>
    createRoutesFromChildren(
      createElement(
        Fragment,
        null,
        generalRoutes(role),
        peopleRoutes(role),
        academicRoutes(role),
        attendanceRoutes(role),
        reportingRoutes(role),
      ),
    ).map((r) => r.path);

  it.each(['institution_admin', 'student', null] as const)('registers every dashboard route for %s', (role) => {
    const dashboard = Object.keys(EXPECTED).filter((p) => !p.startsWith('/login') && !p.startsWith('/register'));
    expect(registered(role).sort()).toEqual(dashboard.sort());
  });

  it('has App.tsx hand its routes to each of the five route files', () => {
    const app = routingFile('App.tsx');
    for (const fn of ['generalRoutes', 'peopleRoutes', 'academicRoutes', 'attendanceRoutes', 'reportingRoutes']) {
      expect(app, fn).toContain(`{${fn}(role)}`);
    }
  });
});
