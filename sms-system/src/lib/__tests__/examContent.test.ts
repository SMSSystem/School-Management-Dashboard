import { describe, expect, it } from 'vitest';
import sourceRaw from '../examContent.ts?raw';

// The Firestore side of the exam builder (EXAMS_FEATURE_SPEC.md §4.2, §4.3, §5.2, §5.3). These are source pins:
// the writes need the rules deployed and the emulator to run for real, so this keeps the shape of each batch.

const source = sourceRaw.split('\r\n').join('\n');
const fn = (name: string) => {
  const from = source.indexOf(`export async function ${name}`);
  expect(from, name).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', from + 10);
  return source.slice(from, next === -1 ? undefined : next);
};

describe('saveExamContent', () => {
  const save = fn('saveExamContent');

  it('writes everything in one batch with the audit entry, and refuses a finalized exam', () => {
    expect(save.match(/writeBatch\(db\)/g)).toHaveLength(1);
    expect(save.match(/await batch\.commit\(\)/g)).toHaveLength(1);
    expect(save).toContain("eventType: 'exam_edit'");
    expect(save).toContain("if (p.mode === 'read_only') throw");
  });

  it('writes the questions document only in full mode, so students who read it are not affected by a key correction', () => {
    expect(save).toContain("if (p.mode === 'full') {\n    batch.set(questionsRef");
    expect(save.match(/questionsRef\(/g)).toHaveLength(1);
    expect(save).toContain("...(p.mode === 'full' ? counts : {})");
  });

  it('stamps the server time and the author on the documents the rules check', () => {
    expect(save).toContain('updatedAt: serverTimestamp()');
    expect(save).toContain('updatedBy: p.actor.uid');
    expect(save).toContain('revision: p.questionsRevision + 1');
  });

  it('bumps the key revision through nextKeyRevision, from a comparison with the saved key', () => {
    expect(save).toContain('nextKeyRevision(p.exam.keyRevision, p.mode, !sameAnswers(p.savedAnswers, answers))');
  });

  it('puts only counts in the audit detail', () => {
    expect(save).toContain('examContentDetail(');
    expect(save).not.toMatch(/text|answers\b.*detail/);
  });
});

describe('setExamStatus', () => {
  const change = fn('setExamStatus');

  it('checks the status graph first, and counts attempts only when going back to a draft', () => {
    expect(change).toContain("p.to === 'draft' ? (await countExamAttempts(");
    expect(change).toContain('canTransition(p.exam.status, p.to,');
    expect(change.indexOf('canTransition(')).toBeLessThan(change.indexOf('writeBatch(db)'));
  });

  it('changes only the status, with an exam_publish entry, in one batch', () => {
    expect(change).toContain('{ status: p.to }');
    expect(change).toContain("eventType: 'exam_publish'");
    expect(change.match(/writeBatch\(db\)/g)).toHaveLength(1);
  });
});

describe('copyExamContent', () => {
  const copy = fn('copyExamContent');

  it('reads the source content, then writes the copy to the new exam in one batch', () => {
    expect(copy).toContain('loadExamContent(p.institutionId, p.sourceExamId)');
    expect(copy.match(/writeBatch\(db\)/g)).toHaveLength(1);
    expect(copy).toContain('p.newExamId');
    expect(copy).not.toContain('p.sourceExamId)).update');
  });

  it('starts the copy at revision 1 and keeps the counts on the new exam', () => {
    expect(copy).toContain('revision: 1');
    expect(copy).toContain('questionCount: copy.questionCount');
    expect(copy).toContain('totalPoints: copy.totalPoints');
  });
});

describe('loadExamContent and countExamAttempts', () => {
  it('reads the two documents together and counts attempts with one aggregate read', () => {
    expect(fn('loadExamContent')).toContain('Promise.all([getDoc(questionsRef');
    expect(fn('countExamAttempts')).toContain('getCountFromServer(');
  });

  it('keeps the questions and the key at the paths the rules name', () => {
    expect(source).toContain("'exams', examId, 'content', 'questions'");
    expect(source).toContain("'exams', examId, 'private', 'key'");
  });
});
