import { Suspense, type ReactElement } from 'react';
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { useKeepAliveWhileOpen } from '@/hooks/useKeepAliveWhileOpen';

type Props = {
  /** The line in the dark bar above the viewer. */
  title: string;
  /** The name "Download PDF" saves the file as. */
  fileName: string;
  /** The PDF document element to show and to download. */
  document: ReactElement<DocumentProps>;
  onClose: () => void;
};

// The full-screen PDF viewer the Report Card, Progress Report and Report Builder pages open: a dark bar with a
// title, "Download PDF" and "Close", and the document below. Each page's own modal file builds the document and
// the names and is loaded with React.lazy, so the PDF engine (this file imports it) stays out of the first load.
// While it is open the person counts as active: a PDF viewer is an iframe, and its mouse and keyboard events
// never reach the page that the inactivity logout listens to.
export default function PdfViewerModal({ title, fileName, document, onClose }: Props) {
  useKeepAliveWhileOpen();
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white text-sm">
        <span>{title}</span>
        <div className="flex items-center gap-3">
          <Suspense fallback={<span className="text-gray-400 text-xs">Preparing…</span>}>
            <PDFDownloadLink
              document={document}
              fileName={fileName}
              className="text-sky-400 hover:underline text-xs"
            >
              {({ loading }) => (loading ? 'Preparing…' : 'Download PDF')}
            </PDFDownloadLink>
          </Suspense>
          <button onClick={onClose} className="text-gray-300 hover:text-white px-2">
            ✕ Close
          </button>
        </div>
      </div>
      <div className="flex-1">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-white text-sm">
              Loading PDF renderer…
            </div>
          }
        >
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            {document}
          </PDFViewer>
        </Suspense>
      </div>
    </div>
  );
}
