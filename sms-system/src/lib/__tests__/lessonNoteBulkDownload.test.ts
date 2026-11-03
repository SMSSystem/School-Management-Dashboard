import { describe, expect, it, vi } from 'vitest';
import {
  SEQUENTIAL_GAP_MS,
  downloadAllButton,
  remainingFiles,
  startDownloadRun,
  zipEntryNames,
  zipFileName,
  type BulkFile,
  type FailureKind,
  type RunDeps,
  type RunState,
} from '../lessonNoteBulkDownload';

const file = (id: string): BulkFile => ({ id, fileName: `${id}.pdf`, size: 10 });
const THREE = ['a', 'b', 'c'].map(file);
const blob = new Blob(['x']);

describe('downloadAllButton', () => {
  const base = { files: THREE, downloaded: {}, clicked: false, allStored: false };

  it('offers nothing for fewer than two files', () => {
    expect(downloadAllButton({ ...base, files: [file('a')] })).toEqual({ kind: 'none' });
  });

  it('offers Download all before anything has happened', () => {
    expect(downloadAllButton(base)).toEqual({ kind: 'all' });
  });

  it('offers only what is missing once some are downloaded, by a run or one by one', () => {
    expect(downloadAllButton({ ...base, downloaded: { a: true } })).toEqual({ kind: 'remaining', count: 2 });
  });

  it('never offers Download all again once pressed, even if nothing finished', () => {
    expect(downloadAllButton({ ...base, clicked: true })).toEqual({ kind: 'remaining', count: 3 });
  });

  it('is complete when every file is downloaded, with Save again only if the copies are here', () => {
    const downloaded = { a: true, b: true, c: true } as const;
    expect(downloadAllButton({ ...base, downloaded })).toEqual({ kind: 'complete', canSaveAgain: false });
    expect(downloadAllButton({ ...base, downloaded, allStored: true })).toEqual({ kind: 'complete', canSaveAgain: true });
  });

  it('treats a file a teacher adds later as remaining, and drops a removed one', () => {
    expect(remainingFiles([...THREE, file('new')], { a: true, b: true, c: true }).map((f) => f.id)).toEqual(['new']);
    expect(downloadAllButton({ ...base, files: THREE.slice(0, 2), downloaded: { a: true, b: true, gone: true } })).toMatchObject({
      kind: 'complete',
    });
  });
});

describe('file names', () => {
  it('removes path characters, so an entry cannot escape its folder', () => {
    const [name] = zipEntryNames([{ fileName: '../../evil.pdf' }]);
    expect(name).not.toMatch(/[/\\]/);
    expect(zipEntryNames([{ fileName: 'a\\b:c.pdf' }])[0]).toBe('a_b_c.pdf');
  });

  it('renames duplicates, ignoring case', () => {
    expect(zipEntryNames([{ fileName: 'notes.pdf' }, { fileName: 'Notes.pdf' }, { fileName: 'notes.pdf' }])).toEqual([
      'notes.pdf',
      'Notes (2).pdf',
      'notes (3).pdf',
    ]);
  });

  it('never leaves a name empty', () => {
    expect(zipEntryNames([{ fileName: '///' }])[0]).toBe('___');
    expect(zipEntryNames([{ fileName: '' }])[0]).toBe('file');
    expect(zipFileName('')).toBe('lesson-note.zip');
  });

  it('builds the zip name from the note name', () => {
    expect(zipFileName('Unit 1: Forces')).toBe('Unit 1_ Forces.zip');
  });
});

function harness(files: BulkFile[], overrides: Partial<RunDeps<BulkFile>> = {}) {
  const states: RunState[] = [];
  const saved: string[] = [];
  const fetched: string[] = [];
  const sleeps: number[] = [];
  const deps: RunDeps<BulkFile> = {
    mode: 'sequential',
    fetchFile: async (f) => {
      fetched.push(f.id);
      return blob;
    },
    saveFile: async (f) => {
      saved.push(f.id);
    },
    classify: (): FailureKind => 'retry',
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    onState: (s) => states.push(s),
    ...overrides,
  };
  const run = startDownloadRun(files, deps);
  return { run, states, saved, fetched, sleeps, last: () => states[states.length - 1] };
}

describe('a sequential run', () => {
  it('saves every file in order, with a gap between them but not after the last', async () => {
    const h = harness(THREE);
    await h.run.finished;
    expect(h.saved).toEqual(['a', 'b', 'c']);
    expect(h.sleeps).toEqual([SEQUENTIAL_GAP_MS, SEQUENTIAL_GAP_MS]);
    expect(h.last()).toMatchObject({ phase: 'finished', processed: 3, total: 3, current: null, failed: [] });
  });

  it('names the file it is working on', async () => {
    const h = harness(THREE);
    await h.run.finished;
    expect(h.states.map((s) => s.current)).toContain('b.pdf');
  });

  it('stops before the next file, and reports stopped', async () => {
    const h = harness(THREE, {
      saveFile: async (f) => {
        if (f.id === 'a') h2.run.stop();
      },
    });
    const h2 = h;
    await h.run.finished;
    expect(h.fetched).toEqual(['a']);
    expect(h.last().phase).toBe('stopped');
    expect(h.last().processed).toBe(1);
  });

  it('pause finishes the current file and waits, then Download next does one more', async () => {
    let afterA: () => void = () => undefined;
    const reachedA = new Promise<void>((resolve) => {
      afterA = resolve;
    });
    const h = harness(THREE, {
      saveFile: async (f) => {
        if (f.id === 'a') {
          h.run.pause();
          afterA();
        }
      },
    });
    await reachedA;
    await vi.waitFor(() => expect(h.last().phase).toBe('paused'));
    expect(h.fetched).toEqual(['a']);

    h.run.next();
    await vi.waitFor(() => expect(h.fetched).toEqual(['a', 'b']));
    await vi.waitFor(() => expect(h.last().phase).toBe('paused'));
    expect(h.last().processed).toBe(2);

    h.run.resume();
    await h.run.finished;
    expect(h.fetched).toEqual(['a', 'b', 'c']);
    expect(h.last().phase).toBe('finished');
  });

  it('stop while paused ends the run', async () => {
    const h = harness(THREE, {
      saveFile: async () => {
        h.run.pause();
      },
    });
    await vi.waitFor(() => expect(h.last().phase).toBe('paused'));
    h.run.stop();
    await h.run.finished;
    expect(h.fetched).toEqual(['a']);
    expect(h.last().phase).toBe('stopped');
  });
});

describe('when a file fails', () => {
  const failing = (ids: string[], counts: Record<string, number> = {}) => async (f: BulkFile) => {
    counts[f.id] = (counts[f.id] ?? 0) + 1;
    if (ids.includes(f.id)) throw new Error(`no ${f.id}`);
    return blob;
  };

  it('retries a network failure once, then skips it, names it and carries on', async () => {
    const counts: Record<string, number> = {};
    const h = harness(THREE, { fetchFile: failing(['b'], counts), classify: () => 'retry' });
    await h.run.finished;
    expect(counts.b).toBe(2);
    expect(h.saved).toEqual(['a', 'c']);
    expect(h.last().failed.map((x) => [x.file.id, x.reason])).toEqual([['b', 'no b']]);
    expect(h.last()).toMatchObject({ phase: 'finished', processed: 3 });
  });

  it('succeeds when the retry works', async () => {
    let tries = 0;
    const h = harness([file('a')], {
      fetchFile: async () => {
        if (tries++ === 0) throw new Error('blip');
        return blob;
      },
    });
    await h.run.finished;
    expect(h.saved).toEqual(['a']);
    expect(h.last().failed).toEqual([]);
  });

  it('does not retry a file that no longer exists', async () => {
    const counts: Record<string, number> = {};
    const h = harness(THREE, { fetchFile: failing(['a'], counts), classify: () => 'skip' });
    await h.run.finished;
    expect(counts.a).toBe(1);
    expect(h.last().failed).toHaveLength(1);
    expect(h.saved).toEqual(['b', 'c']);
  });

  it('ends the whole run on a limit or a pause set by the owner', async () => {
    const h = harness(THREE, {
      fetchFile: failing(['b']),
      classify: () => 'halt',
    });
    await h.run.finished;
    expect(h.saved).toEqual(['a']);
    expect(h.fetched).toEqual([]);
    expect(h.last()).toMatchObject({ phase: 'stopped', haltMessage: 'no b' });
  });
});

describe('a collecting run, for the zip', () => {
  it('has no gaps and saves nothing itself', async () => {
    const done: string[] = [];
    const h = harness(THREE, { mode: 'collect', saveFile: undefined, onFileDone: (f) => done.push(f.id) });
    await h.run.finished;
    expect(done).toEqual(['a', 'b', 'c']);
    expect(h.saved).toEqual([]);
    expect(h.sleeps).toEqual([]);
  });
});
