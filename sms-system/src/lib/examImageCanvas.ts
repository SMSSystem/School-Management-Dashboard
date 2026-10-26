import { MAX_SOURCE_BYTES, PICTURE_UNREADABLE, prepareBytes, type Encoder, type PrepareResult } from './examImage';

export type { PrepareResult };

// The browser side of a question's picture (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §5): decode with the
// canvas only when the cleaned original does not fit. A lazy chunk, loaded when the teacher chooses a picture. The order of
// the encodings is chooseEncodingFor (tested without a DOM); this file is the DOM behind it.


function canvasEncoder(file: Blob): Encoder {
  let bitmap: Promise<ImageBitmap> | null = null;
  const decode = () => (bitmap ??= createImageBitmap(file, { imageOrientation: 'from-image' }));
  const draw = async (width: number, height: number, background: string | null) => {
    const source = await decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(source, 0, 0, width, height);
    return canvas;
  };
  const blobOf = (canvas: HTMLCanvasElement, mime: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  const bytesOf = async (blob: Blob | null, mime: string) => (blob && blob.type === mime ? new Uint8Array(await blob.arrayBuffer()) : null);
  return {
    async png() {
      const source = await decode();
      const canvas = await draw(source.width, source.height, null);
      return canvas ? bytesOf(await blobOf(canvas, 'image/png'), 'image/png') : null;
    },
    async lossy(mime, quality, size) {
      // A JPEG has no transparency: the transparent pixels are filled white, not black.
      const canvas = await draw(size.width, size.height, mime === 'image/jpeg' ? '#ffffff' : null);
      return canvas ? bytesOf(await blobOf(canvas, mime, quality), mime) : null;
    },
  };
}

/** Checks a chosen file, then keeps it exactly when it fits and reduces it only when it does not. Never throws. */
export async function prepareImage(file: Blob): Promise<PrepareResult> {
  try {
    if (file.size > MAX_SOURCE_BYTES) return { ok: false, message: 'This picture is larger than 10 MB. Choose a smaller one.' };
    return await prepareBytes(new Uint8Array(await file.arrayBuffer()), () => canvasEncoder(file));
  } catch {
    return { ok: false, message: PICTURE_UNREADABLE };
  }
}
