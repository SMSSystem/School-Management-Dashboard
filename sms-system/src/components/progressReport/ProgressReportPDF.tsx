import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { ProgressReportDocument } from '@/lib/firebase';

// ── layout ────────────────────────────────────────────────────────────────────
// Deliberately a single-page A4 portrait layout — simpler than, and visually
// distinct from, ReportCardPDF.tsx's 4-column landscape pamphlet (see
// docs/progress-report/PROGRESS_REPORT_SPEC.md §9). This mirrors the reference
// screenshot's structure: letterhead, student identity, an as-of date, a
// grades table, a boilerplate note, a signature line, and a grade-key footer.

const GRADE_KEY = [
  ['A+', '95–100%'],
  ['A',  '85–94%'],
  ['A-', '80–84%'],
  ['B+', '75–79%'],
  ['B',  '70–74%'],
  ['B-', '65–69%'],
  ['C+', '60–64%'],
  ['C',  '55–59%'],
  ['C-', '50–54%'],
  ['D+', '45–49%'],
  ['D',  '40–44%'],
  ['D-', '30–39%'],
  ['E',  '0–29%'],
] as const;

const BOILERPLATE =
  'This progress report reflects the student’s academic standing based on grades ' +
  'recorded as of the date shown above. It is an interim snapshot, not a final ' +
  'end-of-term record, and should be read alongside any comments from the student’s ' +
  'teachers. Parents and guardians with questions about the grades shown here should ' +
  'contact the institution directly.';

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1a1a1a',
    padding: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1pt solid #1d4ed8',
    paddingBottom: 8,
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: 40,
    height: 40,
    objectFit: 'contain',
  },
  instName: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
  },
  instContact: {
    fontSize: 7.5,
    color: '#555555',
    marginTop: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  badge: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    backgroundColor: '#1d4ed8',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 3,
  },
  termLine: {
    fontSize: 8.5,
    marginTop: 3,
    color: '#333333',
  },
  studentBlock: {
    marginBottom: 4,
  },
  reportFor: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  className: {
    fontSize: 9,
    color: '#444444',
    marginTop: 1,
  },
  asOf: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Oblique',
    color: '#555555',
    marginBottom: 14,
  },
  table: {
    borderTop: '1pt solid #cccccc',
    borderLeft: '1pt solid #cccccc',
  },
  tblHdrRow: {
    flexDirection: 'row',
    backgroundColor: '#dbeafe',
  },
  tblRow: {
    flexDirection: 'row',
  },
  tblRowAlt: {
    backgroundColor: '#f8fafc',
  },
  tblCellSubject: {
    flex: 3,
    padding: 5,
    borderRight: '1pt solid #cccccc',
    borderBottom: '1pt solid #cccccc',
  },
  tblCellAvg: {
    flex: 1,
    padding: 5,
    borderRight: '1pt solid #cccccc',
    borderBottom: '1pt solid #cccccc',
    textAlign: 'center',
  },
  tblCellGrade: {
    flex: 1,
    padding: 5,
    borderRight: '1pt solid #cccccc',
    borderBottom: '1pt solid #cccccc',
    textAlign: 'center',
  },
  tblCellTeacher: {
    flex: 2,
    padding: 5,
    borderRight: '1pt solid #cccccc',
    borderBottom: '1pt solid #cccccc',
  },
  tblHdrTxt: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  tblTxt: {
    fontSize: 8.5,
  },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
  },
  totalLabel: {
    flex: 3,
    padding: 5,
    borderRight: '1pt solid #cccccc',
    borderBottom: '1pt solid #cccccc',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
  },
  totalValue: {
    flex: 1,
    padding: 5,
    borderRight: '1pt solid #cccccc',
    borderBottom: '1pt solid #cccccc',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textAlign: 'center',
  },
  totalSpacer: {
    flex: 3,
    borderRight: '1pt solid #cccccc',
    borderBottom: '1pt solid #cccccc',
  },
  boilerplate: {
    fontSize: 7.5,
    color: '#444444',
    lineHeight: 1.4,
    marginTop: 16,
  },
  sigBlock: {
    marginTop: 22,
  },
  sigImage: {
    width: 90,
    height: 30,
    objectFit: 'contain',
    marginBottom: 3,
  },
  sigText: {
    fontSize: 11,
    fontFamily: 'Helvetica-Oblique',
    marginBottom: 3,
  },
  sigLine: {
    width: 160,
    borderTop: '0.75pt solid #333333',
    paddingTop: 2,
  },
  sigLabel: {
    fontSize: 7.5,
    color: '#555555',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 32,
    right: 32,
  },
  footerLabel: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#666666',
    marginBottom: 3,
  },
  keyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  keyItem: {
    fontSize: 6,
    color: '#666666',
    marginRight: 8,
    marginBottom: 2,
  },
});

interface Props {
  data: ProgressReportDocument;
}

export const ProgressReportPDF = ({ data }: Props) => {
  const asOf = data.generatedAt?.toDate?.()?.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }) ?? '—';

  return (
    <Document>
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <View style={S.headerLeft}>
            {data.institutionLogoUrl && (
              <Image src={data.institutionLogoUrl} style={S.logo} />
            )}
            <View>
              <Text style={S.instName}>{data.institutionName}</Text>
              {data.institutionAddress && (
                <Text style={S.instContact}>{data.institutionAddress}</Text>
              )}
              {data.institutionPhone && (
                <Text style={S.instContact}>Tel: {data.institutionPhone}</Text>
              )}
            </View>
          </View>
          <View style={S.headerRight}>
            <Text style={S.badge}>PROGRESS REPORT — {data.academicYearName}</Text>
            <Text style={S.termLine}>{data.termName}</Text>
          </View>
        </View>

        <View style={S.studentBlock}>
          <Text style={S.reportFor}>Report For: {data.studentName}</Text>
          <Text style={S.className}>{data.className}</Text>
        </View>
        <Text style={S.asOf}>As of {asOf}</Text>

        <View style={S.table}>
          <View style={S.tblHdrRow}>
            <View style={S.tblCellSubject}><Text style={S.tblHdrTxt}>SUBJECT</Text></View>
            <View style={S.tblCellAvg}><Text style={S.tblHdrTxt}>AVERAGE</Text></View>
            <View style={S.tblCellGrade}><Text style={S.tblHdrTxt}>LETTER GRADE</Text></View>
            <View style={S.tblCellTeacher}><Text style={S.tblHdrTxt}>TEACHER</Text></View>
          </View>

          {data.subjects.map((s, i) => (
            <View key={s.subjectId} style={[S.tblRow, i % 2 === 1 ? S.tblRowAlt : {}]}>
              <View style={S.tblCellSubject}><Text style={S.tblTxt}>{s.subjectName}</Text></View>
              <View style={S.tblCellAvg}><Text style={S.tblTxt}>{s.average.toFixed(1)}%</Text></View>
              <View style={S.tblCellGrade}><Text style={S.tblTxt}>{s.letterGrade}</Text></View>
              <View style={S.tblCellTeacher}><Text style={S.tblTxt}>{s.teacherName || '—'}</Text></View>
            </View>
          ))}

          <View style={S.totalRow}>
            <View style={S.totalLabel}><Text>Overall Average</Text></View>
            <View style={S.totalValue}>
              <Text>{data.overallAverage !== null ? `${data.overallAverage.toFixed(1)}%` : '—'}</Text>
            </View>
            <View style={S.totalSpacer} />
          </View>
        </View>

        <Text style={S.boilerplate}>{BOILERPLATE}</Text>

        <View style={S.sigBlock}>
          {data.authorizedSignature?.mode === 'image' && data.authorizedSignature.imageUrl ? (
            <Image src={data.authorizedSignature.imageUrl} style={S.sigImage} />
          ) : data.authorizedSignature?.mode === 'text' ? (
            <Text style={S.sigText}>{data.authorizedSignature.text}</Text>
          ) : (
            <Text style={{ fontSize: 8, color: '#aaaaaa', marginBottom: 3 }}>Not configured</Text>
          )}
          <View style={S.sigLine}>
            <Text style={S.sigLabel}>{data.principalLabel}</Text>
          </View>
        </View>

        <View style={S.footer}>
          <Text style={S.footerLabel}>KEY TO LETTER GRADES</Text>
          <View style={S.keyRow}>
            {GRADE_KEY.map(([g, r]) => (
              <Text key={g} style={S.keyItem}>{g} = {r}</Text>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
};
