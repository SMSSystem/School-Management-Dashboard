import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The Report Card, Progress Report and Report Builder modals were three copies of one dark full-screen viewer;
// they now render through components/reports/PdfViewerModal.tsx. The QA institution has no report cards, so
// they cannot be opened in a browser there, and this test is the check that the markup came through unchanged:
// each modal is rendered to HTML with the PDF engine and the document components stubbed, and compared with the
// markup the earlier code produced (the same classes, text and order).

vi.mock('@react-pdf/renderer', async () => {
  const { createElement: h } = await import('react');
  return {
    PDFDownloadLink: ({ fileName, className, children }: { fileName: string; className?: string; children: (s: { loading: boolean }) => unknown }) =>
      h('a', { 'data-file': fileName, className }, children({ loading: false }) as never),
    PDFViewer: ({ width, height, showToolbar, children }: { width: string; height: string; showToolbar: boolean; children: unknown }) =>
      h('div', { 'data-viewer': `${width} ${height} ${showToolbar}` }, children as never),
  };
});
vi.mock('../../components/reportCard/ReportCardPDF', () => ({ ReportCardPDF: () => null }));
vi.mock('../../components/progressReport/ProgressReportPDF', () => ({ ProgressReportPDF: () => null }));
vi.mock('../../components/reportCard/ReportBuilderPDF', () => ({ ReportBuilderPDF: () => null }));

const { default: ReportCardPDFModal } = await import('../../components/reportCard/ReportCardPDFModal');
const { default: ProgressReportPDFModal } = await import('../../components/progressReport/ProgressReportPDFModal');
const { default: ReportBuilderPDFModal } = await import('../../components/reportCard/ReportBuilderPDFModal');

const expected = (title: string, file: string) =>
  '<div class="fixed inset-0 z-50 flex flex-col bg-black/80">' +
  '<div class="flex items-center justify-between px-4 py-2 bg-gray-900 text-white text-sm">' +
  `<span>${title}</span>` +
  '<div class="flex items-center gap-3">' +
  `<a data-file="${file}" class="text-sky-400 hover:underline text-xs">Download PDF</a>` +
  '<button class="text-gray-300 hover:text-white px-2">✕ Close</button>' +
  '</div></div>' +
  '<div class="flex-1"><div data-viewer="100% 100% false"></div></div></div>';

describe('the three PDF modals render the markup they always did', () => {
  it('Report Card', () => {
    const html = renderToStaticMarkup(
      createElement(ReportCardPDFModal, { data: { studentName: 'Lee, Ann', termName: 'Term 1' } as never, onClose: () => undefined }),
    );
    expect(html).toBe(expected('Report Card — Lee, Ann · Term 1', 'report-card-Lee-Ann-Term-1.pdf'));
  });

  it('Progress Report', () => {
    const html = renderToStaticMarkup(
      createElement(ProgressReportPDFModal, { data: { studentName: 'Ann Lee', termName: 'Easter Term' } as never, onClose: () => undefined }),
    );
    expect(html).toBe(expected('Progress Report — Ann Lee · Easter Term', 'progress-report-Ann-Lee-Easter-Term.pdf'));
  });

  it('Report Builder, with and without a term', () => {
    const base = { displayColumns: [], result: {}, institutionName: 'S', generatedBy: 'G', onClose: () => undefined } as never;
    const withTerm = renderToStaticMarkup(
      createElement(ReportBuilderPDFModal, { ...(base as object), config: { name: 'Honour Roll!' }, termName: 'Term 2' } as never),
    );
    expect(withTerm).toBe(expected('Honour Roll! · Term 2', 'honour-roll-term-2.pdf'));
    const noTerm = renderToStaticMarkup(
      createElement(ReportBuilderPDFModal, { ...(base as object), config: { name: 'Honour Roll!' }, termName: '' } as never),
    );
    expect(noTerm).toBe(expected('Honour Roll!', 'honour-roll.pdf'));
  });
});
