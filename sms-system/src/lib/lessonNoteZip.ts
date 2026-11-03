import { zipSync, type Zippable } from 'fflate';
import { zipEntryNames } from './lessonNoteBulkDownload';

// One zip of a lesson note's files, built in the browser. Level 0 stores them as they are: these formats are already
// compressed, and compressing again would not reduce what Firebase counts, since that is charged on the download.
// Loaded with import() only when someone downloads a zip, so the library stays out of the first page load.
export async function buildNoteZip(files: readonly { fileName: string; blob: Blob }[]): Promise<Blob> {
  const names = zipEntryNames(files);
  const entries: Zippable = {};
  await Promise.all(
    files.map(async ({ blob }, i) => {
      entries[names[i]] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
    }),
  );
  return new Blob([zipSync(entries)], { type: 'application/zip' });
}
