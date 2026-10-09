import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveDataUrl } from '../downloadFile';

// The browser pieces are stubbed (the test environment is node): this checks the
// sequence, not a real download.

describe('saveDataUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('turns the data URL into a file download with the given name, then releases it', async () => {
    vi.useFakeTimers();
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const appended: unknown[] = [];
    const fetchMock = vi.fn(async () => ({ blob: async () => new Blob(['x']) }));
    const created = vi.fn(() => 'blob:abc');
    const revoked = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', {
      createElement: () => anchor,
      body: { appendChild: (n: unknown) => appended.push(n) },
    });
    vi.stubGlobal('URL', { createObjectURL: created, revokeObjectURL: revoked });

    await saveDataUrl('data:application/pdf;base64,AAAA', 'notes.pdf');

    expect(fetchMock).toHaveBeenCalledWith('data:application/pdf;base64,AAAA');
    expect(anchor.href).toBe('blob:abc');
    expect(anchor.download).toBe('notes.pdf');
    expect(appended).toEqual([anchor]);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(revoked).not.toHaveBeenCalled(); // not yet: the download keeps its own reference
    vi.advanceTimersByTime(10_000);
    expect(revoked).toHaveBeenCalledWith('blob:abc');
  });
});
