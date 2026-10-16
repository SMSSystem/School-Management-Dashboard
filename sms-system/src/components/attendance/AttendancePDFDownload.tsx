import { PDFDownloadLink } from '@react-pdf/renderer';
import { AttendancePDF, type AttendancePDFData } from '@/components/attendance/AttendancePDF';

// The download link for a generated attendance PDF. It lives apart from AttendanceScopeModal and
// is loaded with React.lazy, so the PDF engine (@react-pdf/renderer, roughly 1.5 MB) is fetched
// only once a PDF has been generated, not with the attendance page.
export default function AttendancePDFDownload({
  data,
  fileName,
}: {
  data: AttendancePDFData;
  fileName: string;
}) {
  return (
    <PDFDownloadLink
      document={<AttendancePDF data={data} />}
      fileName={fileName}
      className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 no-underline"
    >
      {({ loading }) => (loading ? 'Preparing…' : 'Download PDF')}
    </PDFDownloadLink>
  );
}
