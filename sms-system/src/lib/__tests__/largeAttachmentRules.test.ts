import { describe, expect, it } from 'vitest';
import rawRules from '../../../firestore.rules?raw';

// Phase 2 of docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md (section 7):
// a lesson-note file or an assignment attachment over ~500 KiB lives in the
// Realtime Database and Firestore keeps only its blobKey. There is no rules
// emulator in this project, so this reads firestore.rules as text and pins the
// shape of the change. It cannot prove how a real write is evaluated.
// When you deliberately change these rules, update this test too.

// The working tree may use CRLF; compare as LF.
const rules = rawRules.split('\r\n').join('\n');
const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();
const flat = normalise(rules);

// Text from `start` up to (not including) the next occurrence of `end` after it.
function between(start: string, end: string): string {
  const a = rules.indexOf(start);
  expect(a, `${start} not found`).toBeGreaterThan(-1);
  const b = rules.indexOf(end, a + start.length);
  expect(b, `${end} not found after ${start}`).toBeGreaterThan(-1);
  return normalise(rules.slice(a, b));
}

const fn = (name: string) => between(`function ${name}(`, '\n    }\n');
const lessonAttachment = between(
  'match /institutions/{institutionId}/lessonNotes/{lessonNoteId}/attachment/{docId} {',
  'allow delete:',
);
const lessonValidation = fn('isValidLessonNote');
const assignmentWrite = between('&& isValidAssignmentType(request.resource.data.type)', 'allow delete: if isAdminOrAbove()');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('isValidBlobKey', () => {
  const body = fn('isValidBlobKey');

  it('accepts only a lower-case UUID string (matches the Realtime Database key rule)', () => {
    expect(body).toContain('k is string');
    expect(body).toContain(`k.matches('${UUID_RE.source}')`);
    expect(UUID_RE.test('3b1ab39c-1c4e-4f0a-9d3e-0123456789ab')).toBe(true);
    expect(UUID_RE.test('-NxYz123abcdefghij')).toBe(false);
    expect(UUID_RE.test('../x')).toBe(false);
  });

  it('is the same pattern as database.rules.json', async () => {
    const db = (await import('../../../database.rules.json?raw')).default as string;
    expect(db).toContain(UUID_RE.source);
  });
});

describe('isValidAttachmentSize', () => {
  it('is a number from 0 to 5 MiB', () => {
    expect(fn('isValidAttachmentSize')).toContain('n is number && n >= 0 && n <= 5242880');
    expect(5 * 1024 * 1024).toBe(5242880);
  });
});

describe('the inline path is unchanged', () => {
  it('still caps an inline data URL at 700,000 characters with the same MIME list', () => {
    const body = fn('isValidAttachmentDataUrl');
    expect(body).toContain('url.size() <= 700000');
    expect(body).toContain('application/pdf');
    expect(body).toContain('wordprocessingml');
    expect(body).toContain('presentationml');
    expect(body).toContain('image/(jpeg|png|webp)');
  });
});

describe('lesson note file (attachment/data)', () => {
  it('allows only the inline fields plus blobKey', () => {
    expect(lessonAttachment).toContain("request.resource.data.keys().hasOnly(['dataUrl','blobKey','fileName','mimeType','size'])");
  });

  it('still requires the name, type and a valid size', () => {
    expect(lessonAttachment).toContain('request.resource.data.fileName is string');
    expect(lessonAttachment).toContain('request.resource.data.mimeType is string');
    expect(lessonAttachment).toContain('isValidAttachmentSize(request.resource.data.size)');
  });

  it('is EITHER an inline data URL OR a blob key, never both and never neither', () => {
    expect(lessonAttachment).toContain(
      "(('dataUrl' in request.resource.data && !('blobKey' in request.resource.data) && isValidAttachmentDataUrl(request.resource.data.dataUrl))",
    );
    expect(lessonAttachment).toContain(
      "('blobKey' in request.resource.data && !('dataUrl' in request.resource.data) && isValidBlobKey(request.resource.data.blobKey))",
    );
  });

  it('keeps its existing write gates', () => {
    // one document per file: the id must be in the note's attachmentIds (legacy notes: 'data')
    expect(lessonAttachment).toContain("docId.matches('^[A-Za-z0-9-]{1,40}$')");
    expect(lessonAttachment).toContain(
      "docId in lessonNoteDataAfter(institutionId, lessonNoteId).get('attachmentIds', ['data'])",
    );
    expect(lessonAttachment).not.toContain("docId == 'data'");
    expect(lessonAttachment).toContain('lessonNoteWritableBy(lessonNoteDataAfter(institutionId, lessonNoteId))');
    expect(lessonAttachment).toContain('.hasAttachment == true');
  });

  it('allows a note with neither a file nor a link', () => {
    expect(lessonValidation).not.toContain('d.hasAttachment == true || d.resourceLinks.size() > 0');
  });

  it('accepts the new file lists only as a matching pair of at most twelve', () => {
    expect(lessonValidation).toContain("'attachments','attachmentIds',");
    expect(lessonValidation).toContain("(('attachments' in d) == ('attachmentIds' in d))");
    expect(lessonValidation).toContain('d.attachments.size() <= 12');
    expect(lessonValidation).toContain('d.attachments.size() == d.attachmentIds.size()');
  });

  it('bounds the size recorded on the note itself', () => {
    expect(lessonValidation).toContain("(!('attachmentSize' in d) || isValidAttachmentSize(d.attachmentSize))");
  });
});

describe('assignment attachment (teacher file)', () => {
  it('keeps the inline check', () => {
    expect(assignmentWrite).toContain(
      "(!('attachmentDataUrl' in request.resource.data) || isValidAttachmentDataUrl(request.resource.data.attachmentDataUrl))",
    );
  });

  it('accepts a blob key only if it is valid and no inline copy accompanies it', () => {
    expect(assignmentWrite).toContain(
      "(!('attachmentBlobKey' in request.resource.data) || (isValidBlobKey(request.resource.data.attachmentBlobKey) && !('attachmentDataUrl' in request.resource.data)))",
    );
  });

  it('bounds the recorded size', () => {
    expect(assignmentWrite).toContain(
      "(!('attachmentSize' in request.resource.data) || isValidAttachmentSize(request.resource.data.attachmentSize))",
    );
  });

  it('keeps its role and ownership gates', () => {
    expect(assignmentWrite).toContain('isAdminOrAbove() || request.resource.data.teacherId == request.auth.uid');
  });
});

describe('student submissions are out of scope (decision: stay at 500 KiB inline)', () => {
  it('no submission or attempt rule mentions a blob key', () => {
    const a = rules.indexOf('match /institutions/{institutionId}/assignments/{assignmentId}/submissions/{studentId} {');
    const b = rules.indexOf('match /institutions/{institutionId}/assignments/{assignmentId}/submissionTombstones/');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    const block = rules.slice(a, b);
    expect(block).not.toMatch(/blobKey|BlobKey/);
    expect(block).toContain('isValidAttachmentDataUrl(request.resource.data.fileDataUrl)');
  });

  it('blob keys appear only in the helper, the lesson-note file and the assignment rule', () => {
    const users = flat.split('isValidBlobKey(').length - 1;
    // helper definition + lesson-note file + assignment create/update
    expect(users).toBe(3);
  });
});
