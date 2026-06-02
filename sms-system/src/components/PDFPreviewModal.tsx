import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import { ReportPDF } from './ReportPDF';
import type { ReportPDFReport } from './ReportPDF';

type PDFPreviewModalProps = {
  report: ReportPDFReport;
  onClose: () => void;
};

const PDFPreviewModal = ({ report, onClose }: PDFPreviewModalProps) => {
  const filename = `report-${report.studentName.replace(/\s+/g, '-')}-${report.termName.replace(/\s+/g, '-')}.pdf`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 shadow flex-shrink-0">
        <span className="text-sm font-medium dark:text-gray-200">
          {report.studentName} — {report.termName}
        </span>
        <div className="flex items-center gap-2">
          <PDFDownloadLink document={<ReportPDF report={report} />} fileName={filename}>
            {({ loading }) => (
              <button
                className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-md transition-colors disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Preparing…' : 'Download PDF'}
              </button>
            )}
          </PDFDownloadLink>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-sm rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
      {/* Viewer */}
      <PDFViewer style={{ flex: 1, width: '100%', border: 'none' }}>
        <ReportPDF report={report} />
      </PDFViewer>
    </div>
  );
};

export default PDFPreviewModal;
