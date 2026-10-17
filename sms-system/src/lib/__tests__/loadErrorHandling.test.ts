import { describe, expect, it } from 'vitest';
import { findUnhandledLoads } from '../../../scripts/loadErrorScanLogic.mjs';
import { buildStaticGraph } from '../../../scripts/bundleGraphLogic.mjs';

// A Firestore listener or read that has no way to fail leaves its page on "Loading..." (a refused
// listener) or empty (a refused getDocs), with nothing on screen to say why: both student_parents bugs
// of 2026-10-16 and the photo and houses bugs of 2026-10-17 hid that way. Every listener and read now
// passes its failure to onLoadError() (lib/reportError.ts), which logs it, tells the person, and lets
// the page stop waiting. This fails when a new one does not.
//
//   onSnapshot(q, next, onLoadError("classes", () => setLoading(false)))
//   getDocs(q).then(ok, onLoadError("classes", () => setLoading(false)))
//   loadX().catch(onLoadError("classes"))
//
// The scanner (scripts/loadErrorScanLogic.mjs) is tested on fixtures first, so a pass means something.

const sites = (code: string, file = 'src/fixture.ts') => findUnhandledLoads(new Map([[file, code]]));
const categories = (code: string) => sites(code).map((s) => s.category);

describe('the scanner: listeners', () => {
  it('flags onSnapshot with no error callback', () => {
    expect(categories('onSnapshot(q, (s) => { use(s); });')).toEqual(['listener']);
    expect(categories('onSnapshot(q, { includeMetadataChanges: true }, (s) => {});')).toEqual(['listener']);
  });

  it('accepts an error callback, in any of the forms the SDK allows', () => {
    expect(categories('onSnapshot(q, (s) => {}, (e) => {});')).toEqual([]);
    expect(categories('onSnapshot(q, (s) => {}, onLoadError("x"));')).toEqual([]);
    expect(categories('onSnapshot(q, { includeMetadataChanges: true }, (s) => {}, (e) => {});')).toEqual([]);
    expect(categories('onSnapshot(q, { next: () => {}, error: () => {} });')).toEqual([]);
  });
});

describe('the scanner: chained reads', () => {
  it('flags a read that is chained without a rejection handler', () => {
    expect(categories('getDocs(q).then((s) => use(s));')).toEqual(['chain']);
    expect(categories('getDoc(r).then((s) => use(s)).finally(() => stop());')).toEqual(['chain']);
    expect(categories('void getDoc(r).then((s) => use(s));')).toEqual(['chain']);
    expect(categories('fetchInstitutionClasses(id).then((c) => use(c));')).toEqual(['chain']);
    expect(categories('queryClient.fetchQuery({ queryKey: k, queryFn: f }).then((c) => use(c));')).toEqual(['chain']);
    expect(categories('Promise.all([getDocs(a), getDoc(b)]).then(([x, y]) => use(x, y));')).toEqual(['chain']);
  });

  it('accepts .catch(...) or a second argument to .then, anywhere in the chain', () => {
    expect(categories('getDocs(q).then((s) => use(s)).catch(h);')).toEqual([]);
    expect(categories('getDocs(q).then((s) => use(s), h);')).toEqual([]);
    expect(categories('getDocs(q).then((s) => use(s), h).finally(() => stop());')).toEqual([]);
    expect(categories('getDoc(r).then((s) => use(s), onLoadError("x"));')).toEqual([]);
    expect(categories('Promise.all([getDocs(a), getDoc(b)]).then(([x, y]) => use(x, y), h);')).toEqual([]);
    expect(categories('fetchInstitutionClasses(id).then((c) => use(c), h);')).toEqual([]);
  });

  it('does not flag awaited reads, bare reads, or chains that are not reads', () => {
    expect(categories('async function f() { const s = await getDocs(q); use(s); }')).toEqual([]);
    expect(categories('fetch("/x").then((r) => use(r));')).toEqual([]);
    expect(categories('signOut(auth).then(() => go());')).toEqual([]);
    expect(categories('Promise.all([a(), b()]).then(([x, y]) => use(x, y));')).toEqual([]);
  });
});

describe('the scanner: async calls', () => {
  it('flags an async IIFE that awaits a read outside any try/catch', () => {
    expect(categories('(async () => { const s = await getDoc(r); use(s); })();')).toEqual(['async']);
  });

  it('flags a bare or void call of a local async function that does', () => {
    const fn = 'async function load() { const s = await getDocs(q); use(s); }';
    expect(categories(`${fn}\nload();`)).toEqual(['async']);
    expect(categories(`${fn}\nvoid load();`)).toEqual(['async']);
    expect(categories(`const load = async () => { await fetchInstitutionTerms(id); };\nload();`)).toEqual(['async']);
  });

  it('flags a read nested in an async callback that the function awaits (Promise.all of async arrows)', () => {
    expect(
      categories('async function load() { await Promise.all(ids.map(async (id) => { await getDoc(ref(id)); })); }\nload();'),
    ).toEqual(['async']);
  });

  it('accepts a try/catch around the read, or a .catch on the call', () => {
    expect(categories('(async () => { try { await getDoc(r); } catch (e) { h(e); } })();')).toEqual([]);
    expect(categories('(async () => { await getDoc(r); })().catch(h);')).toEqual([]);
    const guarded = 'async function load() { try { await getDocs(q); } catch (e) { h(e); } }';
    expect(categories(`${guarded}\nload();`)).toEqual([]);
    const bare = 'async function load() { await getDocs(q); }';
    expect(categories(`${bare}\nload().catch(h);`)).toEqual([]);
  });

  it('treats a read with its own rejection handler as covered, but not another read beside it', () => {
    const covered = 'async function load() { const u = await fetchUserPhotoUrl(a, b).catch(() => null); use(u); }';
    expect(categories(`${covered}\nvoid load();`)).toEqual([]);
    const coveredAll = 'async function load() { await Promise.all([getDocs(a), getDocs(b)]).catch(h); }';
    expect(categories(`${coveredAll}\nload();`)).toEqual([]);
    const beside = 'async function load() { await getDocs(a).catch(h); await getDoc(b); }';
    expect(categories(`${beside}\nload();`)).toEqual(['async']);
    const inCallback = 'async function load() { await getDocs(a).then(async (s) => { await getDoc(b); }, h); }';
    expect(categories(`${inCallback}\nload();`)).toEqual(['async']);
  });

  it('does not flag an async function that reads nothing, or a call that is awaited', () => {
    expect(categories('async function save() { await setDoc(r, v); }\nsave();')).toEqual([]);
    expect(categories('async function load() { await getDocs(q); }\nasync function run() { await load(); }')).toEqual([]);
  });
});

describe('the scanner: reporting', () => {
  it('says where: file, 1-based line, category and the source line', () => {
    const found = sites('const a = 1;\n\nonSnapshot(q, (s) => {});\n', 'src/scenes/x.tsx');
    expect(found).toEqual([{ category: 'listener', file: 'src/scenes/x.tsx', line: 3, text: 'onSnapshot(q, (s) => {});' }]);
  });

  it('parses .tsx files', () => {
    const code = 'export const A = () => { useEffect(() => { getDocs(q).then((s) => set(s)); }, []); return <div />; };';
    expect(sites(code, 'src/A.tsx').map((s) => s.category)).toEqual(['chain']);
  });
});

describe('every listener and read in the app', () => {
  it('has a way to fail: an error callback, a rejection handler, or a try/catch', () => {
    const graph = buildStaticGraph();
    expect(graph.files.size, 'the scan should see the app').toBeGreaterThan(300);
    const found = findUnhandledLoads(graph.files).map((s) => `${s.file}:${s.line}  (${s.category})  ${s.text}`);
    expect(found, 'pass the failure to onLoadError() from lib/reportError.ts (see the comment at the top of this file)').toEqual([]);
    // parses every source file with the TypeScript compiler: slow when the whole suite runs in parallel
  }, 60_000);
});
