import { describe, expect, it, vi } from 'vitest';
import { WRITE_TIMEOUT_MS, WriteTimeoutError, classifyAttemptWrite, raceWrite, submitFailureOutcome } from '../examAttemptLogic';
import sessionRaw from '../examAttemptSession.ts?raw';
import runningRaw from '../../hooks/useRunningAttempt.ts?raw';
import attemptHookRaw from '../../hooks/useExamAttempt.ts?raw';
import purgeRaw from '../sessionPurge.ts?raw';
import authRaw from '../AuthContext.tsx?raw';
import shellRaw from '../../components/DialogShell.tsx?raw';
import submitDialogRaw from '../../components/exam/take/SubmitDialog.tsx?raw';
import importDialogRaw from '../../components/exam/builder/ExamImportDialog.tsx?raw';

// A student's attempt when the connection is down, the exam changes under them, or the session is taken over
// (EXAMS_FEATURE_SPEC.md §4.5, §9), and the dialogs' focus.

const norm = (s: string) => s.split('\r\n').join('\n');
const session = norm(sessionRaw);
const running = norm(runningRaw);
const attemptHook = norm(attemptHookRaw);
const purge = norm(purgeRaw);
const auth = norm(authRaw);

describe('raceWrite', () => {
  it('gives the result of a write that finishes, and its error', async () => {
    await expect(raceWrite(Promise.resolve(5), 50)).resolves.toBe(5);
    await expect(raceWrite(Promise.reject(Object.assign(new Error('no'), { code: 'permission-denied' })), 50)).rejects.toThrow('no');
  });

  it('gives a timeout error when the write stays pending (offline, the database queues it and never answers), read as offline', async () => {
    vi.useFakeTimers();
    try {
      const stuck = raceWrite(new Promise(() => undefined), WRITE_TIMEOUT_MS);
      const seen = stuck.catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS + 1);
      const err = await seen;
      expect(err).toBeInstanceOf(WriteTimeoutError);
      expect(classifyAttemptWrite(err)).toBe('offline');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('submitFailureOutcome', () => {
  it('trusts the server: an attempt that is already submitted is submitted, whatever this screen saw', () => {
    for (const kind of ['too_late', 'offline', 'other'] as const) {
      expect(submitFailureOutcome({ kind, storedStatus: 'submitted', pastGrace: false })).toBe('submitted');
    }
  });

  it('calls a refusal late only when the corrected clock is past the deadline and the grace', () => {
    expect(submitFailureOutcome({ kind: 'too_late', storedStatus: 'in_progress', pastGrace: true })).toBe('late');
    expect(submitFailureOutcome({ kind: 'too_late', storedStatus: 'in_progress', pastGrace: false })).toBe('retry');
    expect(submitFailureOutcome({ kind: 'too_late', storedStatus: null, pastGrace: false })).toBe('retry');
  });

  it('lets the student try again after a lost connection or another failure', () => {
    expect(submitFailureOutcome({ kind: 'offline', storedStatus: null, pastGrace: true })).toBe('retry');
    expect(submitFailureOutcome({ kind: 'other', storedStatus: 'in_progress', pastGrace: true })).toBe('retry');
  });
});

describe('the writes and the hooks', () => {
  it('limit the start, the checkpoint and the submit with raceWrite', () => {
    expect(session.match(/await raceWrite\(/g)).toHaveLength(3);
  });

  it('check the stored attempt before telling a student they were late, keep the backup unless it is true, and save when the connection returns', () => {
    expect(running).toContain('await loadMyAttemptStatus(institutionId, examId, uid).catch(() => null)');
    expect(running).toContain('submitFailureOutcome({ kind, storedStatus: stored, pastGrace: isPastDeadline(Date.now() + offset, deadlineRef.current) })');
    expect(running).toContain('window.addEventListener("online", onOnline)');
    // the backup written after a save carries the log with it
    expect(running).toContain('writeExamDraft(uid, institutionId, examId, { ...latest.current, ...log, baseLastSavedMs: baseMs.current })');
  });

  it('read the exam and the extra time again when the attempt starts, and explain a refusal truthfully', () => {
    const begin = attemptHook.slice(attemptHook.indexOf('const begin = useCallback'));
    expect(begin).toContain('loadStudentExam(institutionId, exam.id), loadMyAccommodation(institutionId, exam.id, uid)');
    expect(begin).toContain('exam: current,');
    expect(begin).toContain('extraMinutes: currentExtra');
    expect(begin).toContain('await refusedStartMessage(institutionId, exam.id, offsetMs)');
    expect(attemptHook).toContain('Reload this page and try again');
  });
});

describe('a sign-out the person did not ask for', () => {
  it('keeps the exam backup of the same account when the session was taken over, and every other sign-out removes it', () => {
    expect(purge).toContain('export function keepExamAnswersOnNextPurge(): void {');
    expect(purge).toContain('if (!keepExamAnswers) clearAllExamDrafts();\n  keepExamAnswers = false;');
    const lost = auth.slice(auth.indexOf('function handleSessionLost()'), auth.indexOf('sessionLostRef.current = handleSessionLost'));
    expect(lost.indexOf('keepExamAnswersOnNextPurge()')).toBeGreaterThan(-1);
    expect(lost.indexOf('keepExamAnswersOnNextPurge()')).toBeLessThan(lost.indexOf('void signOut('));
    // the Sign out button and inactivity call signOut() without going through handleSessionLost
    expect(auth.match(/keepExamAnswersOnNextPurge\(\)/g)).toHaveLength(1); // only the displaced session
  });
});

describe('dialogs', () => {
  it('take the focus once, give it back, and read the close handler through a ref (no stealing focus on a parent re-render)', () => {
    for (const source of [norm(shellRaw), norm(submitDialogRaw), norm(importDialogRaw)]) {
      expect(source).toContain('const before = document.activeElement as HTMLElement | null;');
      expect(source).toContain('before?.focus?.()');
      expect(source).toMatch(/closeRef|cancelRef/);
      expect(source).not.toMatch(/\[onClose[,\]]|\[onCancel[,\]]/);
    }
  });

  it('keep Tab inside the results dialogs', () => {
    expect(norm(shellRaw)).toContain('e.key === "Tab"');
  });

  it('read a chosen file again when it is chosen twice, and ignore a slow earlier read', () => {
    const source = norm(importDialogRaw);
    expect(source).toContain('e.target.value = ""');
    expect(source).toContain('const mine = (reads.current += 1)');
    expect(source.match(/mine === reads\.current/g)).toHaveLength(3);
  });
});
