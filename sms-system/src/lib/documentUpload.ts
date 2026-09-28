// Shared base64 document-upload pipeline for assignment attachments
// (see docs/miscellaneous-specs/ASSIGNMENTS_FEATURE_SPEC.md §2, §4.1, §5.1).
// Mirrors imageUpload.ts's magic-byte-sniff-then-embed shape, reusing its
// image sniffing outright, but skips the canvas resize/re-encode step
// imageUpload.ts does for photos — PDF/DOCX/PPTX aren't rasterizable, so
// there's no equivalent sanitization pass available here; the ~500KB size
// cap (ASSIGNMENTS_FEATURE_SPEC.md §3 decision 13) is this pipeline's only
// real defense against an oversized or malformed upload.

import { sniffImageType } from './imageUpload';

export class DocumentValidationError extends Error {}

export const PDF_MIME = 'application/pdf' as const;
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const;
export const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation' as const;

export type AttachmentMimeType =
  | typeof PDF_MIME
  | typeof DOCX_MIME
  | typeof PPTX_MIME
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

// ~500KB raw, per ASSIGNMENTS_FEATURE_SPEC.md §3 decision 13 — conservative
// headroom under Firestore's 1MiB per-document hard limit even after
// base64's ~4/3 inflation.
export const MAX_SOURCE_FILE_BYTES = 500 * 1024;
// Mirrors firestore.rules' isValidAttachmentDataUrl() 700,000-char cap.
export const MAX_OUTPUT_CHARS = 700_000;
const SNIFF_BYTE_COUNT = 16; // matches imageUpload.ts's own sniff window (WEBP's marker sits at bytes 8-11)

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — DOCX/PPTX are both OOXML/ZIP archives

function matchesSignature(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

// DOCX and PPTX share the exact same ZIP magic bytes — nothing in the first
// few KB distinguishes them without actually parsing the archive's internal
// entries. The ZIP signature match already proves "this is a real archive";
// this step only picks which OOXML variant it is, checking the browser's
// own declared file.type first and falling back to the file extension for
// the OS/browser combos that report an empty or generic type for these.
function disambiguateZipEntry(
  declaredType: string,
  fileName: string,
): typeof DOCX_MIME | typeof PPTX_MIME | null {
  if (declaredType === DOCX_MIME) return DOCX_MIME;
  if (declaredType === PPTX_MIME) return PPTX_MIME;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.docx')) return DOCX_MIME;
  if (lower.endsWith('.pptx')) return PPTX_MIME;
  return null;
}

export function sniffDocumentType(
  bytes: Uint8Array,
  declaredType: string,
  fileName: string,
): AttachmentMimeType | null {
  if (matchesSignature(bytes, PDF_SIGNATURE)) return PDF_MIME;
  const image = sniffImageType(bytes);
  if (image) return image;
  if (matchesSignature(bytes, ZIP_SIGNATURE)) {
    return disambiguateZipEntry(declaredType, fileName);
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK_SIZE = 0x8000; // avoid a call-stack blowout on String.fromCharCode(...bigArray)
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

export type ProcessedDocument = {
  dataUrl: string;
  fileName: string;
  mimeType: AttachmentMimeType;
  size: number;
};

export async function processDocumentUpload(file: File): Promise<ProcessedDocument> {
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new DocumentValidationError('File must be 500KB or smaller.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffDocumentType(bytes.slice(0, SNIFF_BYTE_COUNT), file.type, file.name);
  if (!mimeType) {
    throw new DocumentValidationError(
      'File must be a PDF, Word (.docx), PowerPoint (.pptx), JPEG, PNG, or WEBP file.',
    );
  }

  // Built from our own sniffed mimeType, not from what FileReader.readAsDataURL()
  // would infer from the browser's reported file.type — that can be empty or
  // generic for .docx/.pptx on some OS/browser combos, which would otherwise
  // produce a data URL prefix that fails firestore.rules' isValidAttachmentDataUrl()
  // even though the file itself is genuinely valid.
  const dataUrl = `data:${mimeType};base64,${bytesToBase64(bytes)}`;

  if (dataUrl.length > MAX_OUTPUT_CHARS) {
    // Should be rare at the 500KB source cap, but fail fast client-side with
    // a clear message rather than letting firestore.rules reject it silently.
    throw new DocumentValidationError('File is unexpectedly large after encoding — try a smaller file.');
  }

  return { dataUrl, fileName: file.name, mimeType, size: file.size };
}
