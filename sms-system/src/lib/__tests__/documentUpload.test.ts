import { describe, it, expect } from 'vitest';
import {
  sniffDocumentType,
  processDocumentUpload,
  DocumentValidationError,
  MAX_SOURCE_FILE_BYTES,
  PDF_MIME,
  DOCX_MIME,
  PPTX_MIME,
} from '../documentUpload';

// Unlike imageUpload.ts's processPhotoUpload, processDocumentUpload has no
// canvas/Image decode step (documentUpload.ts's own header comment: "skips
// the canvas resize/re-encode step imageUpload.ts does for photos" — PDF/
// DOCX/PPTX aren't rasterizable). So, unlike imageUpload.test.ts, the full
// success path is testable here too, not just the rejection paths.

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 rest of a fake pdf body');

function zipBytes(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(16);
  bytes.set([0x50, 0x4b, 0x03, 0x04], 0); // "PK\x03\x04"
  return bytes;
}

// ─── sniffDocumentType ───────────────────────────────────────────────────

describe('sniffDocumentType', () => {
  it('identifies a PDF signature regardless of declared type/filename', () => {
    expect(sniffDocumentType(PDF_BYTES, 'application/octet-stream', 'whatever.bin')).toBe(PDF_MIME);
  });

  it('delegates to image sniffing for a JPEG signature', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffDocumentType(jpeg, 'image/jpeg', 'photo.jpg')).toBe('image/jpeg');
  });

  it('disambiguates DOCX from the declared MIME type', () => {
    expect(sniffDocumentType(zipBytes(), DOCX_MIME, 'report.docx')).toBe(DOCX_MIME);
  });

  it('disambiguates PPTX from the declared MIME type', () => {
    expect(sniffDocumentType(zipBytes(), PPTX_MIME, 'slides.pptx')).toBe(PPTX_MIME);
  });

  it('falls back to the .docx extension when the browser reports a generic/empty type', () => {
    expect(sniffDocumentType(zipBytes(), '', 'report.docx')).toBe(DOCX_MIME);
    expect(sniffDocumentType(zipBytes(), 'application/octet-stream', 'REPORT.DOCX')).toBe(DOCX_MIME);
  });

  it('falls back to the .pptx extension when the browser reports a generic/empty type', () => {
    expect(sniffDocumentType(zipBytes(), '', 'slides.pptx')).toBe(PPTX_MIME);
  });

  it('returns null for a ZIP file that is neither declared nor named as docx/pptx', () => {
    expect(sniffDocumentType(zipBytes(), 'application/zip', 'archive.zip')).toBeNull();
  });

  it('returns null for unrecognized bytes', () => {
    expect(sniffDocumentType(new Uint8Array([0x00, 0x01, 0x02, 0x03]), '', 'mystery')).toBeNull();
  });
});

// ─── processDocumentUpload ───────────────────────────────────────────────

describe('processDocumentUpload', () => {
  it('rejects a file larger than MAX_SOURCE_FILE_BYTES before sniffing', async () => {
    const oversized = new File([new Uint8Array(MAX_SOURCE_FILE_BYTES + 1)], 'big.pdf', {
      type: 'application/pdf',
    });
    await expect(processDocumentUpload(oversized)).rejects.toBeInstanceOf(DocumentValidationError);
  });

  it('rejects a file whose bytes match no whitelisted signature', async () => {
    const bogus = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], 'fake.pdf', {
      type: 'application/pdf',
    });
    await expect(processDocumentUpload(bogus)).rejects.toBeInstanceOf(DocumentValidationError);
  });

  it('rejects a ZIP-signature file that cannot be disambiguated as docx or pptx', async () => {
    const archive = new File([zipBytes()], 'archive.zip', { type: 'application/zip' });
    await expect(processDocumentUpload(archive)).rejects.toBeInstanceOf(DocumentValidationError);
  });

  it('accepts a real PDF and returns a correctly-shaped data URL', async () => {
    const file = new File([PDF_BYTES], 'assignment.pdf', { type: 'application/pdf' });
    const result = await processDocumentUpload(file);
    expect(result.mimeType).toBe(PDF_MIME);
    expect(result.fileName).toBe('assignment.pdf');
    expect(result.size).toBe(PDF_BYTES.length);
    expect(result.dataUrl.startsWith(`data:${PDF_MIME};base64,`)).toBe(true);
  });

  it('accepts a DOCX and returns a correctly-shaped data URL', async () => {
    const file = new File([zipBytes()], 'report.docx', { type: DOCX_MIME });
    const result = await processDocumentUpload(file);
    expect(result.mimeType).toBe(DOCX_MIME);
    expect(result.dataUrl.startsWith(`data:${DOCX_MIME};base64,`)).toBe(true);
  });

  it('accepts a PPTX resolved purely via the filename fallback (empty declared type)', async () => {
    const file = new File([zipBytes()], 'slides.pptx', { type: '' });
    const result = await processDocumentUpload(file);
    expect(result.mimeType).toBe(PPTX_MIME);
    expect(result.dataUrl.startsWith(`data:${PPTX_MIME};base64,`)).toBe(true);
  });
});
