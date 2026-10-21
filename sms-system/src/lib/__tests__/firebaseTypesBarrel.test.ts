import { describe, expect, it } from 'vitest';
import firebaseRaw from '../firebase.ts?raw';

// The Firestore document types live in src/types, one file per area, and src/lib/firebase.ts
// re-exports them so every `import { ... } from '@/lib/firebase'` keeps working. A type file that
// the barrel forgets would still compile on its own but vanish for its 140-odd importers' names,
// and a type file that imports firebase.ts would pull the Firebase app into a file of shapes.

const typeFiles = import.meta.glob('../../types/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const norm = (s: string) => s.split('\r\n').join('\n');

describe('src/lib/firebase.ts type re-exports', () => {
  const names = Object.keys(typeFiles).map((p) => p.replace('../../types/', '').replace('.ts', ''));

  it('has the document type files', () => {
    expect(names.sort()).toEqual(['assessment', 'attendance', 'audit', 'exams', 'institution', 'lessonNotes', 'people', 'registration', 'reports']);
  });

  it('re-exports every type file', () => {
    const firebase = norm(firebaseRaw);
    for (const name of names) expect(firebase, name).toContain(`export * from '@/types/${name}';`);
  });

  it('keeps the type files free of the Firebase app', () => {
    for (const [path, text] of Object.entries(typeFiles)) {
      const imports = [...norm(text).matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
      expect(imports.filter((i) => /firebase['"]?$/.test(i) && i !== 'firebase/firestore'), path).toEqual([]);
      expect(imports.filter((i) => i.startsWith('firebase/') && i !== 'firebase/firestore'), path).toEqual([]);
    }
  });

  it('is only the Firebase setup now', () => {
    expect(norm(firebaseRaw).split('\n').length).toBeLessThan(200);
  });
});
