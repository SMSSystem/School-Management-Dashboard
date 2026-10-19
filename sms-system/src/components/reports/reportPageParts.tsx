// Small pieces the Report Cards and Progress Reports pages render the same way.

/** Shown while a page's PDF renderer chunk loads. */
export function PdfModalFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 text-white text-sm">
      Loading PDF renderer…
    </div>
  );
}

/** What the super admin sees on the "All institutions" row, where no one institution's data is loaded. */
export function SelectInstitutionNotice({ title, noun }: { title: string; noun: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      <h1 className="text-lg font-semibold mb-4">{title}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Select an institution to view {noun}.
      </p>
    </div>
  );
}
