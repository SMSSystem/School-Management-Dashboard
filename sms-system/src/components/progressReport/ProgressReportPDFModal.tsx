import type { ProgressReportDocument } from '@/lib/firebase';
import { reportPdfFileName } from '@/lib/pdfFileName';
import PdfViewerModal from '@/components/reports/PdfViewerModal';
import { ProgressReportPDF } from './ProgressReportPDF';

interface Props {
  data: ProgressReportDocument;
  onClose: () => void;
}

const ProgressReportPDFModal = ({ data, onClose }: Props) => (
  <PdfViewerModal
    title={`Progress Report — ${data.studentName} · ${data.termName}`}
    fileName={reportPdfFileName('progress-report', data.studentName, data.termName)}
    document={<ProgressReportPDF data={data} />}
    onClose={onClose}
  />
);

export default ProgressReportPDFModal;
