import { Suspense } from 'react';
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import type { ReportCardDocument } from '@/lib/firebase';
import { ReportCardPDF } from './ReportCardPDF';

interface Props {
  data: ReportCardDocument;
  onClose: () => void;
}

const ReportCardPDFModal = ({ data, onClose }: Props) => (
  <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white text-sm">
      <span>
        Report Card — {data.studentName} · {data.termName}
      </span>
      <div className="flex items-center gap-3">
        <Suspense
          fallback={
            <span className="text-gray-400 text-xs">Preparing…</span>
          }
        >
          <PDFDownloadLink
            document={<ReportCardPDF data={data} />}
            fileName={`report-card-${data.studentName.replace(/,?\s+/g, '-')}-${data.termName.replace(/\s+/g, '-')}.pdf`}
            className="text-sky-400 hover:underline text-xs"
          >
            {({ loading }) => (loading ? 'Preparing…' : 'Download PDF')}
          </PDFDownloadLink>
        </Suspense>
        <button
          onClick={onClose}
          className="text-gray-300 hover:text-white px-2"
        >
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
          <ReportCardPDF data={data} />
        </PDFViewer>
      </Suspense>
    </div>
  </div>
);

export default ReportCardPDFModal;
