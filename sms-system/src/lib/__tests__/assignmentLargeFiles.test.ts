import { describe, expect, it } from 'vitest';
import { assignmentFormSource as formRaw } from './assignmentFormSource';
import { formModalSource as modalRaw } from './formModalSource';
import attachmentRaw from '../../components/AssignmentAttachment.tsx?raw';
import { assignmentDetailSource as detailRaw } from './assignmentDetailSource';
import submissionsRaw from '../submissions.ts?raw';

// Phase 5 of docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md: the
// assignment form, the delete flow and the attachment on the assignment page use
// the large-file store; student submissions do not. There is no component test
// harness here, so this reads the sources as text and pins the order of
// operations the design depends on. It cannot prove a real upload.

const lf = (s: string) => s.split('\r\n').join('\n');
const form = lf(formRaw);
const modal = lf(modalRaw);
const attachment = lf(attachmentRaw);
const detail = lf(detailRaw);
const submissions = lf(submissionsRaw);

const at = (src: string, needle: string): number => {
  const i = src.indexOf(needle);
  expect(i, `${needle} not found`).toBeGreaterThan(-1);
  return i;
};

describe('AssignmentForm', () => {
  it('lets only teacher and admin roles go past 500KB (policy from the role)', () => {
    expect(form).toContain('const uploadPolicy = largeUploadPolicy(role);');
    expect(form).toContain('processDocumentUpload(file, { large: uploadPolicy })');
  });

  it('shows the real limit and readable sizes', () => {
    expect(form).toContain('{uploadLimitLabel(uploadPolicy)} max.');
    expect(form).toContain('formatFileSize(attachment.size)');
    expect(form).not.toContain('Math.round(attachment.size / 1024)');
  });

  it('knows whether the file was changed here, so a kept large file is never re-uploaded', () => {
    expect(form).toContain('const [attachmentChanged, setAttachmentChanged] = useState(false);');
    expect((form.match(/setAttachmentChanged\(true\)/g) ?? []).length).toBe(2); // chosen + removed
    expect(form).toContain('attachmentChanged ? attachment : null,');
  });

  it('reads an existing large file as its key, not a body', () => {
    expect(form).toContain('const blobKey = data?.attachmentBlobKey as string | undefined;');
    expect(form).toContain('if (blobKey) return { dataUrl: "", blobKey, ...meta };');
  });

  it('writes the attachment fields only at save time, through assignmentAttachmentFields', () => {
    expect(form).toContain('assignmentAttachmentFields(attachment, blobKey, type === "update")');
    expect(form).not.toContain('optionalFields.attachmentDataUrl');
    expect(form).not.toContain('optionalFields.attachmentSize');
  });

  it('uploads before the save and removes the old file only after it', () => {
    const save = at(form, 'await commitWithBlob(');
    const addDocAt = at(form, 'await addDoc(');
    const updateDocAt = at(form, 'await updateDoc(');
    const removeOld = at(form, 'void deleteBlob(institutionId, oldBlobKey)');
    expect(save).toBeLessThan(addDocAt);
    expect(save).toBeLessThan(updateDocAt);
    expect(updateDocAt).toBeLessThan(removeOld);
    expect(removeOld).toBeLessThan(at(form, 'onClose?.();'));
    // the old key is taken from the assignment's own data (no extra read), and only when the file changed
    expect(form).toContain('type === "update" && attachmentChanged');
    expect(form).toContain('data?.attachmentBlobKey as string | undefined');
  });

  it('tells the user to wait while the file is sent', () => {
    expect(form).toContain('Uploading the file… keep this window open until it finishes.');
    expect(form).toContain('{uploading ? "Uploading file…"');
  });
});

describe('deleting an assignment (FormModal)', () => {
  const block = (() => {
    const a = modal.indexOf('if (table === "assignment") {');
    expect(a).toBeGreaterThan(-1);
    return modal.slice(a, modal.indexOf('const ref = FLAT_TABLES', a));
  })();

  it('reads the large file key first, deletes the assignment, then the file', () => {
    const read = block.indexOf('await existingAssignmentBlobKey(institutionId, id)');
    const del = block.indexOf('await deleteDoc(');
    const remove = block.indexOf('void deleteBlob(institutionId, blobKey)');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(del);
    expect(del).toBeLessThan(remove);
  });
});

describe('the attachment on the assignment page', () => {
  it('the page uses the shared component and no longer links the body directly', () => {
    expect(detail).toContain('<AssignmentAttachment assignment={assignment} institutionId={institutionId} />');
    expect(detail).not.toContain('href={assignment.attachmentDataUrl}');
  });

  it('a large file is fetched by key only when Download is clicked', () => {
    expect(attachment).toContain('assignment.attachmentBlobKey ? (');
    expect(attachment).toContain('onClick={downloadLarge}');
    expect(attachment).toContain('getBlobDataUrl(institutionId, assignment.attachmentBlobKey)');
    expect(attachment).not.toMatch(/useEffect|useQuery/);
  });

  it('a small file still downloads straight from the embedded body', () => {
    expect(attachment).toContain('<a href={assignment.attachmentDataUrl} download={fileName}');
  });
});

describe('student submissions stay inline (decision: 500KB, no Realtime Database)', () => {
  it('submissions.ts uses the default 500KB policy and never the blob store', () => {
    expect(submissions).toContain('processDocumentUpload(file)');
    expect(submissions).not.toMatch(/large:|blobStore|putBlob|commitWithBlob|BlobKey/);
  });
});
