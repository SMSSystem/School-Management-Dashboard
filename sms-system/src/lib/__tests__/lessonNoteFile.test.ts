import { beforeEach, describe, expect, it, vi } from 'vitest';

// How a lesson note's file is recorded: embedded (dataUrl) or by key (blobKey),
// and how the old key is found before it is replaced or deleted.

const h = vi.hoisted(() => ({
  doc: { path: '' as string } as { path: string },
  snap: { data: () => undefined as unknown },
  fail: false,
  lastPath: [] as unknown[],
}));

vi.mock('firebase/firestore', () => ({
  getDoc: async () => {
    if (h.fail) throw new Error('offline');
    return h.snap;
  },
}));
vi.mock('../paths', () => ({
  institutionSubdoc: (...parts: unknown[]) => {
    h.lastPath = parts;
    return h.doc;
  },
}));

import { attachmentData, existingBlobKey } from '../lessonNoteFile';

const FILE = {
  dataUrl: 'data:application/pdf;base64,AAAA',
  fileName: 'notes.pdf',
  mimeType: 'application/pdf' as const,
  size: 1234,
};
const KEY = '3b1ab39c-1c4e-4f0a-9d3e-0123456789ab';

beforeEach(() => {
  h.fail = false;
  h.snap = { data: () => undefined };
  h.lastPath = [];
});

describe('attachmentData', () => {
  it('embeds a small file as dataUrl with no blobKey', () => {
    const d = attachmentData(FILE, null);
    expect(d).toEqual({ dataUrl: FILE.dataUrl, fileName: 'notes.pdf', mimeType: 'application/pdf', size: 1234 });
    expect(d).not.toHaveProperty('blobKey');
  });

  it('records a large file by key only, never with its body (the rules allow exactly one)', () => {
    const d = attachmentData(FILE, KEY);
    expect(d).toEqual({ blobKey: KEY, fileName: 'notes.pdf', mimeType: 'application/pdf', size: 1234 });
    expect(d).not.toHaveProperty('dataUrl');
  });

  it('uses only fields the Firestore rule allows', () => {
    const allowed = ['dataUrl', 'blobKey', 'fileName', 'mimeType', 'size'];
    for (const d of [attachmentData(FILE, null), attachmentData(FILE, KEY)]) {
      expect(Object.keys(d).every((k) => allowed.includes(k))).toBe(true);
    }
  });
});

describe('existingBlobKey', () => {
  it('returns the key stored on the note’s attachment record', async () => {
    h.snap = { data: () => ({ blobKey: KEY, fileName: 'a.pdf' }) };
    await expect(existingBlobKey('inst1', 'note1')).resolves.toBe(KEY);
    expect(h.lastPath).toEqual(['inst1', 'lessonNotes', 'note1', 'attachment', 'data']);
  });

  it('is null for an embedded file, a missing record or a malformed key', async () => {
    h.snap = { data: () => ({ dataUrl: 'data:x' }) };
    await expect(existingBlobKey('inst1', 'note1')).resolves.toBeNull();
    h.snap = { data: () => undefined };
    await expect(existingBlobKey('inst1', 'note1')).resolves.toBeNull();
    h.snap = { data: () => ({ blobKey: 42 }) };
    await expect(existingBlobKey('inst1', 'note1')).resolves.toBeNull();
  });

  it('never throws: an unreadable record just leaves the file for the sweep', async () => {
    h.fail = true;
    await expect(existingBlobKey('inst1', 'note1')).resolves.toBeNull();
  });
});
