// Resizes a picked logo or signature image in the browser and returns it as a data URL (the institution profile
// wizard, scenes/(dashboard)/institution-profile). Moved from the page as it was. It accepts anything the browser
// can decode and does no size check of its own: the page limits the file size, and the result is not capped.
// lib/imageUpload.ts's processPhotoUpload is a stricter near-copy used for people's photos; whether the two
// should be one is an open question (REMEDIATION Item 5).
export function processImage(file: File, maxPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const fmt = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(fmt, fmt === 'image/jpeg' ? 0.82 : undefined));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image.')); };
    img.src = objectUrl;
  });
}
