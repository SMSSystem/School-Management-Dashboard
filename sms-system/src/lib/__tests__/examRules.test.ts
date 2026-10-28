import { describe, expect, it } from 'vitest';
import rules from '../../../firestore.rules?raw';
import indexes from '../../../firestore.indexes.json';
import { EXAM_LIMITS, EXAM_ANSWER_MODES, EXAM_RELEASE_MODES, EXAM_SCORING_MODES, EXAM_STATUSES, EXAM_VALUE_TYPES } from '@/types/exams';

// The online exam rules (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §7) are tested for behaviour on the
// Firestore emulator (`npm run test:rules`, rules-tests/). This reads the rule text as well, so a change that the
// emulator suite is not run for still trips on the lines that matter, and so the rules and src/types/exams.ts keep
// the same numbers and lists.

const text = rules.split('\r\n').join('\n');
const block = (start: string, end: string) => {
  const from = text.indexOf(start);
  expect(from, start).toBeGreaterThan(-1);
  const to = text.indexOf(end, from + start.length);
  expect(to, end).toBeGreaterThan(from);
  return text.slice(from, to);
};
const listOf = (source: string, marker: string): string[] => {
  const at = source.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const open = source.indexOf('[', at);
  return [...source.slice(open, source.indexOf(']', open)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

describe('the supervision rules', () => {
  const exam = block('function isValidOnlineExam(d)', '    // A new online exam starts');

  it('let the exam carry how it is supervised, and forward only only when it is unsupervised', () => {
    expect(exam).toContain("'integrity','forwardOnly'");
    expect(exam).toContain("d.integrity in ['supervised','unsupervised']");
    expect(exam).toContain("d.get('integrity', 'supervised') == 'unsupervised'");
  });
});

describe('the picture rules', () => {
  const exam = block('function isValidOnlineExam(d)', '    // A new online exam starts');
  const pack = block('function isImagePackId(pack)', '    // The answer key: staff only');

  it('let the exam carry the pack count and bytes of its pictures, within range', () => {
    expect(exam).toContain("'imagePacks','imageBytes'");
    expect(exam).toContain('d.imagePacks >= 0 && d.imagePacks <= 100');
    expect(exam).toContain('d.imageBytes >= 0 && d.imageBytes <= 120000000');
  });

  it('name a pack document by the id images_{n}, so the wildcard never reaches the questions or another document', () => {
    expect(pack).toContain("pack.matches('images_[0-9]+')");
    const writes = pack.slice(pack.indexOf('allow create, update'));
    expect(writes.match(/isImagePackId\(pack\)/g)).toHaveLength(2); // the write and the delete
  });

  it('keep a pack to the questions’ window and the exam’s staff, in the shape the app writes, at most 100 pictures', () => {
    expect(pack).toContain("hasOnly(['revision','updatedAt','images'])");
    expect(pack).toContain('d.updatedAt == request.time');
    expect(pack).toContain('d.images.size() >= 1 && d.images.size() <= 100');
    expect(pack).toContain('examQuestionsEditable(institutionId, examId)');
    expect(pack).toContain('examStaffMay(institutionId, examId)');
  });

  it('let a student read a pack only with an attempt in progress, and staff read any document of content', () => {
    const read = pack.slice(pack.indexOf('allow read'), pack.indexOf('allow create, update'));
    expect(read).toContain('canReadAdminData()');
    expect(read).toContain('examStaffOf(examData(institutionId, examId))');
    expect(read).toMatch(/isImagePackId\(pack\)\s+&& examOpenToStudent\(examData\(institutionId, examId\)\)\s+&& examAttemptInProgress\(institutionId, examId\)/);
  });
});

describe('the picture packs and the indexes', () => {
  it('are exempt from indexing on their pictures, so each picture’s data is not indexed and stored twice', () => {
    const overrides = indexes.fieldOverrides as { collectionGroup: string; fieldPath: string; indexes: unknown[] }[];
    const images = overrides.filter((o) => o.collectionGroup === 'content' && o.fieldPath === 'images');
    expect(images).toHaveLength(1);
    expect(images[0].indexes).toEqual([]);
  });
});

describe('the activity log rules', () => {
  const start = block('function isValidAttemptStart(institutionId, examId)', 'function isValidAttemptCheckpoint()');
  const checkpoint = block('function isValidAttemptCheckpoint()', 'function isValidAttemptStaffUpdate()');
  const grade = block('function isValidExamGrade(institutionId, studentUid)', 'function isValidExamIntegritySummary(s)');
  const summary = block('function isValidExamIntegritySummary(s)', 'function isExamGradeReleaseUpdate()');

  it('lets a student save the log and answer times with a checkpoint, and start with none', () => {
    expect(start).toContain("'seed','answers','flags','tabSwitches','lastSavedAt','events','answeredAt'");
    expect(start).toContain('d.events is list && d.events.size() == 0');
    expect(checkpoint).toContain("'submitReason','events','answeredAt'");
  });

  it('caps the log and the answer times at the limits of the app, and never lets the log get shorter', () => {
    expect(checkpoint).toContain(`d.events.size() <= ${EXAM_LIMITS.maxActivityEvents}`);
    expect(checkpoint).toContain("d.events.size() >= (('events' in o) ? o.events.size() : 0)");
    expect(checkpoint).toContain(`d.answeredAt.size() <= ${EXAM_LIMITS.maxQuestions}`);
  });

  it('lets a grade carry an activity summary of the shape the app writes, with a timeline of the limit of the app', () => {
    expect(grade).toContain("'tabSwitches','submittedAt','submitReason','integrity'");
    expect(grade).toContain('isValidExamIntegritySummary(d.integrity)');
    expect(listOf(summary, 's.keys().hasOnly')).toEqual(['leaves', 'hiddenLeaves', 'awaySeconds', 'longestAwaySeconds', 'acts', 'fastAnswers', 'review', 'timeline']);
    expect(summary).toContain(`s.timeline.size() <= ${EXAM_LIMITS.maxTimelineEntries}`);
  });
});

describe('the exam document rule', () => {
  const valid = block('function isValidOnlineExam(d)', '    // A new online exam starts');

  it('uses the same value types, answer modes, statuses, scoring and release modes as the app', () => {
    expect(listOf(valid, 'd.valueType in')).toEqual([...EXAM_VALUE_TYPES]);
    expect(listOf(valid, 'd.answerMode in')).toEqual([...EXAM_ANSWER_MODES]);
    expect(listOf(valid, 'd.status in')).toEqual([...EXAM_STATUSES]);
    expect(listOf(valid, 'd.scoringMode in')).toEqual([...EXAM_SCORING_MODES]);
    expect(listOf(valid, 'd.releaseMode in')).toEqual([...EXAM_RELEASE_MODES]);
  });

  it('accepts only Multiple Choice and the app’s limits', () => {
    expect(valid).toContain("d.categoryType == 'multiple_choice'");
    expect(valid).toContain(`d.title.size() >= 1 && d.title.size() <= ${EXAM_LIMITS.titleMax}`);
    expect(valid).toContain(`d.valueTypeLabel.size() <= ${EXAM_LIMITS.otherLabelMax}`);
    expect(valid).toContain(`d.duration >= ${EXAM_LIMITS.minDurationMinutes} && d.duration <= ${EXAM_LIMITS.maxDurationMinutes}`);
    expect(valid).toContain(`d.questionCount <= ${EXAM_LIMITS.maxQuestions}`);
    expect(valid).toContain(`d.checkpointMinutes >= ${EXAM_LIMITS.minCheckpointMinutes} && d.checkpointMinutes <= ${EXAM_LIMITS.maxCheckpointMinutes}`);
    expect(valid).toContain('d.opensAt < d.closesAt');
  });

  it('starts a new online exam as a draft at key revision 1, written by the person creating it', () => {
    const fn = block('function isValidNewOnlineExam()', '    // An update of an exam.');
    expect(fn).toContain("d.status == 'draft'");
    expect(fn).toContain('d.keyRevision == 1');
    expect(fn).toContain('d.createdBy == request.auth.uid');
    expect(fn).toContain('isAdminOrAbove() || d.teacherId == request.auth.uid');
  });

  it('enforces the status graph, the frozen fields and the finalize fields on an update', () => {
    const graph = block('function examStatusMayChange(from, to)', '    // The shape of an online exam');
    expect(graph).toContain("from == 'draft' && to == 'published'");
    expect(graph).toContain("from == 'published' && (to == 'closed' || to == 'draft')");
    expect(graph).toContain("from == 'closed' && (to == 'published' || to == 'finalized')");
    expect(graph).not.toContain("from == 'finalized'");
    const update = block('function isValidExamUpdate()', '    match /institutions/{institutionId}/exams/{examId} {');
    expect(update).toContain("changed.hasAny(['institutionId','createdBy','createdByRole','createdAt'])");
    expect(update).toContain("isAdminOrAbove() || !changed.hasAny(['teacherId','departmentId'])");
    expect(update).toContain("changed.hasOnly(['releaseAt'])");
    expect(update).toContain('d.finalizedAt == request.time');
    expect(update).toContain("o.get('online', false) != true && d.get('online', false) != true");
    expect(update).toContain("o.get('keyRevision', 1)");
  });

  it('wires the create and update rules to those checks and leaves delete to administrators', () => {
    const rule = block('match /institutions/{institutionId}/exams/{examId} {', '    // The questions (no answers)');
    expect(rule).toContain('&& isValidNewOnlineExam();');
    expect(rule).toContain('&& isValidExamUpdate();');
    expect(rule).toContain('allow delete: if isAdminOrAbove() && inMyInstitution(institutionId);');
    expect(rule).toContain('allow read: if isSignedIn() && inMyInstitution(institutionId);');
  });
});

describe('who counts as exam staff', () => {
  it('is an administrator, the exam’s own teacher or a senior teacher of its department, and names no spectator helper', () => {
    const fn = block('function examStaffOf(e)', '    // The write-rule form');
    expect(fn).toContain('isAdminOrAbove()');
    expect(fn).toContain('isTeacher() && e.teacherId == request.auth.uid');
    expect(fn).toContain('isSeniorTeacherFor(e.departmentId)');
    expect(fn).not.toContain('canReadAdminData');
    expect(fn).not.toContain('isSpectator');
  });

  it('decides an administrator before reading the exam, so leftovers of a deleted exam can be cleaned up', () => {
    const fn = block('function examStaffMay(institutionId, examId)', '    // May this student read the questions?');
    expect(fn).toContain('return isAdminOrAbove() || examStaffOf(examData(institutionId, examId));');
  });
});

describe('the questions and the key', () => {
  it('lets a student read the questions only for a published online exam of their class inside the window plus two hours', () => {
    const fn = block('function examOpenToStudent(e)', '    // The status changes an exam may make.');
    expect(fn).toContain("myRole() == 'student'");
    expect(fn).toContain("e.status == 'published'");
    expect(fn).toContain('inMyClasses(e.classId)');
    expect(fn).toContain('request.time >= e.opensAt');
    expect(fn).toContain(`request.time <= e.closesAt + duration.value(${EXAM_LIMITS.questionsReadableAfterCloseMinutes}, 'm')`);
  });

  it('never lets a student or parent read the key: staff and the admin-level readers only', () => {
    const rule = block('match /institutions/{institutionId}/exams/{examId}/private/key {', 'allow create, update');
    expect(rule).toContain('canReadAdminData() || examStaffOf(examData(institutionId, examId))');
    expect(rule).not.toContain('examOpenToStudent');
    expect(rule).not.toContain("myRole() == 'student'");
    expect(rule).not.toContain('isParent');
  });

  it('keeps parents out of the questions', () => {
    const rule = block('match /institutions/{institutionId}/exams/{examId}/content/questions {', 'allow create, update');
    expect(rule).not.toContain('isParent');
  });

  it('writes both with the server time and a bounded size', () => {
    expect(block('function isValidExamQuestions()', '    match /institutions/{institutionId}/exams/{examId}/content/questions')).toContain(
      `d.items.size() <= ${EXAM_LIMITS.maxQuestions}`,
    );
    const key = block('function isValidExamKey()', '    match /institutions/{institutionId}/exams/{examId}/private/key');
    expect(key).toContain('d.updatedAt == request.time');
    expect(key).toContain('d.updatedBy == request.auth.uid');
    expect(key).toContain(`d.answers.size() <= ${EXAM_LIMITS.maxQuestions}`);
  });
});

describe('attempts', () => {
  it('start on the server clock, inside the window, with a deadline bounded by the duration, the extra time and the close', () => {
    const fn = block('function isValidAttemptStart(institutionId, examId)', '    // A student\'s save or submit');
    expect(fn).toContain('request.time >= e.opensAt');
    expect(fn).toContain('request.time <= e.closesAt');
    expect(fn).toContain('d.startedAt == request.time');
    expect(fn).toContain('d.lastSavedAt == request.time');
    expect(fn).toContain("d.deadlineAt <= request.time + duration.value(e.duration + extra, 'm')");
    expect(fn).toContain("d.deadlineAt <= e.closesAt + duration.value(extra, 'm')");
    expect(fn).toContain('d.extraMinutes == extra');
    expect(fn).toContain('d.tabSwitches == 0');
  });

  it('are saved only before the deadline plus the grace, changing only the answer fields', () => {
    const fn = block('function isValidAttemptCheckpoint()', '    // Staff on an attempt still in progress');
    expect(fn).toContain(`request.time <= o.deadlineAt + duration.value(${EXAM_LIMITS.submitGraceSeconds}, 's')`);
    expect(fn).toContain("hasOnly(['answers','flags','tabSwitches','lastSavedAt','status','submittedAt','submitReason','events','answeredAt'])");
    expect(fn).toContain('d.tabSwitches >= o.tabSwitches');
    expect(fn).toContain('d.submittedAt == request.time');
    expect(fn).toContain("d.submitReason in ['student','timeout']");
  });

  it('are expired or extended by staff only, and deleted by staff only', () => {
    const fn = block('function isValidAttemptStaffUpdate()', '    match /institutions/{institutionId}/exams/{examId}/attempts/{studentUid} {');
    expect(fn).toContain("d.submitReason == 'expired'");
    expect(fn).toContain('request.time > o.deadlineAt');
    expect(fn).toContain('d.extraMinutes <= 120');
    const rule = block('match /institutions/{institutionId}/exams/{examId}/attempts/{studentUid} {', '    // A score.');
    expect(rule).toContain('allow delete: if inMyInstitution(institutionId) && examStaffMay(institutionId, examId);');
    expect(rule).toContain('studentUid == request.auth.uid');
  });
});

describe('grades and extra time', () => {
  it('are readable by a student or linked parent only once releaseAt has passed', () => {
    const rule = block('match /institutions/{institutionId}/exams/{examId}/grades/{studentUid} {', 'allow create');
    expect(rule).toContain('resource.data.releaseAt is timestamp');
    expect(rule).toContain('resource.data.releaseAt <= request.time');
    expect(rule).toContain('student_parents/$(request.auth.uid + \'_\' + studentUid)');
  });

  it('are written by staff as themselves with the server time and a score within the maximum', () => {
    const fn = block('function isValidExamGrade(institutionId, studentUid)', '    // Releasing a score');
    expect(fn).toContain('d.score >= 0 && d.score <= d.maxScore');
    expect(fn).toContain('d.gradedBy == request.auth.uid');
    expect(fn).toContain('d.gradedAt == request.time');
  });

  it('may carry the attempt’s tab count, submit time and reason, and short notes', () => {
    const fn = block('function isValidExamGrade(institutionId, studentUid)', '    // Releasing a score');
    expect(listOf(fn, 'd.keys().hasOnly')).toEqual(expect.arrayContaining(['tabSwitches', 'submittedAt', 'submitReason']));
    expect(fn).toContain("d.submitReason in ['student','timeout','expired']");
    expect(fn).toContain('d.tabSwitches is int && d.tabSwitches >= 0');
    expect(fn).toContain('d.manualReason.size() <= 200');
    expect(fn).toContain('d.comment.size() <= 500');
    expect(block('function isExamGradeReleaseUpdate()', '    match /institutions/{institutionId}/exams/{examId}/grades/')).toContain(
      "hasOnly(['releaseAt','resultSynced'])",
    );
  });

  it('give 1 to 120 extra minutes, set by staff', () => {
    const rule = block('match /institutions/{institutionId}/exams/{examId}/accommodations/{studentUid} {', 'allow delete');
    expect(rule).toContain(`extraMinutes >= 1 && request.resource.data.extraMinutes <= ${EXAM_LIMITS.maxExtraMinutes}`);
    expect(rule).toContain('request.resource.data.addedAt == request.time');
  });
});
