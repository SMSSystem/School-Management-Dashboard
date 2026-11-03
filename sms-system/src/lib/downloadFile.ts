// Hands a file to the browser as a download. Shared by every place that fetches
// a stored attachment on demand (lesson notes, assignments).
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // The download keeps its own reference; revoke once the click has dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

export async function saveDataUrl(dataUrl: string, fileName: string): Promise<void> {
  saveBlob(await dataUrlToBlob(dataUrl), fileName);
}
