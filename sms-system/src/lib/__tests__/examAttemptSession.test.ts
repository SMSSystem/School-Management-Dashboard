import { describe, expect, it } from 'vitest';
import sourceRaw from '../examAttemptSession.ts?raw';

// The Firestore side of a student's attempt (EXAMS_FEATURE_SPEC.md §4.5, §5.4). The writes themselves are checked
// against the real rules in rules-tests/examAttemptClient.rules.test.ts; these pins keep the shape of each call.

const source = sourceRaw.split('\r\n').join('\n');
const fn = (name: string) => {
  const from = source.indexOf(`export async function ${name}`);
  expect(from, name).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', from + 10);
  return source.slice(from, next === -1 ? undefined : next);
};

describe('the server clock', () => {
  const offset = fn('fetchServerOffset');

  it('reads the Realtime Database offset only when the session-lock database is in use, and gives up after a timeout', () => {
    expect(offset).toContain("if (!SINGLE_SESSION_ENABLED || !databaseUrl) return null");
    expect(offset).toContain("'.info/serverTimeOffset'");
    expect(offset).toContain('setTimeout(');
    expect(offset).toContain('cleanOffset(snap.val())');
  });

  it('never throws: a failure is "no offset"', () => {
    expect(offset).toMatch(/catch \{\s+return null;/);
  });
});

describe('startAttempt', () => {
  const start = fn('startAttempt');

  it('works out the deadline from the server time first and refuses a start with under 30 seconds left', () => {
    expect(start).toContain('startDeadlineMs({');
    expect(start).toContain('throw new NoTimeToStartError()');
    expect(start.indexOf('hasTimeToStart(')).toBeLessThan(start.indexOf('await setDoc('));
  });

  it('writes the exact fields of a new attempt with the server time for the start and the first save', () => {
    expect(start).toContain('newAttemptFields({');
    expect(start).toContain('startedAt: serverTimestamp()');
    expect(start).toContain('lastSavedAt: serverTimestamp()');
    expect(start).toContain('Timestamp.fromMillis(deadlineMs)');
    expect(start).toContain('makeAttemptOrder(p.questions, exam.shuffle !== false)');
  });

  it('creates the document once and reads it back from the server for the real start time', () => {
    expect(start.match(/await setDoc\(/g)).toHaveLength(1);
    expect(start).toContain('getDocFromServer(ref)');
  });
});

describe('saving and submitting', () => {
  it('a checkpoint and a submit are single updates using the shared field builders and the server time', () => {
    const save = fn('saveCheckpoint');
    expect(save).toContain('checkpointFields({ ...p, lastSavedAt: serverTimestamp() })');
    expect(save.match(/await updateDoc\(/g)).toHaveLength(1);
    const submit = fn('submitAttempt');
    expect(submit).toContain('submitFields({ ...p, serverTime: serverTimestamp() })');
    expect(submit.match(/await updateDoc\(/g)).toHaveLength(1);
  });
});

describe('reading', () => {
  it('takes a refused grade read to mean nothing is released yet, and rethrows anything else', () => {
    const grade = fn('loadGrade');
    expect(grade).toContain("errorCode(err) === 'permission-denied') return null");
    expect(grade).toContain('throw err');
  });

  it('reads the student’s own attempt, accommodation and the questions by path, with no query or listener', () => {
    expect(source).not.toMatch(/onSnapshot|getDocs|query\(/);
    expect(source).toContain("'accommodations', uid");
    expect(source).toContain("'content', 'questions'");
    expect(source).toContain("'attempts', uid");
  });
});
