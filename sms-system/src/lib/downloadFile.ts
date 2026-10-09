// Hands a data URL to the browser as a file download. Shared by every place
// that fetches a stored attachment on demand (lesson notes, assignments).
export async function saveDataUrl(dataUrl: string, fileName: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob();
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
