import { describe, expect, it } from 'vitest';
import { buildStaticGraph } from '../../../scripts/bundleGraphLogic.mjs';

// A student's `classId` is their HOME class; `classIds` lists every class they are in, home included
// (lib/studentClasses.ts). A query for "the students of a class" must use `classIds array-contains`, or a
// student added to the class as an additional class is missing from it. Only the places that mean the
// home class by design may still ask `classId ==` of the users collection, and they are listed here.

const HOME_ONLY: Record<string, string> = {
  'src/lib/generalAttendanceSave.ts': 'the general register is the home class',
  'src/scenes/(dashboard)/attendance/gridsheet/index.tsx': 'the register summary is the home class',
  'src/components/attendance/AttendanceScopeModal.tsx': 'the register PDF scope is the home class',
  'src/scenes/(dashboard)/report-cards/index.tsx': 'a report card is for the home class',
  'src/scenes/(dashboard)/progress-reports/index.tsx': 'a progress report is for the home class',
  'src/scenes/(dashboard)/report-card-comments/index.tsx': 'comments belong to the report card, the home class',
  'src/lib/generateReportCard.ts': 'class rank and population on a report card are the home class',
  'src/lib/classDeletion.ts': 'counts the students whose home class it is, to tell them from additional ones',
  'src/lib/importFetch.ts': 'the attendance and results imports follow the register, the home class',
};

describe('every users query by class', () => {
  it('uses classIds, unless it is a home-class place on the list', () => {
    const graph = buildStaticGraph();
    const refused: string[] = [];
    let queries = 0;
    for (const [file, text] of graph.files) {
      const flat = text.replace(/\s+/g, ' ');
      for (const match of flat.matchAll(/collection\(\s*db,\s*['"]users['"]\s*\)/g)) {
        const at = match.index ?? 0;
        // from this query's collection() to the start of the next read, so a neighbouring query is not mistaken for it
        const ahead = flat.slice(at + 1, at + 420);
        const nextRead = ahead.search(/(?<![A-Za-z])(?:getDocs|getDoc|getCountFromServer|onSnapshot)[(]/);
        const near = flat.slice(Math.max(0, at - 40), at + 1 + (nextRead === -1 ? 420 : nextRead));
        if (!/where\(\s*['"]classIds?['"]/.test(near)) continue;
        queries += 1;
        if (/where\(\s*['"]classId['"]\s*,\s*['"]==['"]/.test(near) && !(file in HOME_ONLY)) refused.push(file);
      }
      // A list of constraints built apart from the collection() call (classPopulationQueries.ts): found by
      // the student-role filter that every such list carries.
      for (const match of flat.matchAll(/where\(\s*['"]role['"]\s*,\s*['"]==['"]\s*,\s*['"]student['"]\s*\)/g)) {
        const at = match.index ?? 0;
        const near = flat.slice(Math.max(0, at - 80), at + 160);
        if (/collection\(\s*db,\s*['"]users['"]/.test(near) || !/where\(\s*['"]classIds?['"]/.test(near)) continue;
        queries += 1;
        if (/where\(\s*['"]classId['"]\s*,\s*['"]==['"]/.test(near) && !(file in HOME_ONLY)) refused.push(file);
      }
    }
    expect(queries, 'the scan should find the app\'s users-by-class queries').toBeGreaterThan(8);
    expect(refused, 'ask for the class with where("classIds", "array-contains", ...), or list the file as home-class only').toEqual([]);
  });

  it('every file on the home-class list still exists in the app', () => {
    const files = new Set([...buildStaticGraph().files.keys()]);
    for (const file of Object.keys(HOME_ONLY)) expect(files.has(file), file).toBe(true);
  });
});
