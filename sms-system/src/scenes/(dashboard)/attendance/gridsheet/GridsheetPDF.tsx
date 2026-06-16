import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { GridsheetData } from '@/lib/attendanceGridsheet';
import { computeGridsheetPDF } from '@/lib/attendanceGridsheet';

// ─── Column widths (points) ───────────────────────────────────────────────────
const W_M  = 40;  // A–D monthly-total cols + session data cols (F-Y)
const W_CF = 68;  // E (Carried Forward placeholder)
const W_T  = 52;  // Z, AA (Males/Females totals)

// ─── Row heights (points) ────────────────────────────────────────────────────
const H1 = 22;  // Row 1: primary header
const HS = 12;  // Rows 2–4: sub-header rows
const HA = 12;  // Row 5: alignment row (AM/PM labels, month abbreviations)
const HD = 11;  // Data rows (01–31)

const SUB_H  = HS * 3 + HA;  // 48 — combined height of header rows 2–5
const HDR_H  = H1 + SUB_H;   // 70 — total header block height

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    padding: 14,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  row: { flexDirection: 'row' },
  cell: {
    borderWidth: 0.5,
    borderColor: '#000000',
    borderStyle: 'solid',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 1,
  },
  tPrimary: { fontSize: 7,   textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  tb:       { fontSize: 5.5, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  t:        { fontSize: 5.5, textAlign: 'center' },
  tSm:      { fontSize: 4.5, textAlign: 'center' },
  tData:    { fontSize: 5.5, textAlign: 'center' },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTermEnd(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function monthFull(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long' });
}

function monthAbbr(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1)
    .toLocaleDateString('en-US', { month: 'short' })
    .toUpperCase();
}

function fmtVal(v: number | null | undefined): string {
  return v == null ? '' : String(v);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface GridsheetPDFProps {
  data: GridsheetData;
  termEndDate: string;
  className?: string;
}

export function GridsheetPDF({ data, termEndDate, className }: GridsheetPDFProps) {
  const pdfRows = computeGridsheetPDF(data);
  const { monthKeys } = data;
  // A–D columns cover at most 4 months
  const shownMonths = monthKeys.slice(0, 4);
  // Width of the right section (month groups + TOTAL)
  const rightW = monthKeys.length * 5 * W_M + 2 * W_T;

  return (
    <Document title={`Attendance Register${className ? ' — ' + className : ''}`}>
      <Page size="A3" orientation="landscape" style={styles.page}>

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <View style={styles.row}>

          {/* A–D: monthly total columns */}
          <View style={{ width: 4 * W_M }}>
            {/* Rows 1–4 merged */}
            <View style={[styles.cell, { height: H1 + 3 * HS }]}>
              <Text style={styles.tPrimary}>
                {'TOTAL ATTENDANCES\n(each month of term)'}
              </Text>
            </View>
            {/* Row 5: month abbreviations */}
            <View style={styles.row}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.cell, { width: W_M, height: HA }]}>
                  <Text style={styles.tb}>
                    {i < shownMonths.length ? monthAbbr(shownMonths[i]) : ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* E: Carried Forward — spans all 5 header rows */}
          <View style={[styles.cell, { width: W_CF, height: HDR_H }]}>
            <Text style={styles.t}>C / F</Text>
          </View>

          {/* Right section: MONTHLY SUMMARIES */}
          <View style={{ flexDirection: 'column', width: rightW }}>

            {/* Row 1: primary header */}
            <View style={[styles.cell, { width: rightW, height: H1 }]}>
              <Text style={styles.tPrimary}>
                {'MONTHLY SUMMARIES FOR TERM ENDING ' + fmtTermEnd(termEndDate)}
              </Text>
            </View>

            {/* Rows 2–5: month group sub-headers + TOTAL */}
            <View style={styles.row}>

              {/* One group per month (F–J, K–O, P–T, U–Y) */}
              {monthKeys.map((mk) => (
                <View key={mk} style={{ flexDirection: 'row', width: 5 * W_M }}>

                  {/* "Date of Month" column — spans rows 2–5 */}
                  <View style={[styles.cell, { width: W_M, height: SUB_H }]}>
                    <Text style={styles.tSm}>{'Date\nof\nMonth'}</Text>
                  </View>

                  {/* 4 session columns — stacked sub-header rows */}
                  <View style={{ flexDirection: 'column', width: 4 * W_M }}>
                    {/* Row 2: month name */}
                    <View style={[styles.cell, { height: HS }]}>
                      <Text style={styles.tb}>{monthFull(mk)}</Text>
                    </View>
                    {/* Row 3: Males | Females */}
                    <View style={styles.row}>
                      <View style={[styles.cell, { width: 2 * W_M, height: HS }]}>
                        <Text style={styles.tb}>Males</Text>
                      </View>
                      <View style={[styles.cell, { width: 2 * W_M, height: HS }]}>
                        <Text style={styles.tb}>Females</Text>
                      </View>
                    </View>
                    {/* Row 4: Session */}
                    <View style={[styles.cell, { height: HS }]}>
                      <Text style={styles.t}>Session</Text>
                    </View>
                    {/* Row 5: AM | PM | AM | PM */}
                    <View style={styles.row}>
                      {(['AM', 'PM', 'AM', 'PM'] as const).map((lbl, i) => (
                        <View key={i} style={[styles.cell, { width: W_M, height: HA }]}>
                          <Text style={styles.tb}>{lbl}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                </View>
              ))}

              {/* TOTAL group (Z–AA) */}
              <View style={{ flexDirection: 'column', width: 2 * W_T }}>
                {/* Rows 2–4 merged */}
                <View style={[styles.cell, { height: 3 * HS }]}>
                  <Text style={styles.tb}>TOTAL</Text>
                </View>
                {/* Row 5: Males | Females */}
                <View style={styles.row}>
                  <View style={[styles.cell, { width: W_T, height: HA }]}>
                    <Text style={styles.tb}>Males</Text>
                  </View>
                  <View style={[styles.cell, { width: W_T, height: HA }]}>
                    <Text style={styles.tb}>Females</Text>
                  </View>
                </View>
              </View>

            </View>
          </View>
        </View>

        {/* ── DATA ROWS 01–31 ─────────────────────────────────────────────── */}
        {pdfRows.map((pr) => {
          const dd = String(pr.dayNum).padStart(2, '0');
          return (
            <View key={pr.dayNum} style={[styles.row, { height: HD }]}>

              {/* A–D: per-month totals (up to 4 months) */}
              {[0, 1, 2, 3].map((i) => {
                const mk = shownMonths[i];
                return (
                  <View key={i} style={[styles.cell, { width: W_M, height: HD }]}>
                    <Text style={styles.tData}>
                      {mk != null ? fmtVal(pr.monthDayTotals[mk]) : ''}
                    </Text>
                  </View>
                );
              })}

              {/* E: C/F — always blank */}
              <View style={[styles.cell, { width: W_CF, height: HD }]} />

              {/* Month groups */}
              {monthKeys.map((mk) => {
                const s = pr.monthSessions[mk];
                return (
                  <View key={mk} style={{ flexDirection: 'row', width: 5 * W_M, height: HD }}>
                    {/* Date of Month */}
                    <View style={[styles.cell, { width: W_M, height: HD }]}>
                      <Text style={styles.tData}>{dd}</Text>
                    </View>
                    {/* Males AM */}
                    <View style={[styles.cell, { width: W_M, height: HD }]}>
                      <Text style={styles.tData}>{fmtVal(s?.malesAM)}</Text>
                    </View>
                    {/* Males PM */}
                    <View style={[styles.cell, { width: W_M, height: HD }]}>
                      <Text style={styles.tData}>{fmtVal(s?.malesPM)}</Text>
                    </View>
                    {/* Females AM */}
                    <View style={[styles.cell, { width: W_M, height: HD }]}>
                      <Text style={styles.tData}>{fmtVal(s?.femalesAM)}</Text>
                    </View>
                    {/* Females PM */}
                    <View style={[styles.cell, { width: W_M, height: HD }]}>
                      <Text style={styles.tData}>{fmtVal(s?.femalesPM)}</Text>
                    </View>
                  </View>
                );
              })}

              {/* Z: Males total */}
              <View style={[styles.cell, { width: W_T, height: HD }]}>
                <Text style={styles.tData}>{fmtVal(pr.malesTotal)}</Text>
              </View>
              {/* AA: Females total */}
              <View style={[styles.cell, { width: W_T, height: HD }]}>
                <Text style={styles.tData}>{fmtVal(pr.femalesTotal)}</Text>
              </View>

            </View>
          );
        })}

      </Page>
    </Document>
  );
}
