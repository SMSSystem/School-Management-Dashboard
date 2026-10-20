import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import { computeGridsheetPDF, type GridsheetData } from "@/lib/attendanceGridsheet";
import type { InstitutionTerm } from "@/hooks/useInstitutionTerms";
import ExportMenu from "@/components/ExportMenu";
import { exportGridsheetCSV, exportGridsheetXLSX } from "@/lib/gridsheetExports";
import { GridsheetPDF } from "./GridsheetPDF";
import { useKeepAliveWhileOpen } from "@/hooks/useKeepAliveWhileOpen";

// The "Preview Gridsheet" modal. It lives in its own file, loaded with React.lazy by the page,
// because it is the only thing on the page that needs the PDF engine (@react-pdf/renderer is
// roughly 1.5 MB). Keeping it out of the page's imports keeps that engine out of the first load.

function fmtTermRange(startISO: string, endISO: string): string {
  const [sy, sm] = startISO.split("-").map(Number);
  const [ey, em] = endISO.split("-").map(Number);
  const startAbbr = new Date(sy, sm - 1, 1)
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
  const endAbbr = new Date(ey, em - 1, 1)
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
  if (sy === ey) return `${startAbbr} - ${endAbbr} ${ey}`;
  return `${startAbbr} ${sy} - ${endAbbr} ${ey}`;
}

interface GridsheetPDFModalProps {
  gridData: GridsheetData;
  selectedTerm: InstitutionTerm;
  effectiveClassName: string;
  onClose: () => void;
}

export default function GridsheetPDFModal({
  gridData,
  selectedTerm,
  effectiveClassName,
  onClose,
}: GridsheetPDFModalProps) {
  useKeepAliveWhileOpen();
  return (
    <div className="fixed -top-8 inset-0 z-50 bg-gray-900/80 backdrop-blur-sm">
      <div
        className="absolute flex flex-col rounded-lg overflow-hidden shadow-xl"
        style={{
          width: "92vw",
          height: "90vh",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        {/* Modal header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Attendance Summary Register
            {effectiveClassName ? ` — ${effectiveClassName}` : ""}
            {` — ${fmtTermRange(selectedTerm.startDate, selectedTerm.endDate)}`}
            {" — PDF Preview"}
          </span>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <PDFDownloadLink
                document={
                  <GridsheetPDF
                    data={gridData}
                    termEndDate={selectedTerm.endDate}
                    className={effectiveClassName}
                  />
                }
                fileName={`attendance-register-${effectiveClassName || "class"}-${selectedTerm.name}.pdf`}
              >
                {({ loading }) => (
                  <button
                    type="button"
                    disabled={loading}
                    className="rounded-md border border-sky-500 bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
                  >
                    {loading ? "Preparing…" : "Download PDF"}
                  </button>
                )}
              </PDFDownloadLink>
              <ExportMenu
                formats={["csv", "xlsx"]}
                onExport={(format) => {
                  const pdfRows = computeGridsheetPDF(gridData);
                  if (format === "csv") {
                    exportGridsheetCSV(
                      pdfRows,
                      gridData.monthKeys,
                      selectedTerm,
                      effectiveClassName,
                    );
                  } else {
                    exportGridsheetXLSX(
                      pdfRows,
                      gridData.monthKeys,
                      selectedTerm,
                      effectiveClassName,
                    );
                  }
                }}
              />
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        {/* PDF viewer */}
        <div className="min-h-0 flex-1">
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            <GridsheetPDF
              data={gridData}
              termEndDate={selectedTerm.endDate}
              className={effectiveClassName}
            />
          </PDFViewer>
        </div>
      </div>
    </div>
  );
}
