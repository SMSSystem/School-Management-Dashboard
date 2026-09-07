# Spreadsheet Export — Implementation Plan

> **Status:** Ready to implement
> **Source spec:** [`SPREADSHEET_EXPORT_SPEC.md`](./SPREADSHEET_EXPORT_SPEC.md) (read in full before this plan was written; this plan does not repeat rationale already settled there — see its §2 Decision Log)
> **Date documented:** 2026-09-06
> **Branch:** `spreadsheet-export`
> **This document resolves 3 of the spec's 4 open items (§15)** and carries the 4th forward as a pre-implementation verification step (see §0 below).

## Table of Contents

0. [Resolved Since the Spec Was Written](#0-resolved-since-the-spec-was-written)
1. [Prerequisites](#1-prerequisites)
2. [`src/lib/spreadsheetExport.ts` (new)](#2-srclibspreadsheetexportts-new)
3. [`src/components/ExportMenu.tsx` (new)](#3-srccomponentsexportmenutsx-new)
4. [`src/lib/gridsheetExports.ts` (new)](#4-srclibgridsheetexportsts-new)
5. [Gridsheet page wiring](#5-gridsheet-page-wiring)
6. [Results page wiring](#6-results-page-wiring)
7. [Report Cards page wiring](#7-report-cards-page-wiring)
8. [Tests](#8-tests)
9. [Implementation Order](#9-implementation-order)
10. [Manual QA Checklist](#10-manual-qa-checklist)
11. [Risks Carried Forward](#11-risks-carried-forward)

---

## 0. Resolved Since the Spec Was Written

| Spec §15 item                                                     | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`xlsx` package version pinning**                                | **Changed from the spec's assumption.** Plain `xlsx` on the npm registry is abandoned (last published 0.18.5, March 2022) with two unpatched high-severity vulnerabilities (Prototype Pollution, ReDoS) — pinning a version number does **not** avoid them, because every published version has them. Use **`@e965/xlsx@0.20.3`** instead: an automated, high-adoption (884K weekly downloads) mirror that republishes SheetJS's own current fixed releases to the standard npm registry, so normal `npm audit`/Dependabot/lockfile tooling keeps working. Same API as `xlsx` — every code sample below imports from `@e965/xlsx`, not `xlsx`. (Researched and decided in conversation prior to this document; see §1 below.) |
| **Composite index sufficiency for partial-filter export queries** | **Confirmed, not just assumed.** Firestore serves any combination of pure equality (`==`) filters — class-only, class+subject, class+term, or all three — via automatic single-field index merging; a composite index is only required once a range/inequality filter or a differently-ordered `orderBy` is introduced, neither of which applies to §6.2's export query. The existing `results` composite index (`institutionId ASC, classId ASC, subjectId ASC, termId ASC`) is sufficient as-is; **no new index needs to be added or deployed for this feature.**                                                                                                                                                           |
| **Report Card "Conduct" column tie-break rule**                   | **Decided: most frequent `conductGrade` across `subjects[]`.** Null values are excluded from the count. Ties are broken by a fixed best-to-worst grade order (`G > S > F > P > D > U`) rather than by array order, so the result is deterministic regardless of how `subjects[]` happens to be sorted. See §7.2 for the exact function.                                                                                                                                                                                                                                                                                                                                                                                       |
| **Legacy `results` docs predating `subjectId`**                   | **Not resolvable by research — carried forward as a pre-implementation verification step.** See §11.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

## 1. Prerequisites

```bash
npm install @e965/xlsx@0.20.3
```

Install pinned to the exact version, no `^`/`~` range, per the spec's own dependency-pinning intent (§10) — just against the corrected package. Re-check `@e965/xlsx`'s published versions against SheetJS's own release notes at implementation time in case a newer patch has shipped since this plan was written; do not silently accept `npm audit`'s word alone (same rationale the spec already gives for `xlsx`, unchanged by the package swap).

Every `import ... from '@e965/xlsx'` in the code below depends on this install having happened first.

---

## 2. `src/lib/spreadsheetExport.ts` (new)

Single file — the low-level primitives (§2.2 below) are small enough (4 one-line wrappers) that a second file would be pure ceremony; both layers are exercised by one test file per spec §12 either way.

### 2.1 High-level layer (flat tabular data — Results, Report Cards)

```ts
import * as XLSX from "@e965/xlsx";

export interface ExportColumn<T> {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function rowsToCSV<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const headerRow = columns.map((c) => csvEscape(c.header));
  const dataRows = rows.map((row) =>
    columns.map((c) => csvEscape(c.accessor(row))),
  );
  return [headerRow, ...dataRows].map((r) => r.join(",")).join("\n");
}

/** For pre-built CSV strings (the Gridsheet's bespoke flattened-header export uses this directly). */
export function downloadCSVRaw(filename: string, csv: string): void {
  triggerDownload(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    filename,
  );
}

export function downloadCSV<T>(
  filename: string,
  rows: T[],
  columns: ExportColumn<T>[],
): void {
  downloadCSVRaw(filename, rowsToCSV(rows, columns));
}

function xlsxCellValue(
  value: string | number | null | undefined,
): string | number {
  return value === null || value === undefined ? "" : value;
}

export function rowsToXLSXSheet<T>(
  rows: T[],
  columns: ExportColumn<T>[],
): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => xlsxCellValue(c.accessor(row)))),
  ];
  return XLSX.utils.aoa_to_sheet(aoa);
}

export function downloadXLSX(
  filename: string,
  sheets: { name: string; sheet: XLSX.WorkSheet }[],
): void {
  const wb = XLSX.utils.book_new();
  for (const { name, sheet } of sheets) {
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  XLSX.writeFile(wb, filename); // SheetJS handles the Blob/download mechanics itself in a browser context
}
```

### 2.2 Low-level layer (hand-built sheets with merges — Gridsheet)

Thin named wrappers over the raw SheetJS calls, per spec §3.2 — these names don't exist anywhere in the codebase yet (the attendance spec's §18.3 sketch uses the raw `XLSX.utils.*` calls inline); this plan is what actually defines them.

```ts
export function encodeCell(r: number, c: number): string {
  return XLSX.utils.encode_cell({ r, c });
}

export function aoaToSheet(aoa: (string | number | null)[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(aoa);
}

export type CellRange = {
  s: { r: number; c: number };
  e: { r: number; c: number };
};

export function setMerges(ws: XLSX.WorkSheet, merges: CellRange[]): void {
  ws["!merges"] = merges;
}

export function setColWidths(ws: XLSX.WorkSheet, widths: number[]): void {
  ws["!cols"] = widths.map((wch) => ({ wch }));
}
```

### 2.3 Shared filename helper

```ts
export function buildExportFilename(
  parts: (string | null | undefined)[],
  ext: "csv" | "xlsx",
): string {
  const joined = parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .join("-");
  const safe = joined
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return `${safe}.${ext}`;
}
```

---

## 3. `src/components/ExportMenu.tsx` (new)

Modeled on the existing `PDFDownloadLink` children-as-function loading pattern (§4 of the spec), but as a self-contained component rather than a render-prop, since CSV/XLSX generation is synchronous/near-instant local work, not an async render like `PDFDownloadLink`'s.

```tsx
import { useEffect, useRef, useState } from "react";

export type ExportFormat = "csv" | "xlsx";

type ExportMenuProps = {
  formats: ExportFormat[];
  disabled?: boolean;
  onExport: (format: ExportFormat) => void | Promise<void>;
  label?: string;
};

const FORMAT_LABEL: Record<ExportFormat, string> = {
  csv: "Download CSV",
  xlsx: "Download XLSX",
};

const BTN_CLASS =
  "rounded-md border border-sky-500 bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-50 disabled:cursor-not-allowed";

export default function ExportMenu({
  formats,
  disabled,
  onExport,
  label = "Export",
}: ExportMenuProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const trigger = async (format: ExportFormat) => {
    setOpen(false);
    setLoading(true);
    try {
      await onExport(format);
    } finally {
      setLoading(false);
    }
  };

  if (formats.length === 0) return null;

  if (formats.length === 1) {
    const only = formats[0];
    return (
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => trigger(only)}
        className={BTN_CLASS}
      >
        {loading ? "Preparing…" : FORMAT_LABEL[only]}
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((o) => !o)}
        className={BTN_CLASS}
      >
        {loading ? "Preparing…" : `${label} ▾`}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => trigger(f)}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

Notes:

- `disabled` is a required pass-through (not inferred) — each caller already knows its own "is data ready" condition (`gridData` loaded, `selectedClassId` set, etc.), matching how the existing `PDFDownloadLink` buttons are gated today.
- Click-outside-to-close is included since this is a genuinely new dropdown pattern in the app (the existing PDF buttons are single buttons, no menu) — omitting it would be a worse first impression than the single-button case, which has no menu to accidentally leave open.

---

## 4. `src/lib/gridsheetExports.ts` (new)

Built directly on §2.2's primitives, not on §2.1's `ExportColumn<T>` model — the 5-row hierarchical header doesn't fit a flat-columns shape (per spec §3.2).

```ts
import * as XLSX from "@e965/xlsx";
import type { GridsheetPDFDayRow } from "./attendanceGridsheet";
import type { TermDocument } from "./firebase";
import {
  aoaToSheet,
  buildExportFilename,
  downloadCSVRaw,
  downloadXLSX,
  setColWidths,
  setMerges,
  type CellRange,
} from "./spreadsheetExport";

function monthShort(mk: string): string {
  const [year, month] = mk.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
}

function monthLong(mk: string): string {
  const [year, month] = mk.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

// ─── CSV (flattened 2-row header — see spec §18.2 / §18.4 for why CSV can't
// represent the XLSX version's merged 5-row header) ────────────────────────

export function exportGridsheetCSV(
  rows: GridsheetPDFDayRow[],
  monthKeys: string[],
  term: TermDocument & { id: string },
  className: string,
): void {
  const monthNames = monthKeys.map(monthLong);

  const headerRow = [
    ...monthKeys.map(monthShort),
    "CF",
    ...monthKeys.flatMap((_mk, i) => [
      `${monthNames[i]} Date`,
      `${monthNames[i]} M-AM`,
      `${monthNames[i]} M-PM`,
      `${monthNames[i]} F-AM`,
      `${monthNames[i]} F-PM`,
    ]),
    "Total Males",
    "Total Females",
  ];

  const dataRows = rows.map((row) => {
    const dayStr = String(row.dayNum).padStart(2, "0");
    return [
      ...monthKeys.map((mk) => row.monthDayTotals[mk] ?? ""),
      "",
      ...monthKeys.flatMap((mk) => {
        const s = row.monthSessions[mk];
        return [
          dayStr,
          s.malesAM ?? "",
          s.malesPM ?? "",
          s.femalesAM ?? "",
          s.femalesPM ?? "",
        ];
      }),
      row.malesTotal || "",
      row.femalesTotal || "",
    ];
  });

  const csv = [headerRow, ...dataRows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  downloadCSVRaw(
    buildExportFilename(["summary-register", className, term.name], "csv"),
    csv,
  );
}

// ─── XLSX (merged 5-row header — layout per spec §18.3, generalized here for
// any term length instead of the spec's fixed 4-month worked example) ──────

export function exportGridsheetXLSX(
  rows: GridsheetPDFDayRow[],
  monthKeys: string[],
  term: TermDocument & { id: string },
  className: string,
): void {
  const numMonths = monthKeys.length;
  const monthNames = monthKeys.map(monthLong);

  // Column layout (0-indexed):
  //   0..numMonths-1        "Total Attendances" per-month day totals
  //   numMonths              "CF" (Carried Forward)
  //   numMonths+1..          per-month block: Date, M-AM, M-PM, F-AM, F-PM  (5 cols/month)
  //   ...+2                  Total Males, Total Females
  const CF_COL = numMonths;
  const MONTHLY_START = numMonths + 1;
  const monthColStart = (i: number) => MONTHLY_START + i * 5;
  const totalMalesCol = MONTHLY_START + numMonths * 5;
  const totalFemalesCol = totalMalesCol + 1;
  const lastCol = totalFemalesCol;

  const HEADER_ROWS = 5; // rows 0-4; data starts at row 5
  const aoa: (string | number | null)[][] = Array.from(
    { length: HEADER_ROWS + rows.length },
    () => Array(lastCol + 1).fill(null),
  );

  // Row 0 — top-level titles
  aoa[0][0] = "TOTAL ATTENDANCES (each month of term)";
  aoa[0][CF_COL] = "TOTAL ATTENDANCES Carried Forward";
  aoa[0][MONTHLY_START] = `MONTHLY SUMMARIES FOR TERM ENDING ${term.endDate}`;
  aoa[0][totalMalesCol] = "TOTAL";

  // Row 1 — month short-names under the "Total Attendances" block (not enumerated
  // in the source spec's merge table — added here for parity with the CSV
  // version's per-month columns; verify visually against the PDF during QA, per
  // §11 of this plan) + month full-names under each monthly-summary block.
  monthKeys.forEach((mk, i) => {
    aoa[1][i] = monthShort(mk);
    aoa[1][monthColStart(i)] = monthNames[i];
  });

  // Row 2 — "Males" / "Females" group labels per month
  monthKeys.forEach((_mk, i) => {
    aoa[2][monthColStart(i) + 1] = "Males";
    aoa[2][monthColStart(i) + 3] = "Females";
  });

  // Row 3 — "Session" label per month (spans the whole 4-session block)
  monthKeys.forEach((_mk, i) => {
    aoa[3][monthColStart(i) + 1] = "Session";
  });

  // Row 4 — column labels: Date | AM | PM | AM | PM, per month
  monthKeys.forEach((_mk, i) => {
    const c = monthColStart(i);
    aoa[4][c] = "Date";
    aoa[4][c + 1] = "AM";
    aoa[4][c + 2] = "PM";
    aoa[4][c + 3] = "AM";
    aoa[4][c + 4] = "PM";
  });

  // Data rows
  rows.forEach((row, ri) => {
    const r = HEADER_ROWS + ri;
    const dayStr = String(row.dayNum).padStart(2, "0");
    monthKeys.forEach((mk, i) => {
      aoa[r][i] = row.monthDayTotals[mk];
      const s = row.monthSessions[mk];
      const c = monthColStart(i);
      aoa[r][c] = dayStr;
      aoa[r][c + 1] = s.malesAM;
      aoa[r][c + 2] = s.malesPM;
      aoa[r][c + 3] = s.femalesAM;
      aoa[r][c + 4] = s.femalesPM;
    });
    aoa[r][totalMalesCol] = row.malesTotal;
    aoa[r][totalFemalesCol] = row.femalesTotal;
  });

  const ws = aoaToSheet(aoa);

  const merges: CellRange[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: numMonths - 1 } },
    { s: { r: 0, c: CF_COL }, e: { r: HEADER_ROWS - 1, c: CF_COL } },
    { s: { r: 0, c: MONTHLY_START }, e: { r: 0, c: totalMalesCol - 1 } },
    { s: { r: 0, c: totalMalesCol }, e: { r: 0, c: totalFemalesCol } },
    {
      s: { r: 1, c: totalMalesCol },
      e: { r: HEADER_ROWS - 1, c: totalMalesCol },
    },
    {
      s: { r: 1, c: totalFemalesCol },
      e: { r: HEADER_ROWS - 1, c: totalFemalesCol },
    },
    ...monthKeys.flatMap((_mk, i): CellRange[] => {
      const c = monthColStart(i);
      return [
        { s: { r: 1, c }, e: { r: HEADER_ROWS - 1, c } }, // "Date" column spans rows 1-4
        { s: { r: 1, c: c + 1 }, e: { r: 1, c: c + 4 } }, // month name spans its 4 session cols
        { s: { r: 2, c: c + 1 }, e: { r: 2, c: c + 2 } }, // "Males"
        { s: { r: 2, c: c + 3 }, e: { r: 2, c: c + 4 } }, // "Females"
        { s: { r: 3, c: c + 1 }, e: { r: 3, c: c + 4 } }, // "Session"
      ];
    }),
  ];
  setMerges(ws, merges);
  setColWidths(ws, Array(lastCol + 1).fill(6));

  downloadXLSX(
    buildExportFilename(["summary-register", className, term.name], "xlsx"),
    [{ name: "Summary Register", sheet: ws }],
  );
}
```

---

## 5. Gridsheet page wiring

**File:** `src/scenes/(dashboard)/attendance/gridsheet/index.tsx`

1. Import `ExportMenu` and the two new export functions:

```ts
import ExportMenu from "@/components/ExportMenu";
import {
  exportGridsheetCSV,
  exportGridsheetXLSX,
} from "@/lib/gridsheetExports";
import { computeGridsheetPDF } from "@/lib/attendanceGridsheet";
```

2. In the modal header block (currently lines 457–487, the `<div className="flex items-center gap-3">` that holds the `PDFDownloadLink` "Download PDF" button and the "Close" button), add `ExportMenu` alongside it:

```tsx
<div className="flex items-center gap-3">
  <div className="flex gap-2">
    <PDFDownloadLink /* ...unchanged... */>
      {/* ...unchanged... */}
    </PDFDownloadLink>
    <ExportMenu
      formats={["csv", "xlsx"]}
      disabled={!gridData || !selectedTerm}
      onExport={(format) => {
        const pdfRows = computeGridsheetPDF(gridData!);
        if (format === "csv") {
          exportGridsheetCSV(
            pdfRows,
            gridData!.monthKeys,
            selectedTerm!,
            effectiveClassName,
          );
        } else {
          exportGridsheetXLSX(
            pdfRows,
            gridData!.monthKeys,
            selectedTerm!,
            effectiveClassName,
          );
        }
      }}
    />
    <button
      type="button"
      onClick={() => setPdfOpen(false)} /* ...unchanged... */
    >
      Close
    </button>
  </div>
</div>
```

The non-null assertions are safe here: `ExportMenu` only calls `onExport` from a click, and the button is `disabled` whenever `gridData`/`selectedTerm` are falsy, so the handler body never runs without them — same gating discipline the existing `PDFDownloadLink`/`GridsheetPDF` usage two lines above already relies on.

**Reads:** zero additional — `computeGridsheetPDF(gridData!)` recomputes from data already in memory (same call the `GridsheetPDF` component itself makes internally for the PDF/preview), no new Firestore query.

---

## 6. Results page wiring

**File:** `src/scenes/(dashboard)/list/results/index.tsx`

### 6.1 New imports

```ts
import ExportMenu from "@/components/ExportMenu";
import {
  downloadCSV,
  downloadXLSX,
  rowsToXLSXSheet,
  buildExportFilename,
  type ExportColumn,
} from "@/lib/spreadsheetExport";
```

### 6.2 New state (near the existing `selectedClassId`/`selectedSubjectId`/`selectedTermId` declarations, line ~104)

```ts
const [includeGradebookResults, setIncludeGradebookResults] = useState(false);
```

### 6.3 Column definitions (module scope, alongside the existing `columns` array — needs `subjectNameById`/`termNameById` in closure, so defined as a function called from inside the component, not a top-level constant like `columns` is)

```ts
function buildResultExportColumns(
  subjectNameById: Record<string, string>,
  termNameById: Record<string, string>,
): ExportColumn<Result>[] {
  return [
    { header: "Student", accessor: (r) => r.studentName },
    { header: "Class", accessor: (r) => r.className },
    { header: "Subject", accessor: (r) => subjectNameById[r.subjectId] ?? "" },
    { header: "Assessment", accessor: (r) => r.assessmentName },
    { header: "Type", accessor: (r) => r.assessmentType },
    { header: "Score", accessor: (r) => r.score },
    { header: "Max Score", accessor: (r) => r.maxScore },
    { header: "Weight", accessor: (r) => r.weight ?? "" },
    { header: "Date", accessor: (r) => r.date ?? "" },
    { header: "Teacher", accessor: (r) => r.teacherName },
    { header: "Term", accessor: (r) => termNameById[r.termId] ?? "" },
    {
      header: "Source",
      accessor: (r) =>
        r.source === "gradebook" || r.gradebookColumnId
          ? "Gradebook"
          : "Manual entry",
    },
  ];
}
```

(Column order here follows the spec's §6.2 table with "Term" moved to the end rather than left out — the spec's table omits a Term column entirely despite the page supporting a Term filter and the filename already encoding term; adding it is a one-line, low-risk completion of the spec's own table rather than a scope change, since every other filterable dimension — Class, Subject — already has a column.)

### 6.4 Export handler + fresh filtered query (§6.2 of the spec: export runs its own `getDocs`, not the on-screen `liveResults`)

```ts
const handleExportResults = async (format: "csv" | "xlsx") => {
  if (!institutionId || institutionId === "*" || !selectedClassId) return;

  const clauses = [where("classId", "==", selectedClassId)];
  if (selectedSubjectId)
    clauses.push(where("subjectId", "==", selectedSubjectId));
  if (selectedTermId) clauses.push(where("termId", "==", selectedTermId));

  const snap = await getDocs(
    query(institutionCollection(institutionId, "results"), ...clauses),
  );
  let exportRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Result);
  if (!includeGradebookResults) {
    exportRows = exportRows.filter((r) => !r.gradebookColumnId);
  }

  const filenameParts = [
    "results",
    classes.find((c) => c.id === selectedClassId)?.name ?? "all-classes",
    selectedSubjectId
      ? (subjects.find((s) => s.id === selectedSubjectId)?.name ??
        "all-subjects")
      : "all-subjects",
    selectedTermId
      ? (terms.find((t) => t.id === selectedTermId)?.name ?? "all-terms")
      : "all-terms",
    new Date().toISOString().slice(0, 10),
  ];

  const columns = buildResultExportColumns(subjectNameById, termNameById);
  if (format === "csv") {
    downloadCSV(buildExportFilename(filenameParts, "csv"), exportRows, columns);
  } else {
    downloadXLSX(buildExportFilename(filenameParts, "xlsx"), [
      { name: "Results", sheet: rowsToXLSXSheet(exportRows, columns) },
    ]);
  }
};
```

### 6.5 UI: export button + checkbox, staff-only (rendered in the filter row, §6.2/§9 of the spec — `institution_admin`/`super_admin`/`senior_teacher`/`regular_teacher` only, never `student`/`parent`)

Add after the existing three `<select>` elements inside the `{isStaff && (...)}` filter block (currently ending at line 385):

```tsx
{
  isStaff && selectedClassId && (
    <>
      <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
        <input
          type="checkbox"
          checked={includeGradebookResults}
          onChange={(e) => setIncludeGradebookResults(e.target.checked)}
        />
        Include gradebook-originated results
      </label>
      <ExportMenu formats={["csv", "xlsx"]} onExport={handleExportResults} />
    </>
  );
}
```

Gating is `isStaff && selectedClassId` (not just `isStaff`) since the export query requires a class filter at minimum, same requirement the page's own on-screen list already has (line 388's "Select a class to view results" gate) — export can't reasonably offer a button that would immediately no-op.

**Reads:** one per matching document per export, bounded by the selected filter (§8 of the spec) — a new cost, not reused from `liveResults`, per the spec's explicit "fresh query, not the on-screen set" decision.

---

## 7. Report Cards page wiring

**File:** `src/scenes/(dashboard)/report-cards/index.tsx`

### 7.1 New imports

```ts
import ExportMenu from "@/components/ExportMenu";
import {
  downloadCSV,
  downloadXLSX,
  rowsToXLSXSheet,
  buildExportFilename,
  type ExportColumn,
} from "@/lib/spreadsheetExport";
import type { ReportCardSubjectRow } from "@/lib/firebase";
```

### 7.2 Conduct tie-break helper (module scope)

```ts
const CONDUCT_RANK: Record<
  NonNullable<ReportCardSubjectRow["conductGrade"]>,
  number
> = {
  G: 0,
  S: 1,
  F: 2,
  P: 3,
  D: 4,
  U: 5, // best → worst; used only to break ties deterministically
};

function summarizeConduct(subjects: ReportCardSubjectRow[]): string {
  const counts = new Map<string, number>();
  for (const s of subjects) {
    if (s.conductGrade)
      counts.set(s.conductGrade, (counts.get(s.conductGrade) ?? 0) + 1);
  }
  if (counts.size === 0) return "";

  let best: string | null = null;
  let bestCount = -1;
  for (const [grade, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount &&
        best !== null &&
        CONDUCT_RANK[grade as keyof typeof CONDUCT_RANK] <
          CONDUCT_RANK[best as keyof typeof CONDUCT_RANK])
    ) {
      best = grade;
      bestCount = count;
    }
  }
  return best ?? "";
}
```

### 7.3 Column definitions (module scope — `CardRow` is already defined at line 24 as `ReportCardDocument & { id: string }`)

```ts
const reportCardExportColumns: ExportColumn<CardRow>[] = [
  { header: "Student", accessor: (c) => c.studentName },
  { header: "Student ID", accessor: (c) => c.institutionStudentId ?? "" },
  { header: "Class", accessor: (c) => c.className },
  { header: "Term", accessor: (c) => c.termName },
  { header: "Class Average", accessor: (c) => c.classAverage ?? "" },
  { header: "Student Average", accessor: (c) => c.studentAverage ?? "" },
  { header: "Class Rank", accessor: (c) => c.classRank ?? "" },
  { header: "GPA", accessor: (c) => c.gpa ?? "" },
  { header: "Conduct", accessor: (c) => summarizeConduct(c.subjects) },
  { header: "Sessions Absent", accessor: (c) => c.sessionsAbsent },
  { header: "Days Late", accessor: (c) => c.daysLate },
  { header: "Merits", accessor: (c) => c.merits ?? "" },
  { header: "Demerits", accessor: (c) => c.demerits ?? "" },
  {
    header: "Generated",
    accessor: (c) =>
      c.generatedAt?.toDate?.()?.toISOString().slice(0, 10) ?? "",
  },
];
```

### 7.4 Export handler — reuses the already-loaded `cards` state (§7 of the spec: zero additional reads; this page has no class/term filter of its own, so "currently loaded" is simply the full role-scoped `cards` array)

```ts
const handleExportCards = (format: "csv" | "xlsx") => {
  const filenameParts = [
    "report-cards",
    "all-classes",
    "all-terms",
    new Date().toISOString().slice(0, 10),
  ];
  if (format === "csv") {
    downloadCSV(
      buildExportFilename(filenameParts, "csv"),
      cards,
      reportCardExportColumns,
    );
  } else {
    downloadXLSX(buildExportFilename(filenameParts, "xlsx"), [
      {
        name: "Report Cards",
        sheet: rowsToXLSXSheet(cards, reportCardExportColumns),
      },
    ]);
  }
};
```

(The spec's §11 filename pattern — `report-cards-{className}-{termName}-{date}` — assumes a per-class/term export; since this page has no such filter, `all-classes`/`all-terms` is used instead of leaving the pattern's placeholders unfillable. If a class/term filter is added to this page later, this filename call is the only place that needs to change.)

### 7.5 UI — same header row as the existing "Generate Report Card" button (line ~348), `isAdmin`-gated exactly like generation already is

```tsx
<div className="flex items-center justify-between">
  <h1 className="hidden md:block text-lg font-semibold">Report Cards</h1>
  <div className="flex items-center gap-2">
    {isAdmin && (
      <ExportMenu
        formats={["csv", "xlsx"]}
        disabled={cards.length === 0}
        onExport={handleExportCards}
      />
    )}
    {isAdmin && (
      <button /* ...unchanged existing "Generate Report Card" button... */>
        <RefreshCw className="w-4 h-4 text-white" />
      </button>
    )}
  </div>
</div>
```

---

## 8. Tests

**File:** `src/lib/__tests__/spreadsheetExport.test.ts` (new)

```ts
import { describe, it, expect } from "vitest";
import {
  rowsToCSV,
  rowsToXLSXSheet,
  buildExportFilename,
  type ExportColumn,
} from "../spreadsheetExport";

type Row = { name: string; score: number | null };
const columns: ExportColumn<Row>[] = [
  { header: "Name", accessor: (r) => r.name },
  { header: "Score", accessor: (r) => r.score },
];

describe("rowsToCSV", () => {
  it("writes a header-only CSV for an empty row set", () => {
    expect(rowsToCSV([], columns)).toBe('"Name","Score"');
  });

  it("stringifies values and joins with commas", () => {
    const csv = rowsToCSV([{ name: "Ada", score: 95 }], columns);
    expect(csv).toBe('"Name","Score"\n"Ada","95"');
  });

  it("escapes embedded quotes and commas", () => {
    const csv = rowsToCSV([{ name: 'Smith, "Ace"', score: null }], columns);
    expect(csv).toContain('"Smith, ""Ace"""');
  });

  it("renders null/undefined as an empty cell", () => {
    const csv = rowsToCSV([{ name: "Ada", score: null }], columns);
    expect(csv.split("\n")[1]).toBe('"Ada",""');
  });
});

describe("rowsToXLSXSheet", () => {
  it("places header and values at expected cell addresses", () => {
    const ws = rowsToXLSXSheet([{ name: "Ada", score: 95 }], columns);
    expect(ws["A1"].v).toBe("Name");
    expect(ws["B1"].v).toBe("Score");
    expect(ws["A2"].v).toBe("Ada");
    expect(ws["B2"].v).toBe(95);
  });

  it("sizes the sheet range to the row/column count", () => {
    const ws = rowsToXLSXSheet(
      [
        { name: "Ada", score: 1 },
        { name: "Bo", score: 2 },
      ],
      columns,
    );
    expect(ws["!ref"]).toBe("A1:B3"); // 1 header row + 2 data rows, 2 columns
  });
});

describe("buildExportFilename", () => {
  it("joins non-empty parts with hyphens and lowercases", () => {
    expect(buildExportFilename(["Results", "Grade 10B", "2026"], "csv")).toBe(
      "results-grade-10b-2026.csv",
    );
  });

  it("skips null/undefined parts", () => {
    expect(
      buildExportFilename(["results", null, undefined, "all-terms"], "xlsx"),
    ).toBe("results-all-terms.xlsx");
  });

  it("strips unsafe filename characters", () => {
    expect(buildExportFilename(["a/b:c*d"], "csv")).toBe("abcd.csv");
  });
});
```

**File:** `src/lib/__tests__/gridsheetExports.test.ts` (new) — merge-range and header-row assertions against a small fixed fixture (2 months, 3 day-rows), per spec §12:

```ts
import { describe, it, expect } from "vitest";
import { exportGridsheetXLSX } from "../gridsheetExports";
import type { GridsheetPDFDayRow } from "../attendanceGridsheet";

// exportGridsheetXLSX triggers a real browser download (Blob/URL/anchor) as its
// last step — same "not tested" boundary the spec draws for downloadCSV/
// downloadXLSX generally (§12). These tests instead call rowsToXLSXSheet's
// sibling primitives directly via a small local re-implementation of the sheet-
// building half of exportGridsheetXLSX, OR (simpler, chosen here) stub
// URL.createObjectURL/document.createElement so the function can run to
// completion in the Node test environment without throwing, and assert on the
// worksheet passed to downloadXLSX by spying on it.
import * as spreadsheetExport from "../spreadsheetExport";
import { vi } from "vitest";

const fixtureRows: GridsheetPDFDayRow[] = [
  {
    dayNum: 1,
    monthDayTotals: { "2026-09": 10, "2026-10": null },
    monthSessions: {
      "2026-09": { malesAM: 3, malesPM: 2, femalesAM: 3, femalesPM: 2 },
      "2026-10": {
        malesAM: null,
        malesPM: null,
        femalesAM: null,
        femalesPM: null,
      },
    },
    malesTotal: 5,
    femalesTotal: 5,
  },
];

describe("exportGridsheetXLSX", () => {
  it("builds a sheet with the expected merge ranges for a 2-month term", () => {
    const spy = vi
      .spyOn(spreadsheetExport, "downloadXLSX")
      .mockImplementation(() => {});
    exportGridsheetXLSX(
      fixtureRows,
      ["2026-09", "2026-10"],
      {
        id: "t1",
        name: "Term 1",
        startDate: "2026-09-01",
        endDate: "2026-12-15",
      } as never,
      "Grade 10B",
    );
    const [, sheets] = spy.mock.calls[0];
    const ws = sheets[0].sheet;
    expect(ws["!merges"]).toContainEqual({
      s: { r: 0, c: 0 },
      e: { r: 0, c: 1 },
    }); // "Total Attendances" title, 2 months
    expect(ws["A1"].v).toBe("TOTAL ATTENDANCES (each month of term)");
  });
});
```

No test coverage for the actual `Blob`/`URL.createObjectURL`/click mechanics anywhere in this feature, consistent with the spec's own testing plan (§12) and the app's existing precedent of not testing `PDFDownloadLink` usage either.

---

## 9. Implementation Order

1. `npm install @e965/xlsx@0.20.3` (§1).
2. `src/lib/spreadsheetExport.ts` (§2) + `src/lib/__tests__/spreadsheetExport.test.ts` (§8). Run `npm run test` before moving on — everything downstream imports from this file.
3. `src/components/ExportMenu.tsx` (§3). No dedicated test file (spec §12) — sanity-check by wiring it into one page first (step 4) before wiring the other two, so any component-level issue surfaces once, not three times independently.
4. Gridsheet: `src/lib/gridsheetExports.ts` (§4) + its test (§8) + page wiring (§5).
5. Results: page wiring only (§6) — no new lib file, the query/columns/handler live directly in the page per §6.2–§6.4.
6. Report Cards: page wiring only (§7).
7. `npm run lint && npx tsc -b --noEmit` across the whole repo — the new `ExportColumn<T>` generic and the `@e965/xlsx` type imports are the most likely source of a type error worth catching before manual QA.
8. Manual QA pass (§10).

---

## 10. Manual QA Checklist

- [ ] **Gridsheet:** open the register for a class+term with attendance data, open the PDF preview modal, click "Export ▾" → "Download CSV" — file downloads, opens cleanly in a spreadsheet app, header row matches the month/session structure shown in the PDF.
- [ ] Same, "Download XLSX" — merged header cells render correctly (not as separate unmerged cells with the same text repeated), column widths are readable without manual resizing, and the block layout visually matches the PDF for at least one multi-month term. **This is the one part of this plan without a from-code guarantee (§4's merge geometry for the "Total Attendances" block's row-1 sub-header was reconstructed, not copied verbatim from the source spec) — treat this checkbox as the actual verification, not the unit test.**
- [ ] **Results (staff role):** select a class, confirm the Export button is gated behind `selectedClassId` (not visible before a class is chosen). Export CSV — row count and values match what's on screen. Toggle "Include gradebook-originated results" and re-export — row count increases if the class/term has gradebook-originated results.
- [ ] **Results (student/parent role):** confirm no Export button is rendered anywhere on the page, regardless of viewport width.
- [ ] **Report Cards (institution_admin):** export with cards present — file downloads with one row per generated card, Conduct column shows a single letter per student, not blank for students with at least one non-null `conductGrade` on any subject.
- [ ] **Report Cards (non-admin role, incl. super_admin):** confirm no Export button is rendered.
- [ ] Filenames match the documented patterns (spec §11, with the Report Cards `all-classes`/`all-terms` adjustment from §7.4 of this plan) and contain no raw spaces or unsafe characters.
- [ ] Firestore usage tab (or a quick manual read-count estimate): confirm a Results export doesn't fire more reads than the selected filter's matching document count — no accidental full-collection scan.

---

## 11. Risks Carried Forward

- **Legacy `results` documents missing `subjectId`.** Not verifiable from source code alone — requires checking actual production data. Before this ships (or as part of QA), run a one-off check (Firebase console query, or a short throwaway script under `scripts/`) for `results` documents in the live database with no `subjectId` field. If any exist: they will correctly _not_ appear in a subject-filtered export (expected filter behavior, not a bug) but will still appear in an unfiltered or class/term-only export with a blank "Subject" column — confirm that's acceptable, or add an "Unassigned Subject" fallback label if a cleaner display is wanted. This is a pre-existing condition of the `results` collection, not something this feature introduces or worsens.
- **Gridsheet XLSX header geometry** — see the Manual QA checkbox above. The source spec's §18.3 merge table fully details the "Monthly Summaries" block but doesn't specify the "Total Attendances" block's row-1 sub-header; §4 of this plan adds one for parity with the CSV export's per-month columns. Confirm visually before shipping.
- **Self-export for `student`/`parent`** (their own/linked results only) — explicitly out of scope per the spec's §2 decision log; the underlying query would be a straightforward addition later (the identity-scoped queries already exist from the `results-page-overview` branch) but is not part of this plan.
