// Shared base64 image-upload pipeline for the photo-upload feature
// (see docs/miscellaneous-specs/PHOTO_UPLOAD_SPEC.md). Used identically by
// StudentForm.tsx, TeacherForm.tsx, AdminCreateUserForm.tsx, and the public
// registration form — replaces what would otherwise be a third/fourth copy
// of institution-profile/index.tsx's and BrandForm.tsx's near-identical
// local `processImage` functions.

export class PhotoValidationError extends Error {}

// Only these 4 formats are accepted, per PHOTO_UPLOAD_SPEC.md's Design
// Decisions. Each signature is checked against the first bytes of the file;
// WEBP additionally requires the "WEBP" marker at bytes 8-11 since the
// leading 4 bytes ("RIFF") aren't specific to WEBP on their own.
const IMAGE_SIGNATURES: { mime: 'image/jpeg' | 'image/png' | 'image/webp'; bytes: number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"
];

const WEBP_MARKER_OFFSET = 8;
const WEBP_MARKER = 'WEBP';
const SNIFF_BYTE_COUNT = 16;

export const MAX_SOURCE_FILE_BYTES = 5 * 1024 * 1024; // 5MB — rejected before ever attempting to decode
const MAX_OUTPUT_CHARS = 60_000; // mirrors the Firestore rules cap in PHOTO_UPLOAD_SPEC.md
const DEFAULT_MAX_PX = 180;

// Pure — takes raw bytes rather than a File, so this (the actual detection
// logic) is unit-testable without any File/Blob machinery.
export function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  for (const { mime, bytes: signature } of IMAGE_SIGNATURES) {
    if (signature.every((byte, i) => bytes[i] === byte)) {
      if (mime === 'image/webp') {
        const marker = String.fromCharCode(
          bytes[WEBP_MARKER_OFFSET] ?? 0,
          bytes[WEBP_MARKER_OFFSET + 1] ?? 0,
          bytes[WEBP_MARKER_OFFSET + 2] ?? 0,
          bytes[WEBP_MARKER_OFFSET + 3] ?? 0,
        );
        if (marker !== WEBP_MARKER) continue;
      }
      return mime;
    }
  }
  return null;
}

async function sniffFileType(file: File): Promise<'image/jpeg' | 'image/png' | 'image/webp' | null> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTE_COUNT).arrayBuffer());
  return sniffImageType(head);
}

// Decodes `file` via the browser's own image decoder (canvas), resizes to at
// most `maxPx` on the long edge, and re-encodes as a base64 data URL. The
// canvas round-trip is itself the sanitization step — it strips any
// non-pixel payload (EXIF metadata, embedded scripts, polyglot trailer
// data), and a file that isn't a genuinely decodable raster image fails at
// `img.onerror` regardless of what its magic bytes or extension claimed.
// See PHOTO_UPLOAD_SPEC.md §Client-Side Image Processing & Security Pipeline.
export async function processPhotoUpload(file: File, maxPx: number = DEFAULT_MAX_PX): Promise<string> {
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new PhotoValidationError('Image must be 5MB or smaller.');
  }

  const sniffed = await sniffFileType(file);
  if (!sniffed) {
    throw new PhotoValidationError('File must be a JPEG, PNG, or WEBP image.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const outputFormat = sniffed === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(outputFormat, outputFormat === 'image/jpeg' ? 0.82 : undefined));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new PhotoValidationError('Could not read this image file.'));
    };
    img.src = objectUrl;
  });

  if (dataUrl.length > MAX_OUTPUT_CHARS) {
    // Should be rare at DEFAULT_MAX_PX/quality 0.82, but fail fast
    // client-side with a clear message rather than letting the Firestore
    // rules reject it silently.
    throw new PhotoValidationError('Processed image is unexpectedly large — try a simpler photo.');
  }

  return dataUrl;
}
