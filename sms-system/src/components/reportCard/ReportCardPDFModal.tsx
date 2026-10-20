import type { ReportCardDocument } from '@/lib/firebase';
import { reportPdfFileName } from '@/lib/pdfFileName';
import PdfViewerModal from '@/components/reports/PdfViewerModal';
import { ReportCardPDF } from './ReportCardPDF';

interface Props {
  data: ReportCardDocument;
  onClose: () => void;
}

const ReportCardPDFModal = ({ data, onClose }: Props) => (
  <PdfViewerModal
    title={`Report Card — ${data.studentName} · ${data.termName}`}
    fileName={reportPdfFileName('report-card', data.studentName, data.termName)}
    document={<ReportCardPDF data={data} />}
    onClose={onClose}
  />
);

export default ReportCardPDFModal;
