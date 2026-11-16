import { describe, expect, it, vi } from 'vitest';

// How an assignment's teacher attachment is recorded: embedded or by key, never
// both, with the other kind cleared on update.

const h = vi.hoisted(() => ({
  DELETE: { __delete: true },
}));

vi.mock('firebase/firestore', () => ({
  deleteField: () => h.DELETE,
}));

import { assignmentAttachmentFields } from '../assignmentFile';

const KEY = '3b1ab39c-1c4e-4f0a-9d3e-0123456789ab';
const SMALL = { dataUrl: 'data:application/pdf;base64,AAAA', fileName: 'a.pdf', mimeType: 'application/pdf' as const, size: 1000 };
const LARGE = { dataUrl: 'data:application/pdf;base64,BBBB', fileName: 'b.pdf', mimeType: 'application/pdf' as const, size: 3_000_000 };
const KEPT = { dataUrl: '', blobKey: KEY, fileName: 'c.pdf', mimeType: 'application/pdf' as const, size: 4_000_000 };


describe('assignmentAttachmentFields', () => {
  it('writes nothing on create without a file', () => {
    expect(assignmentAttachmentFields(null, null, false)).toEqual({});
  });

  it('clears every attachment field on update without a file', () => {
    expect(assignmentAttachmentFields(null, null, true)).toEqual({
      attachmentDataUrl: h.DELETE,
      attachmentBlobKey: h.DELETE,
      attachmentFileName: h.DELETE,
      attachmentMimeType: h.DELETE,
      attachmentSize: h.DELETE,
    });
  });

  it('embeds a small new file and, on update, clears any old key', () => {
    expect(assignmentAttachmentFields(SMALL, null, false)).toEqual({
      attachmentDataUrl: SMALL.dataUrl,
      attachmentFileName: 'a.pdf',
      attachmentMimeType: 'application/pdf',
      attachmentSize: 1000,
    });
    const u = assignmentAttachmentFields(SMALL, null, true);
    expect(u.attachmentDataUrl).toBe(SMALL.dataUrl);
    expect(u.attachmentBlobKey).toBe(h.DELETE);
  });

  it('records a newly uploaded large file by key only (no body), clearing any old body on update', () => {
    const c = assignmentAttachmentFields(LARGE, KEY, false);
    expect(c).toEqual({
      attachmentBlobKey: KEY,
      attachmentFileName: 'b.pdf',
      attachmentMimeType: 'application/pdf',
      attachmentSize: 3_000_000,
    });
    expect(c).not.toHaveProperty('attachmentDataUrl');
    const u = assignmentAttachmentFields(LARGE, KEY, true);
    expect(u.attachmentBlobKey).toBe(KEY);
    expect(u.attachmentDataUrl).toBe(h.DELETE);
  });

  it('keeps an already stored large file by its own key, ignoring any new key', () => {
    const u = assignmentAttachmentFields(KEPT, null, true);
    expect(u.attachmentBlobKey).toBe(KEY);
    expect(u.attachmentSize).toBe(4_000_000);
    expect(u.attachmentDataUrl).toBe(h.DELETE);
    expect(assignmentAttachmentFields(KEPT, 'another', true).attachmentBlobKey).toBe(KEY);
  });

  it('never leaves both a body and a key set', () => {
    for (const [file, key, update] of [
      [SMALL, null, false],
      [SMALL, null, true],
      [LARGE, KEY, false],
      [LARGE, KEY, true],
      [KEPT, null, true],
    ] as const) {
      const f = assignmentAttachmentFields(file, key, update);
      const body = f.attachmentDataUrl !== undefined && f.attachmentDataUrl !== h.DELETE;
      const ref = f.attachmentBlobKey !== undefined && f.attachmentBlobKey !== h.DELETE;
      expect(body && ref).toBe(false);
      expect(body || ref).toBe(true);
    }
  });

  it('never uses deleteField() on create (it is invalid against a new document)', () => {
    for (const file of [null, SMALL, LARGE]) {
      const f = assignmentAttachmentFields(file, file === LARGE ? KEY : null, false);
      expect(Object.values(f)).not.toContain(h.DELETE);
    }
  });
});

