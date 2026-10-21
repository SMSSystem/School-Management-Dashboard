import { describe, expect, it } from 'vitest';
import gradingRaw from '../examGrading.ts?raw';
import dataRaw from '../examResultsData.ts?raw';

// The Firestore side of the staff results screen (EXAMS_FEATURE_SPEC.md §6, §9). The documents themselves are checked
// against the real rules in rules-tests/examGradingClient.rules.test.ts; these pins keep the shape of each operation.

const grading = gradingRaw.split('\r\n').join('\n');
const data = dataRaw.split('\r\n').join('\n');
const fn = (source: string, name: string) => {
  const from = source.indexOf(`export async function ${name}`);
  expect(from, name).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', from + 10);
  return source.slice(from, next === -1 ? undefined : next);
};

describe('batches', () => {
  it('put at most 200 students (two writes each) in a batch and 450 deletes, well inside the 500-operation limit', () => {
    expect(grading).toContain('const STUDENTS_PER_BATCH = 200');
    expect(grading).toContain('const DELETES_PER_BATCH = 450');
  });

  it('never write an undefined field', () => {
    expect(grading).not.toContain('undefined');
  });
});

describe('gradeAttempts', () => {
  const run = fn(grading, 'gradeAttempts');

  it('plans from the attempts and grades, marks lapsed attempts expired first, then grades, with one audit entry in the last batch', () => {
    expect(run).toContain('planGrading({ attempts, grades: data.grades, keyRevision, nowMs })');
    expect(run.indexOf("submitReason: 'expired'")).toBeLessThan(run.indexOf('autoGradeFields('));
    expect(run).toContain('if (index === parts.length - 1)');
    expect(run.match(/addAudit\(batch, c, 'exam_grade'/g)).toHaveLength(1);
  });

  it('writes the results entry in the same batch only for a score that is already readable, updating one that was synced', () => {
    expect(run).toContain('if (out.releasedNow) addResult(batch, c,');
    expect(run).toContain('prior?.resultSynced === true');
  });

  it('reuses the attempts the screen already read, and reads them only when it has none', () => {
    expect(run).toContain('data.attempts ?? (await loadAttempts(');
  });
});

describe('manual scores and re-grades', () => {
  it('a manual score is checked by manualGradeFields before anything is written, and audited as entered or overridden', () => {
    const save = fn(grading, 'saveManualGrade');
    expect(save.indexOf('manualGradeFields(')).toBeLessThan(save.indexOf('writeBatch(db)'));
    expect(save).toContain('if (!out.ok) throw new Error(out.error)');
    expect(save).toContain("kind: prior ? 'override' : 'manual'");
  });

  it('a re-grade reads the one attempt and refuses a student who has not submitted', () => {
    const re = fn(grading, 'regradeStudent');
    expect(re).toContain('getDoc(attemptRef(c, p.studentId))');
    expect(re).toContain("attempt.status !== 'submitted'");
  });
});

describe('release and sync', () => {
  it('Release gives each unreleased score the server time and writes its results entry in the same batch', () => {
    const release = fn(grading, 'releaseGrades');
    expect(release).toContain('{ releaseAt: serverTimestamp(), resultSynced: true }');
    expect(release).toContain('addResult(batch, c, g, g.score, g.maxScore, g.resultSynced)');
    expect(release).toContain("'exam_release'");
  });

  it('sync copies only scores that are released and not yet in the results', () => {
    const sync = fn(grading, 'syncResults');
    expect(sync).toContain('resultsToSync(data.grades, Date.now())');
    expect(sync).toContain('{ resultSynced: true }');
  });
});

describe('extra time', () => {
  it('writes the accommodation, and the running attempt’s longer deadline, in one batch from the plan', () => {
    const extra = fn(grading, 'addExtraTime');
    expect(extra).toContain('extraTimePlan({');
    expect(extra).toContain('if (!plan.ok) throw new Error(plan.error)');
    expect(extra.match(/writeBatch\(db\)/g)).toHaveLength(1);
    expect(extra).toContain('addedAt: serverTimestamp()');
    expect(extra).toContain('if (plan.attempt)');
  });
});

describe('finalizeExam', () => {
  const finalize = fn(grading, 'finalizeExam');

  it('refuses an exam that has not closed, and any blocker, before writing anything', () => {
    expect(finalize).toContain("phase !== 'closed'");
    expect(finalize).toContain('finalizeBlockers({');
    expect(finalize.indexOf('finalizeBlockers(')).toBeLessThan(finalize.indexOf('writeBatch(db)'));
    expect(finalize).toContain('throw new FinalizeBlockedError(');
  });

  it('closes a published exam first (the rules only allow closed to finalized), then writes the exam before deleting the attempts', () => {
    expect(finalize).toContain("if (c.exam.status === 'published') await updateDoc(examRef(c), { status: 'closed' })");
    expect(finalize.indexOf("status: 'finalized'")).toBeLessThan(finalize.indexOf('deleteAttempts('));
    expect(finalize).toContain("finalizedAt: serverTimestamp(), questionStats: stats");
    expect(finalize).toContain("'exam_finalize'");
  });

  it('counts the per-question results before the attempts go', () => {
    expect(finalize.indexOf('questionStatsFrom(')).toBeLessThan(finalize.indexOf('deleteAttempts('));
  });

  it('can finish the clean-up of leftover attempts', () => {
    expect(fn(grading, 'cleanupAttempts')).toContain('deleteAttempts(c, await loadAttempts(');
  });
});

describe('loadResultsData', () => {
  const load = fn(data, 'loadResultsData');

  it('reads the grades, the extra times and a count of the attempts, and the attempts only when the grades do not account for them', () => {
    expect(load).toContain('getCountFromServer(attemptsRef)');
    expect(load).toContain('needsAttemptRead({');
    expect(load).toContain("exam.status !== 'finalized'");
  });

  it('reads the roster as the class’s students who take the subject', () => {
    const roster = fn(data, 'loadRoster');
    expect(roster).toContain("where('classIds', 'array-contains', classId)");
    expect(roster).toContain('takesSubject(');
  });
});
