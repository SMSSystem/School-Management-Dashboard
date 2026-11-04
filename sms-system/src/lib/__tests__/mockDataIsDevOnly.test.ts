import { describe, expect, it } from 'vitest';
import appSrc from '../../App.tsx?raw';
import dataSrc from '../data.ts?raw';
import * as data from '../data';

// The development mock data (the Dev Data Mode toggle's "mock" mode) must not reach a production build. A build
// drops it only while nothing but lib/data.ts reaches it, and lib/data.ts hands it out only when USE_MOCK is
// true (false in production). A scratch build was searched for the mock sentinels to find this out; these tests
// keep the structure that makes it so. (A stray import elsewhere would pull a whole mock file into a page.)

// Every source file except the mock files and the tests, as text. (Keys are relative to this folder.)
// Fallow would count this raw-text glob as importing every file, so this test is in ignorePatterns in .fallowrc.json.
const sources = import.meta.glob(['../../**/*.{ts,tsx}', '!../../dev/**', '!../../**/__tests__/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const progressReportsPageSrc = sources['../../scenes/(dashboard)/progress-reports/index.tsx'];

const MOCK_FILES = import.meta.glob('../../dev/mock/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const PUBLIC_EXPORTS = [
  'teachersData', 'studentsData', 'parentsData', 'subjectsData', 'classesData', 'lessonsData', 'examsData',
  'assignmentsData', 'resultsData', 'eventsData', 'announcementsData', 'calendarEvents', 'activityLogData',
  'auditLogData', 'termsData', 'feedbackCommentsData', 'departmentsData',
];

const counted = (src: string) => src.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.trim().startsWith('//')).length;

describe('the mock datasets stay development-only', () => {
  it('are imported by lib/data.ts and by nothing else', () => {
    const importers = Object.entries(sources)
      .filter(([, src]) => /from\s+['"](@\/|(\.\.?\/)+)dev\/mock\//.test(src))
      .map(([key]) => key);
    expect(importers).toEqual(['../data.ts']);
  });

  it('are four files, each under the line limit, that import nothing from the app', () => {
    expect(Object.keys(MOCK_FILES).sort()).toEqual([
      '../../dev/mock/academic.ts',
      '../../dev/mock/events.ts',
      '../../dev/mock/people.ts',
      '../../dev/mock/records.ts',
    ]);
    for (const [key, src] of Object.entries(MOCK_FILES)) {
      expect(counted(src), key).toBeLessThan(600);
      expect(src, key).not.toMatch(/^import\s/m);
    }
  });

  it('are handed out by lib/data.ts only when USE_MOCK is true: the 18 public exports, each an empty array otherwise', () => {
    expect(dataSrc.split('\n').length).toBeLessThan(150);
    for (const name of PUBLIC_EXPORTS) {
      expect(dataSrc, name).toMatch(new RegExp(`export const ${name}\\s+= USE_MOCK \\? mock\\w+\\s*: \\[\\];`));
    }
    expect(data.USE_MOCK).toBe(false);
    for (const name of PUBLIC_EXPORTS) {
      expect((data as unknown as Record<string, unknown[]>)[name], name).toEqual([]);
    }
  });

  it('keep the production bundle free of them: the toggle is built only in development and the Progress Reports page starts its mock rows empty outside mock mode', () => {
    expect(appSrc).toMatch(/\{import\.meta\.env\.DEV && <DevDataModeToggle \/>\}/);
    expect(progressReportsPageSrc).toMatch(/useState<ReportRow\[\]>\(\(\) => \(USE_MOCK \? \[\.\.\.progressReportsMock\] : \[\]\)\)/);
  });

  it('are the only reason the Progress Reports page imports lib/mockData/progressReports', () => {
    const importers = Object.entries(sources)
      .filter(([, src]) => /lib\/mockData\/progressReports['"]/.test(src))
      .map(([key]) => key);
    expect(importers).toEqual(['../../scenes/(dashboard)/progress-reports/index.tsx']);
  });
});
