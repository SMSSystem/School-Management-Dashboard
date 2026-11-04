import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getDoc = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore', () => ({ getDoc }));
vi.mock('../paths', () => ({ institutionSubdoc: () => ({}) }));
vi.mock('../downloadFile', () => ({
  dataUrlToBlob: async (url: string) => new Blob([url]),
  saveBlob: vi.fn(),
}));
vi.mock('../blobStore', () => {
  class BlobMissingError extends Error {}
  class BlobStoppedError extends Error {}
  return { BlobMissingError, BlobStoppedError, getBlobDataUrl: vi.fn() };
});

import { BlobMissingError, BlobStoppedError } from '../blobStore';
import { NoteFileRefusedError, classifyNoteFileFailure, fetchLessonNoteFile, loadNoteFile } from '../lessonNoteAttachment';
import { memoryBackend, setStoreBackendForTests, storeFile } from '../noteFileStore';

// What a student sees when the rules refuse a file (LESSON_NOTE_12_FILES_SPEC.md section 10).

const FILE = { id: 'file1', fileName: 'a.pdf', size: 3 };
const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });

beforeEach(() => {
  getDoc.mockReset();
  setStoreBackendForTests(memoryBackend());
});
afterEach(() => setStoreBackendForTests(null));

describe('fetchLessonNoteFile', () => {
  it('turns a refusal by the rules into a plain message', async () => {
    getDoc.mockRejectedValue(denied());
    const error = await fetchLessonNoteFile('inst', 'note', 'file1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoteFileRefusedError);
    expect((error as Error).message).toBe('This file is for another class. Ask your teacher if you need it.');
  });

  it('leaves any other failure as it was, so it can be retried', async () => {
    const offline = Object.assign(new Error('offline'), { code: 'unavailable' });
    getDoc.mockRejectedValue(offline);
    await expect(fetchLessonNoteFile('inst', 'note', 'file1')).rejects.toBe(offline);
  });
});

describe('loadNoteFile', () => {
  it('still gives a copy saved on this device, without asking Firebase', async () => {
    const copy = new Blob(['abc']);
    await storeFile('uid', 'note', FILE, copy);
    getDoc.mockRejectedValue(denied());
    const loaded = await loadNoteFile('uid', 'inst', 'note', FILE);
    expect(await loaded.text()).toBe('abc');
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('refuses when there is no copy', async () => {
    getDoc.mockRejectedValue(denied());
    await expect(loadNoteFile('uid', 'inst', 'note', FILE)).rejects.toBeInstanceOf(NoteFileRefusedError);
  });
});

describe('classifyNoteFileFailure', () => {
  it('skips a refused or missing file, since a retry would not change it', () => {
    expect(classifyNoteFileFailure(new NoteFileRefusedError())).toBe('skip');
    expect(classifyNoteFileFailure(new BlobMissingError('gone'))).toBe('skip');
  });

  it('ends the run on a stop, and retries anything else', () => {
    expect(classifyNoteFileFailure(new BlobStoppedError('stopped'))).toBe('halt');
    expect(classifyNoteFileFailure(new Error('network'))).toBe('retry');
  });
});
