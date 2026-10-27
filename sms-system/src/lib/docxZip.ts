import { Inflate, strFromU8 } from 'fflate';

// The zip a .docx is (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4): its entries found through the central directory and
// inflated under a cap, so a crafted file cannot make the browser inflate gigabytes. Nothing here knows what is inside a Word
// document; docxText.ts reads the XML. Pure, so it runs the same in the browser and in the unit tests.

export class DocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxError';
  }
}

export const UNREADABLE =
  'That file could not be read as a Word document. It may be an old .doc file, password-protected or damaged; save it as a .docx file and try again.';
export const TOO_LARGE = 'That file is not a Word (.docx) document, or its text is too large to read.';

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** Compressed bytes handed to the inflater at a time: a crafted file inflates at most about 1,000 times that per step. */
const INFLATE_SLICE = 8 * 1024;

/**
 * Inflates one zip entry, stopping as soon as the output passes `max`. The zip's own sizes are not trusted (a crafted
 * file can claim a small size and inflate to gigabytes), so the output is counted as it appears and the work ends at the
 * cap.
 */
function inflateCapped(data: Uint8Array, max: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const inflater = new Inflate((chunk) => {
      total += chunk.length;
      chunks.push(chunk.slice());
    });
    for (let at = 0; at < data.length; at += INFLATE_SLICE) {
      inflater.push(data.subarray(at, at + INFLATE_SLICE), at + INFLATE_SLICE >= data.length);
      if (total > max) break;
    }
  } catch {
    throw new DocxError(UNREADABLE);
  }
  if (total > max) throw new DocxError(TOO_LARGE);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export type ZipEntry = { name: string; flags: number; method: number; size: number; local: number };

/**
 * The entries of a zip file, found through its central directory (whose compressed sizes are right even when the entries
 * use data descriptors); nothing is inflated here. A file that is not a zip or uses zip64 or whose directory is damaged is a
 * DocxError. The last entry of a name wins.
 */
export function indexZip(bytes: Uint8Array): Map<string, ZipEntry> {
  let eocd = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 65535); at -= 1) {
    if (u32(bytes, at) === 0x06054b50) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) throw new DocxError(UNREADABLE);
  const count = u16(bytes, eocd + 10);
  let at = u32(bytes, eocd + 16);
  if (count === 0xffff || at === 0xffffffff) throw new DocxError(UNREADABLE);

  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n += 1) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) throw new DocxError(UNREADABLE);
    const nameLength = u16(bytes, at + 28);
    const name = strFromU8(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, { name, flags: u16(bytes, at + 8), method: u16(bytes, at + 10), size: u32(bytes, at + 20), local: u32(bytes, at + 42) });
    at += 46 + nameLength + u16(bytes, at + 30) + u16(bytes, at + 32);
  }
  return entries;
}

/** One entry's bytes, inflated with a cap. An encrypted entry, an odd method or damage is a DocxError; a cap passed is TOO_LARGE. */
export function extractEntry(bytes: Uint8Array, entry: ZipEntry, max: number): Uint8Array {
  const { flags, method, size, local } = entry;
  if ((flags & 1) !== 0 || size === 0xffffffff) throw new DocxError(UNREADABLE);
  if (local + 30 > bytes.length || u32(bytes, local) !== 0x04034b50) throw new DocxError(UNREADABLE);
  const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
  if (start + size > bytes.length) throw new DocxError(UNREADABLE);
  const data = bytes.subarray(start, start + size);
  if (method === 0) {
    if (data.length > max) throw new DocxError(TOO_LARGE);
    return data;
  }
  if (method === 8) return inflateCapped(data, max);
  throw new DocxError(UNREADABLE);
}
