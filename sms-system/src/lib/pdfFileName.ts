// The file name a report's "Download PDF" saves as: a prefix, the student and the term, spaces and
// ", " collapsed to hyphens ("report-card-Lee-Ann-Term-1.pdf").
export function reportPdfFileName(prefix: string, studentName: string, termName: string): string {
  return `${prefix}-${studentName.replace(/,?\s+/g, '-')}-${termName.replace(/\s+/g, '-')}.pdf`;
}
