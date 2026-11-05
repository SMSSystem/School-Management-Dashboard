// Shared base64 document-upload pipeline for assignment attachments
// (see docs/miscellaneous-specs/ASSIGNMENTS_FEATURE_SPEC.md §2, §4.1, §5.1).
// Mirrors imageUpload.ts's magic-byte-sniff-then-embed shape, reusing its
// image sniffing outright, but skips the canvas resize/re-encode step
// imageUpload.ts does for photos — PDF/DOCX/PPTX aren't rasterizable, so
// there's no equivalent sanitization pass available here; the ~500KB size
// cap (ASSIGNMENTS_FEATURE_SPEC.md §3 decision 13) is this pipeline's only
// real defense against an oversized or malformed upload.

import { sniffImageType } from "./imageUpload";

export class DocumentValidationError extends Error {}

export const PDF_MIME = "application/pdf" as const;
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation" as const;

export type AttachmentMimeType =
  | typeof PDF_MIME
  | typeof DOCX_MIME
  | typeof PPTX_MIME
  | "image/jpeg"
  | "image/png"
  | "image/webp";

// ~500KB raw, per ASSIGNMENTS_FEATURE_SPEC.md §3 decision 13 — conservative
// headroom under Firestore's 1MiB per-document hard limit even after
// base64's ~4/3 inflation. This is the INLINE limit: the file is embedded in a
// Firestore document. Students' submissions always use it.
export const MAX_SOURCE_FILE_BYTES = 500 * 1024;
// Mirrors firestore.rules' isValidAttachmentDataUrl() 700,000-char cap.
const MAX_OUTPUT_CHARS = 700_000;

// The larger limit for teachers and institution admins (LARGE_ATTACHMENTS_RTDB_SPEC.md):
// a file over the inline limit is kept in the Realtime Database and Firestore
// holds only its key. Mirrors database.rules.json (size <= 5242880, dataUrl
// <= 7000000 characters).
export const MAX_BLOB_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_BLOB_OUTPUT_CHARS = 7_000_000;

/**
 * Whether a caller may upload past the inline limit:
 *  - 'none': no (students, parents, submissions); the 500KB limit applies;
 *  - 'enabled': yes, up to 5MB;
 *  - 'unconfigured': the role may, but this build has no Realtime Database URL,
 *    so a file over 500KB is refused with a clear message instead of silently
 *    falling back (spec D11).
 */
export type LargeUploadPolicy = "none" | "enabled" | "unconfigured";

export type UploadOptions = { large?: LargeUploadPolicy };

export const LARGE_FILES_UNCONFIGURED_MESSAGE =
  "Files over 500KB need the Realtime Database, which is not set up in this environment (VITE_FIREBASE_DATABASE_URL). Use a smaller file.";

/** A file size for display: "812 B", "340 KB", "4.8 MB". */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** True when a file of this size cannot be embedded and must go to the Realtime Database. */
export const needsBlobStore = (size: number): boolean =>
  size > MAX_SOURCE_FILE_BYTES;

/** The limit shown to the user for a policy, e.g. in "500KB max" helper text. */
export const uploadLimitLabel = (policy: LargeUploadPolicy = "none"): string =>
  policy === "enabled" ? "5MB" : "500KB";

/** Why a file of this size cannot be uploaded under a policy, or null when it can. */
export function uploadSizeProblem(
  size: number,
  policy: LargeUploadPolicy = "none",
): string | null {
  if (
    size <= (policy === "enabled" ? MAX_BLOB_FILE_BYTES : MAX_SOURCE_FILE_BYTES)
  )
    return null;
  return policy === "unconfigured"
    ? LARGE_FILES_UNCONFIGURED_MESSAGE
    : `File must be ${uploadLimitLabel(policy)} or smaller.`;
}

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
  if (lower.endsWith(".docx")) return DOCX_MIME;
  if (lower.endsWith(".pptx")) return PPTX_MIME;
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

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
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

export async function processDocumentUpload(
  file: File,
  options: UploadOptions = {},
): Promise<ProcessedDocument> {
  const policy = options.large ?? "none";
  const sizeProblem = uploadSizeProblem(file.size, policy);
  if (sizeProblem) throw new DocumentValidationError(sizeProblem);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffDocumentType(
    bytes.slice(0, SNIFF_BYTE_COUNT),
    file.type,
    file.name,
  );
  if (!mimeType) {
    throw new DocumentValidationError(
      "File must be a PDF, Word (.docx), PowerPoint (.pptx), JPEG, PNG, or WEBP file.",
    );
  }

  // Built from our own sniffed mimeType, not from what FileReader.readAsDataURL()
  // would infer from the browser's reported file.type — that can be empty or
  // generic for .docx/.pptx on some OS/browser combos, which would otherwise
  // produce a data URL prefix that fails firestore.rules' isValidAttachmentDataUrl()
  // even though the file itself is genuinely valid.
  const dataUrl = `data:${mimeType};base64,${bytesToBase64(bytes)}`;

  if (
    dataUrl.length >
    (needsBlobStore(file.size) ? MAX_BLOB_OUTPUT_CHARS : MAX_OUTPUT_CHARS)
  ) {
    // Should be rare at the source caps, but fail fast client-side with
    // a clear message rather than letting the rules reject it silently.
    throw new DocumentValidationError(
      "File is unexpectedly large after encoding — try a smaller file.",
    );
  }

  return { dataUrl, fileName: file.name, mimeType, size: file.size };
}
