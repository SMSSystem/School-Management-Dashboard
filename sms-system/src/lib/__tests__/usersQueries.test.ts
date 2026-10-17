import { describe, expect, it } from 'vitest';
import housesRaw from '../../scenes/(dashboard)/list/houses/index.tsx?raw';
import { buildStaticGraph } from '../../../scripts/bundleGraphLogic.mjs';

// The users read rule (firestore.rules, match /users/{uid}) lets staff read a profile only when
//   sameInstitution(resource.data.institutionId)
// and Firestore decides a LIST query from its own filters, before it looks at any document. A staff
// query on `users` that does not name the institution is therefore refused (permission-denied), even
// when every document it would return is readable. Only super_admin gets through without the filter,
// and a parent's `__name__ ==` lookup of one linked child is provable from the document id.
//
// On 2026-10-17 the houses list queried users by `houseId ==` alone, in the delete dialog (the
// student count) and in the delete itself. For an institution admin the count never arrived, and
// the Delete button, disabled until it does, never enabled: a house could not be deleted. A probe
// as the QA admin showed the unfiltered query DENIED and the same query with `institutionId ==`
// ALLOWED. These pin the filter and fail if another users query goes the same way.

const norm = (s: string) => s.split('\r\n').join('\n');
const houses = norm(housesRaw);

describe('houses list: users queries', () => {
  it("name the house's institution, so the read rule can hold for an institution admin", () => {
    const filtered = houses.match(/where\("houseId", "==", deleteTarget\.id\),\s*where\("institutionId", "==", institutionId\),/g);
    expect(filtered).toHaveLength(2);
  });

  it('no longer query users by houseId alone', () => {
    expect(houses).not.toMatch(/where\("houseId", "==", deleteTarget\.id\)\s*\)/);
  });

  it('wait for the institution before counting the house’s students', () => {
    expect(houses).toContain('if (!deleteTarget || !institutionId) return;');
    expect(houses).toContain('}, [deleteTarget, institutionId]);');
  });
});

// Files whose users queries are not filtered on the institution, and why that is fine.
const UNFILTERED_OK: Record<string, string> = {
  'src/hooks/useSpectators.ts': 'super_admin only: role == spectator across every institution',
  'src/scenes/(dashboard)/super-admin/index.tsx': 'super_admin only: platform totals',
  'src/scenes/(dashboard)/super-admin/manage-admins/index.tsx': 'super_admin only: every institution admin',
  'src/lib/classPopulationQueries.ts': 'the institutionId filter is in the constraint list built just above',
  'src/hooks/useInstitutionUsers.ts': 'the institutionId filter is in the constraint list built just above (teacherUsersQuery.test.ts pins it)',
};

describe('every users query in the app', () => {
  it('names the institution, looks up one child by document id, or is on the super_admin list', () => {
    const graph = buildStaticGraph();
    const refused: string[] = [];
    let found = 0;
    for (const [file, text] of graph.files) {
      const flat = text.replace(/\s+/g, ' ');
      for (const match of flat.matchAll(/collection\(\s*db,\s*['"]users['"]\s*\)/g)) {
        found += 1;
        const at = match.index ?? 0;
        const near = flat.slice(Math.max(0, at - 120), at + 420);
        const namesInstitution = /where\(\s*['"]institutionId['"]/.test(near);
        const oneDocument = /where\(\s*['"]__name__['"]/.test(near);
        // Not a query at all: a path into the user's own subcollection or document, such as
        // collection(db, "users") passed to doc() or addDoc().
        const notAQuery = !/\b(query|getCountFromServer|onSnapshot|getDocs)\(/.test(near);
        if (!namesInstitution && !oneDocument && !notAQuery && !(file in UNFILTERED_OK)) refused.push(file);
      }
    }
    expect(found, "the scan should find the app's users queries").toBeGreaterThan(40);
    expect(refused, 'add where("institutionId", "==", ...) to these queries (see the comment at the top of this file)').toEqual([]);
  });
});
