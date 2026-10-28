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

  it('writes everything in one transaction with the audit entry, and refuses a finalized exam', () => {
    expect(save.match(/runTransaction\(db/g)).toHaveLength(1);
    expect(save).toContain("eventType: 'exam_edit'");
    expect(save).toContain("if (p.mode === 'read_only') throw");
  });

  it('writes the questions document only in full mode, so students who read it are not affected by a key correction', () => {
    expect(save).toContain("tx.set(questionsRef(p.institutionId, p.examId), {");
    expect(save.match(/questionsRef\(/g)).toHaveLength(3); // read before any picture is written, read in the transaction, then written
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

describe('saving the pictures', () => {
  const save = fn('saveExamContent');
  const at = (needle: string) => {
    const i = save.indexOf(needle);
    expect(i, needle).toBeGreaterThan(-1);
    return i;
  };

  it('plans the pictures from the packs as loaded and as edited, in full mode only, and leaves out what no question refers to', () => {
    expect(save).toContain("p.mode === 'full' && p.packs");
    expect(save).toContain('planImageSave({ before: p.packs.before, after: p.packs.after, questions,');
    expect(save).toContain('hadFields: p.exam.imagePacks !== undefined || p.exam.imageBytes !== undefined');
  });

  it('checks that nobody saved before it writes a picture, then writes the packs, then the questions, then sweeps', () => {
    const check = at('storedRevision !== p.questionsRevision) throw new ExamConflictError(CHANGED_QUESTIONS)');
    const packs = at('batch.set(packRef(p.institutionId, p.examId, n)');
    const transaction = at('await runTransaction(db');
    const sweep = at('sweep.delete(packRef(');
    expect(check).toBeLessThan(packs);
    expect(packs).toBeLessThan(transaction);
    expect(transaction).toBeLessThan(sweep);
  });

  it('writes the packs a few to a commit, each with a revision that goes up and the server time, and reports progress', () => {
    expect(save).toContain('for (const group of images.commits)');
    expect(save).toContain('revision: (p.packs.before[n]?.revision ?? 0) + 1');
    expect(save).toContain('updatedAt: serverTimestamp()');
    expect(save).toContain('p.onProgress?.(done, images.write.length)');
  });

  it('puts the pack count and bytes on the exam only when the plan gives them, so an exam without pictures saves as before', () => {
    expect(save).toContain('...(images?.examFields ?? {})');
  });

  it('does not make the save fail when only the sweep fails, because the next save does it again', () => {
    expect(save).toContain('await sweep.commit().catch(() => undefined)');
  });

  it('repeats the revision checks inside the transaction with the same messages', () => {
    expect(save).toContain('throw new ExamConflictError(CHANGED_KEY)');
    expect(save).toContain('throw new ExamConflictError(CHANGED_QUESTIONS)');
    expect(source.match(/const CHANGED_(KEY|QUESTIONS) =/g)).toHaveLength(2);
  });
});

describe('loadExamPacks', () => {
  const load = fn('loadExamPacks');

  it('lists only the documents whose id starts with images_, with one query, and keeps each revision', () => {
    expect(load).toContain("where(documentId(), '>=', 'images_'), where(documentId(), '<', 'images`')");
    expect(load.match(/getDocs\(/g)).toHaveLength(1);
    expect(load).toContain('packNumberOf(d.id)');
    expect(load).toContain('revision:');
  });

  it('is not part of loadExamContent, which the results screen uses and which must not download the pictures', () => {
    expect(fn('loadExamContent')).not.toContain('Packs');
    expect(fn('loadExamContent')).not.toContain('getDocs');
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

  it('reads the source content and pictures, writes the pictures, then writes the copy to the new exam in one batch', () => {
    expect(copy).toContain('loadExamContent(p.institutionId, p.sourceExamId), loadExamPacks(p.institutionId, p.sourceExamId)');
    expect(copy.match(/writeBatch\(db\)/g)).toHaveLength(2); // the pictures in groups (the same line, in the loop), then the questions
    expect(copy.indexOf('picturesBatch.commit()')).toBeLessThan(copy.indexOf('batch.set(questionsRef'));
    expect(copy).toContain('p.newExamId');
    expect(copy).not.toContain('p.sourceExamId)).update');
  });

  it('starts the copy at revision 1 and keeps the counts on the new exam', () => {
    expect(copy).toContain('revision: 1');
    expect(copy).toContain('questionCount: copy.questionCount');
    expect(copy).toContain('totalPoints: copy.totalPoints');
  });

  it('copies only the pictures the copied questions refer to, in the same packs under the same ids, at revision 1', () => {
    expect(copy).toContain('withoutOrphans(sourcePacks, referencesOf(copy.questions))');
    expect(copy).toContain('packCommits(Object.keys(packs).map(Number), packs)');
    expect(copy).toContain('{ revision: 1, updatedAt: serverTimestamp(), images: packs[n].images }');
    expect(copy).toContain('...(stats.count > 0 && { imagePacks: stats.count, imageBytes: stats.bytes })');
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
