import { describe, expect, it } from 'vitest';
import { reportPdfFileName } from '../pdfFileName';
import viewerRaw from '../../components/reports/PdfViewerModal.tsx?raw';
import reportCardModalRaw from '../../components/reportCard/ReportCardPDFModal.tsx?raw';
import progressModalRaw from '../../components/progressReport/ProgressReportPDFModal.tsx?raw';
import builderModalRaw from '../../components/reportCard/ReportBuilderPDFModal.tsx?raw';

// The Report Card and Progress Report modals were two copies of the Report Builder's, differing by a title and
// a file name. They now share components/reports/PdfViewerModal.tsx and keep only what is theirs: the document
// element, the title and the file name. The PDF engine is imported by the viewer, which only these lazily loaded
// modal files reach (bundleBoundaries.test.ts), so it stays out of the first load.

const lf = (s: string) => s.split('\r\n').join('\n');
const viewer = lf(viewerRaw);

describe('reportPdfFileName', () => {
  it('joins prefix, student and term with hyphens, collapsing spaces and a comma', () => {
    expect(reportPdfFileName('report-card', 'Lee, Ann', 'Term 1')).toBe('report-card-Lee-Ann-Term-1.pdf');
    expect(reportPdfFileName('progress-report', 'Ann Marie Lee', 'Easter Term')).toBe('progress-report-Ann-Marie-Lee-Easter-Term.pdf');
  });
});

describe('the shared viewer', () => {
  it('shows the title, a download link and a Close button over the document', () => {
    expect(viewer).toContain('<span>{title}</span>');
    expect(viewer).toContain("{({ loading }) => (loading ? 'Preparing…' : 'Download PDF')}");
    expect(viewer).toContain('✕ Close');
    expect(viewer).toContain('<PDFViewer width="100%" height="100%" showToolbar={false}>');
    expect(viewer).toContain('Loading PDF renderer…');
  });

  it('counts the open viewer as activity, for the inactivity logout', () => {
    expect(viewer).toContain('useKeepAliveWhileOpen();');
  });
});

describe('the three modals that use it', () => {
  it('each hands over a document, a title and a file name, and holds no viewer markup of its own', () => {
    for (const [name, src] of [
      ['ReportCardPDFModal', reportCardModalRaw],
      ['ProgressReportPDFModal', progressModalRaw],
      ['ReportBuilderPDFModal', builderModalRaw],
    ] as const) {
      const text = lf(src);
      expect(text, name).toContain('<PdfViewerModal');
      expect(text, name).toContain('document={<');
      expect(text, name).toContain('title={`');
      expect(text, name).toContain('fileName={');
      expect(text, name).not.toContain('@react-pdf/renderer');
      expect(text, name).not.toContain('bg-black/80');
    }
  });

  it('keep their titles and file name prefixes', () => {
    expect(lf(reportCardModalRaw)).toContain('title={`Report Card — ${data.studentName} · ${data.termName}`}');
    expect(lf(reportCardModalRaw)).toContain("reportPdfFileName('report-card', data.studentName, data.termName)");
    expect(lf(progressModalRaw)).toContain('title={`Progress Report — ${data.studentName} · ${data.termName}`}');
    expect(lf(progressModalRaw)).toContain("reportPdfFileName('progress-report', data.studentName, data.termName)");
  });
});
