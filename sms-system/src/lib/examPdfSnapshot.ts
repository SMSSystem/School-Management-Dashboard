import { snapshotScale, type PixelBox } from './pdfSnapshotBox';

// The browser side of the snapshot tool (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.2): a page of the PDF
// drawn on a canvas by pdf.js at twice its size, and a box of it cropped to a PNG. Loaded only when the snapshot panel opens;
// pdf.js and its worker come from the app's own origin, as for reading the text. The box arithmetic is in pdfSnapshotBox.ts.

export type OpenedPdf = {
  pageCount: number;
  /** Draws a page (1 to pageCount) on a new canvas. */
  render(pageNumber: number): Promise<HTMLCanvasElement>;
  close(): Promise<void>;
};

/** Opens the PDF's bytes (a copy is handed to pdf.js, which takes the buffer it is given). */
export async function openPdf(bytes: Uint8Array): Promise<OpenedPdf> {
  const { loadPdfLib } = await import('./examPdf');
  const lib = await loadPdfLib();
  const task = lib.getDocument({ data: bytes.slice(), useSystemFonts: true, useWasm: false, verbosity: 0 });
  const doc = await task.promise;
  return {
    pageCount: doc.numPages,
    async render(pageNumber) {
      const page = await doc.getPage(pageNumber);
      try {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: snapshotScale(base.width, base.height) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await page.render({ canvas, viewport }).promise;
        return canvas;
      } finally {
        page.cleanup();
      }
    },
    close: () => task.destroy(),
  };
}

/** The PNG of a box of a canvas, or null when the browser cannot make one. */
export async function cropToPng(canvas: HTMLCanvasElement, box: PixelBox): Promise<Uint8Array | null> {
  const out = document.createElement('canvas');
  out.width = box.width;
  out.height = box.height;
  const context = out.getContext('2d');
  if (!context) return null;
  context.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
