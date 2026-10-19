import PdfViewerModal from '@/components/reports/PdfViewerModal';
import { ReportBuilderPDF, type ReportBuilderPDFProps } from './ReportBuilderPDF';

interface Props extends ReportBuilderPDFProps {
  onClose: () => void;
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'report';

const ReportBuilderPDFModal = ({ onClose, ...pdf }: Props) => (
  <PdfViewerModal
    title={`${pdf.config.name}${pdf.termName ? ` · ${pdf.termName}` : ''}`}
    fileName={`${slug(pdf.config.name)}${pdf.termName ? `-${slug(pdf.termName)}` : ''}.pdf`}
    document={<ReportBuilderPDF {...pdf} />}
    onClose={onClose}
  />
);

export default ReportBuilderPDFModal;
