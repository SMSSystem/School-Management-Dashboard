import { Suspense } from 'react';
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import { ReportBuilderPDF, type ReportBuilderPDFProps } from './ReportBuilderPDF';

interface Props extends ReportBuilderPDFProps {
  onClose: () => void;
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'report';

const ReportBuilderPDFModal = ({ onClose, ...pdf }: Props) => {
  const fileName = `${slug(pdf.config.name)}${pdf.termName ? `-${slug(pdf.termName)}` : ''}.pdf`;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white text-sm">
        <span>
          {pdf.config.name}
          {pdf.termName ? ` · ${pdf.termName}` : ''}
        </span>
        <div className="flex items-center gap-3">
          <Suspense fallback={<span className="text-gray-400 text-xs">Preparing…</span>}>
            <PDFDownloadLink
              document={<ReportBuilderPDF {...pdf} />}
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
            <div className="flex items-center justify-center h-full text-white text-sm">Loading PDF renderer…</div>
          }
        >
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            <ReportBuilderPDF {...pdf} />
          </PDFViewer>
        </Suspense>
      </div>
    </div>
  );
};

export default ReportBuilderPDFModal;
