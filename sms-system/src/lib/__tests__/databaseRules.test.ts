import { describe, expect, it } from 'vitest';
import raw from '../../../database.rules.json?raw';

// database.rules.json guards two things: the single-session lock (/sessions) and
// the large-attachment store (/files, /usage; docs/miscellaneous-specs/
// LARGE_ATTACHMENTS_RTDB_SPEC.md sections 4 and 6). There is no rules emulator in
// this project, so this reads the file as data and pins the properties the design
// depends on. It cannot prove how the Realtime Database evaluates a multi-path
// write; that needs a real write against the deployed rules (spec Phase 1/7).
// When you deliberately change these rules, update this test too.

type Node = Record<string, unknown>;
const rules = (JSON.parse(raw) as { rules: Node }).rules;

const files = rules.files as Node;
const blob = (files.$institutionId as Node).$blobKey as Node;
const usage = rules.usage as Node;
const instCounter = ((usage.institutions as Node).$institutionId as Node).bytes as Node;
const totalCounter = (usage.total as Node).bytes as Node;

const blobWrite = blob['.write'] as string;
const blobValidate = blob['.validate'] as string;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MIME_RE =
  /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation)|image\/(jpeg|png|webp))$/;

// The regex literal inside a rule expression, as a JS RegExp, found by its anchor.
function regexAfter(expr: string, needle: string): RegExp {
  const start = expr.indexOf(needle);
  expect(start, `${needle} not found`).toBeGreaterThan(-1);
  const open = expr.indexOf('/^', start);
  const close = expr.indexOf('$/', open);
  return new RegExp(expr.slice(open + 1, close + 1));
}

describe('top level', () => {
  it('denies everything by default', () => {
    expect(rules['.read']).toBe(false);
    expect(rules['.write']).toBe(false);
  });

  it('only knows sessions, files and usage', () => {
    expect(Object.keys(rules).filter((k) => !k.startsWith('.')).sort()).toEqual(['files', 'sessions', 'usage']);
  });
});

describe('sessions (single-session lock) is unchanged', () => {
  const s = (rules.sessions as Node).$uid as Node;
  it('is private to its owner', () => {
    expect(s['.read']).toBe('auth != null && auth.uid === $uid');
    expect(s['.write']).toBe('auth != null && auth.uid === $uid');
  });
  it('keeps its shape validation', () => {
    expect(s['.validate']).toContain("newData.hasChildren(['sessionId', 'startedAt'])");
    expect((s.$other as Node)['.validate']).toBe(false);
  });
});

describe('files: no listing', () => {
  it('has no read or write rule above the individual blob', () => {
    expect(files['.read']).toBeUndefined();
    expect(files['.write']).toBeUndefined();
    const inst = files.$institutionId as Node;
    expect(inst['.read']).toBeUndefined();
    expect(inst['.write']).toBeUndefined();
  });

  it('reads a blob by exact path for any signed-in user (capability key, D3/D4)', () => {
    expect(blob['.read']).toBe('auth != null');
  });
});

describe('files: create or delete only', () => {
  it('requires sign-in', () => {
    expect(blobWrite.startsWith('auth != null && (')).toBe(true);
  });

  it('allows creating a blob that does not exist and deleting one that does', () => {
    expect(blobWrite).toContain('!data.exists() && newData.exists()');
    expect(blobWrite).toContain('data.exists() && !newData.exists()');
  });

  it('never allows replacing an existing blob (no branch with both existing)', () => {
    expect(blobWrite).not.toMatch(/(?<!!)data\.exists\(\) && newData\.exists\(\)/);
  });

  it('ties both counters to the blob size on create and on delete', () => {
    for (const path of ["'usage/institutions/' + $institutionId + '/bytes'", "'usage/total/bytes'"]) {
      const post = `newData.parent().parent().parent().child(${path}).val() ==`;
      expect(blobWrite.split(post).length - 1, path).toBe(2); // create + delete
    }
    // each counter grows by the new size on create ...
    expect(blobWrite.split(") + newData.child('size').val()").length - 1).toBe(2);
    // ... and shrinks by the old size on delete (floored at 0)
    expect(blobWrite.split(" - data.child('size').val() : 0)").length - 1).toBe(2);
  });
});

describe('files: what a blob must look like', () => {
  it('may be deleted (an empty write validates)', () => {
    expect(blobValidate.startsWith('!newData.exists() || (')).toBe(true);
  });

  it('has exactly the five known fields, each typed', () => {
    expect(blobValidate).toContain("newData.hasChildren(['dataUrl', 'size', 'mimeType', 'uploadedAt', 'uploadedBy'])");
    expect((blob.$other as Node)['.validate']).toBe(false);
    expect((blob.dataUrl as Node)['.validate']).toBe('newData.isString()');
    expect((blob.size as Node)['.validate']).toBe('newData.isNumber()');
    expect((blob.mimeType as Node)['.validate']).toBe('newData.isString()');
    expect((blob.uploadedAt as Node)['.validate']).toBe('newData.isNumber()');
    expect((blob.uploadedBy as Node)['.validate']).toBe('newData.isString()');
  });

  it('keys the blob by a lower-case UUID (not a guessable push id)', () => {
    const re = regexAfter(blobValidate, '$blobKey.matches(');
    expect(re.source).toBe(UUID_RE.source);
    expect(re.test('3b1ab39c-1c4e-4f0a-9d3e-0123456789ab')).toBe(true);
    expect(re.test('-NxYz123abcdefghij')).toBe(false); // a push id
    expect(re.test('3B1AB39C-1C4E-4F0A-9D3E-0123456789AB')).toBe(false);
    expect(re.test('../sessions')).toBe(false);
  });

  it('allows only the six attachment MIME types', () => {
    const re = regexAfter(blobValidate, "newData.child('mimeType').val().matches(");
    expect(re.source).toBe(MIME_RE.source);
    for (const ok of [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]) {
      expect(re.test(ok), ok).toBe(true);
    }
    for (const bad of ['text/html', 'image/svg+xml', 'application/pdf2', 'application/zip', '']) {
      expect(re.test(bad), bad).toBe(false);
    }
  });

  it('requires the data URL to start with its own MIME type', () => {
    expect(blobValidate).toContain(
      "newData.child('dataUrl').val().beginsWith('data:' + newData.child('mimeType').val() + ';base64,')",
    );
  });

  it('caps the file at 5 MiB and the data URL at 7,000,000 characters', () => {
    expect(blobValidate).toContain("newData.child('size').val() <= 5242880");
    expect(blobValidate).toContain("newData.child('size').val() > 0");
    expect(blobValidate).toContain("newData.child('dataUrl').val().length <= 7000000");
    expect(5 * 1024 * 1024).toBe(5242880);
  });

  it('lets a maximum-size file through both size checks', () => {
    const size = 5 * 1024 * 1024;
    const longestPrefix = 'data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,';
    const dataUrlLength = longestPrefix.length + Math.ceil(size / 3) * 4;
    expect(dataUrlLength).toBeLessThanOrEqual(7_000_000);
    expect(dataUrlLength).toBeLessThanOrEqual((size * 4) / 3 + 100);
  });

  it('rejects a data URL much longer than its declared size (budget dodge)', () => {
    expect(blobValidate).toContain("newData.child('dataUrl').val().length <= newData.child('size').val() * 4 / 3 + 100");
  });

  it('stamps the server time and the uploader', () => {
    expect(blobValidate).toContain("newData.child('uploadedAt').val() === now");
    expect(blobValidate).toContain("newData.child('uploadedBy').val() === auth.uid");
  });

  it('bounds the institution id used in the path', () => {
    expect(blobValidate).toContain('$institutionId.length > 0 && $institutionId.length <= 128');
  });
});

describe('usage counters', () => {
  it('are readable by signed-in users and never deleted', () => {
    for (const c of [instCounter, totalCounter]) {
      expect(c['.read']).toBe('auth != null');
      expect(c['.write']).toBe('auth != null && newData.exists()');
    }
  });

  it('cap an institution at 200 MB and all institutions at 900 MB', () => {
    expect(instCounter['.validate']).toBe('newData.isNumber() && newData.val() >= 0 && newData.val() <= 200000000');
    expect(totalCounter['.validate']).toBe('newData.isNumber() && newData.val() >= 0 && newData.val() <= 900000000');
  });

  it('keep the global ceiling below the 1 GB Spark limit', () => {
    expect(900_000_000).toBeLessThan(1_000_000_000);
  });

  it('use separate branches so a wildcard never applies to the global counter', () => {
    expect(Object.keys(usage).sort()).toEqual(['institutions', 'total']);
    expect(Object.keys(usage.institutions as Node)).toEqual(['$institutionId']);
  });
});
