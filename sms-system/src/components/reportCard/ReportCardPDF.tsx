import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import { COMMENT_KEY } from '@/lib/commentKey';
import type { ReportCardDocument } from '@/lib/firebase';

// ── helpers ───────────────────────────────────────────────────────────────────

const trunc = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + '…' : s;

const teacherAbbr = (name: string): string => {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return trunc(parts[0], 9);
  return trunc(`${parts[0][0]}. ${parts[parts.length - 1]}`, 9);
};

const commentFontSize = (text: string): number =>
  text.length > 350 ? 5 : text.length > 180 ? 5.5 : 6.5;

// ── layout constants ──────────────────────────────────────────────────────────

const P_PAD = 3;       // page outer padding (pt)
const FOOTER_H = 9;    // reserved height for the print-note footer
const COL_PAD = 4;     // horizontal padding per column
const DIV_W = 0.5;     // column-divider width

// A4 landscape: 841.89 × 595.28 pt
// Usable width: 842 - 2*3 = 836 pt
// 4 columns: (836 - 3*0.5) / 4 ≈ 208.6 pt per column
// Inner width: 208.6 - 2*4 = 200.6 ≈ 200 pt

const TBL_HDR_H = 48;  // header row height (tall enough for rotated text)
const TBL_ROW_H = 11;  // data row height

// Subject-table column widths — must sum to ≈ 200
const SW = {
  subject: 63,
  cw:      16,
  exam:    16,
  final:   18,
  grade:   15,
  pos:     15,
  cond:    15,
  teacher: 30,
  num:     12,
} as const;
// 63+16+16+18+15+15+15+30+12 = 200 ✓

// ── styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 7,
    color: '#1a1a1a',
    padding: P_PAD,
    paddingBottom: P_PAD + FOOTER_H,
    flexDirection: 'column',
  },
  cols: {
    flex: 1,
    flexDirection: 'row',
  },
  col: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: COL_PAD,
    overflow: 'hidden',
  },
  divider: {
    width: DIV_W,
    backgroundColor: '#bbbbbb',
  },
  secLabel: {
    fontSize: 5.5,
    fontFamily: 'Helvetica-Bold',
    color: '#1d4ed8',
    borderBottom: '0.5pt solid #1d4ed8',
    paddingBottom: 1,
    marginTop: 5,
    marginBottom: 2,
  },
  kv: {
    flexDirection: 'row',
    marginBottom: 1.5,
  },
  kvKey: {
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
    width: 68,
  },
  kvVal: {
    fontSize: 6,
    flex: 1,
  },
  bullet: {
    fontSize: 6,
    marginBottom: 1,
  },
  // subjects table
  tblHdrRow: {
    flexDirection: 'row',
    backgroundColor: '#dbeafe',
    borderBottom: '0.5pt solid #93c5fd',
  },
  tblRow: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #e5e7eb',
    minHeight: TBL_ROW_H,
  },
  tblRowAlt: {
    backgroundColor: '#f8fafc',
  },
  // vertical-text header cell (for narrow columns)
  vhCell: {
    overflow: 'hidden',
    position: 'relative',
    height: TBL_HDR_H,
  },
  // horizontal-text header cell (for Subject and Teacher)
  hhCell: {
    height: TBL_HDR_H,
    justifyContent: 'flex-end',
    paddingBottom: 3,
    paddingHorizontal: 2,
  },
  hhText: {
    fontSize: 5.5,
    fontFamily: 'Helvetica-Bold',
  },
  tblCell: {
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  tblCellTxt: {
    fontSize: 6,
  },
  // key tables (grades, conduct)
  keyRow: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #e5e7eb',
    paddingVertical: 1.5,
  },
  keyCode: {
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
    width: 26,
  },
  keyLabel: {
    fontSize: 6,
    flex: 1,
  },
  // Key to Comments — 2-sub-column grid
  ckGrid: {
    flexDirection: 'row',
    gap: 3,
  },
  ckCol: {
    flex: 1,
  },
  ckItem: {
    fontSize: 5,
    marginBottom: 1.5,
    lineHeight: 1.2,
  },
  // front cover
  coverLogo: {
    width: 64,
    height: 64,
    objectFit: 'contain',
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  coverName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 2,
  },
  coverMotto: {
    fontSize: 6,
    fontFamily: 'Helvetica-Oblique',
    textAlign: 'center',
    color: '#444444',
    marginBottom: 2,
  },
  coverContact: {
    fontSize: 5.5,
    textAlign: 'center',
    color: '#555555',
    marginBottom: 1,
  },
  coverSep: {
    borderTop: '0.5pt solid #cccccc',
    marginVertical: 6,
  },
  coverTitle: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  coverStudent: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 3,
  },
  coverDetail: {
    fontSize: 6.5,
    textAlign: 'center',
    marginBottom: 2,
  },
  coverMetricRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 6,
  },
  coverMetricItem: {
    alignItems: 'center',
  },
  coverMetricLbl: {
    fontSize: 5,
    color: '#666666',
  },
  coverMetricVal: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  sigImage: {
    width: 80,
    height: 28,
    objectFit: 'contain',
    marginTop: 4,
  },
  sigText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Oblique',
    marginTop: 4,
  },
  printNote: {
    position: 'absolute',
    bottom: P_PAD,
    left: P_PAD,
    right: P_PAD,
    fontSize: 5.5,
    color: '#aaaaaa',
    textAlign: 'center',
  },
});

// ── static keys ───────────────────────────────────────────────────────────────

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

const CONDUCT_KEY = [
  ['G', 'Good'],
  ['S', 'Satisfactory'],
  ['F', 'Fair'],
  ['U', 'Unsatisfactory'],
  ['P', 'Poor'],
  ['D', 'Disruption'],
] as const;

// ── sub-components ────────────────────────────────────────────────────────────

// Renders text rotated -90° inside a cell of dimensions width × TBL_HDR_H.
// Math: inner view is TBL_HDR_H × width; positioned so its center aligns with
// the cell center; rotating -90° around that center makes it width × TBL_HDR_H.
const VHeader = ({ label, width }: { label: string; width: number }) => {
  const innerW = TBL_HDR_H;
  const innerH = width;
  const top  = TBL_HDR_H / 2 - width / 2;
  const left = width / 2 - TBL_HDR_H / 2;
  return (
    <View style={[S.vhCell, { width }]}>
      <View
        style={{
          position: 'absolute',
          top,
          left,
          width: innerW,
          height: innerH,
          transform: 'rotate(-90deg)',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 5.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' }}>
          {label}
        </Text>
      </View>
    </View>
  );
};

const SecLabel = ({ children }: { children: string }) => (
  <Text style={S.secLabel}>{children}</Text>
);

const KV = ({ label, value }: { label: string; value: string }) => (
  <View style={S.kv}>
    <Text style={S.kvKey}>{label}:</Text>
    <Text style={S.kvVal}>{value}</Text>
  </View>
);

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  data: ReportCardDocument;
}

export const ReportCardPDF = ({ data }: Props) => (
  <Document>
    {/*
      Single A4 landscape page — 4 equal columns.
      Left-to-right: Back Cover | Inner Left | Inner Right | Front Cover
      Fold vertically down the centre to form a 4-panel pamphlet.
    */}
    <Page size="A4" orientation="landscape" style={S.page}>
      <View style={S.cols}>

        {/* ── COL 1 — BACK COVER: Keys + Next Term + Signature ─────────── */}
        <View style={S.col}>
          <SecLabel>KEY TO LETTER GRADES</SecLabel>
          {GRADE_KEY.map(([g, r]) => (
            <View key={g} style={S.keyRow}>
              <Text style={S.keyCode}>{g}</Text>
              <Text style={S.keyLabel}>{r}</Text>
            </View>
          ))}

          <SecLabel>KEY TO CONDUCT</SecLabel>
          {CONDUCT_KEY.map(([c, m]) => (
            <View key={c} style={S.keyRow}>
              <Text style={S.keyCode}>{c}</Text>
              <Text style={S.keyLabel}>{m}</Text>
            </View>
          ))}

          <SecLabel>KEY TO COMMENTS</SecLabel>
          <View style={S.ckGrid}>
            <View style={S.ckCol}>
              {COMMENT_KEY.slice(0, 10).map((text, i) => (
                <Text key={i} style={S.ckItem}>{i + 1}. {text}</Text>
              ))}
            </View>
            <View style={S.ckCol}>
              {COMMENT_KEY.slice(10).map((text, i) => (
                <Text key={i + 10} style={S.ckItem}>{i + 11}. {text}</Text>
              ))}
            </View>
          </View>

          <SecLabel>NEXT TERM BEGINS</SecLabel>
          <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }}>
            {data.nextTermStart
              ? new Date(data.nextTermStart).toLocaleDateString('en-JM', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : 'To be announced'}
          </Text>

          <SecLabel>AUTHORIZED SIGNATURE</SecLabel>
          {data.authorizedSignature?.mode === 'image' &&
          data.authorizedSignature.imageUrl ? (
            <Image src={data.authorizedSignature.imageUrl} style={S.sigImage} />
          ) : data.authorizedSignature?.mode === 'text' ? (
            <Text style={S.sigText}>{data.authorizedSignature.text}</Text>
          ) : (
            <Text style={{ fontSize: 5.5, color: '#aaaaaa' }}>Not configured</Text>
          )}
        </View>

        <View style={S.divider} />

        {/* ── COL 2 — INNER LEFT: Summary + Attendance + Activities + Comments */}
        <View style={S.col}>
          <SecLabel>STUDENT SUMMARY</SecLabel>
          <KV label="Academic Year"   value={data.academicYearName} />
          <KV label="Term"            value={data.termName} />
          <KV label="Class"           value={data.className} />
          <KV label="Date of Birth"   value={data.dateOfBirth ?? '—'} />
          <KV label="Student ID"      value={data.institutionStudentId ?? '—'} />
          <KV label="House"           value={data.houseName ?? '—'} />
          <KV label="GPA"             value={data.gpa !== null ? data.gpa.toFixed(2) : '—'} />
          <KV
            label="Class Rank"
            value={
              data.classRank !== null
                ? `${data.classRank} / ${data.classPopulation}`
                : '—'
            }
          />
          <KV
            label="Student Average"
            value={data.studentAverage !== null ? `${data.studentAverage.toFixed(1)}%` : '—'}
          />
          <KV
            label="Class Average"
            value={data.classAverage !== null ? `${data.classAverage.toFixed(1)}%` : '—'}
          />

          <SecLabel>ATTENDANCE</SecLabel>
          <KV label="Total Sessions" value={String(data.totalPossibleSessions)} />
          <KV label="Absent"         value={String(data.sessionsAbsent)} />
          <KV label="Days Late"      value={String(data.daysLate)} />

          {data.extraCurricularActivities.length > 0 && (
            <View>
              <SecLabel>EXTRA CURRICULAR ACTIVITIES</SecLabel>
              {data.extraCurricularActivities.map((a, i) => (
                <Text key={i} style={S.bullet}>{'•'} {a}</Text>
              ))}
            </View>
          )}

          {data.positionsOfResponsibility.length > 0 && (
            <View>
              <SecLabel>POSITIONS OF RESPONSIBILITY</SecLabel>
              {data.positionsOfResponsibility.map((p, i) => (
                <Text key={i} style={S.bullet}>
                  {'•'} {p.title}{p.organisation ? ` — ${p.organisation}` : ''}
                </Text>
              ))}
            </View>
          )}

          <SecLabel>COMMENTS</SecLabel>
          {(
            [
              [data.classSupervisorLabel,  data.classSupervisorComment],
              [data.gradeSupervisorLabel,  data.gradeSupervisorComment],
              [data.principalLabel,        data.principalComment],
              [data.vicePrincipalLabel,    data.vicePrincipalComment],
            ] as [string, string][]
          ).map(([label, comment]) => (
            <View key={label} style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 5.5, fontFamily: 'Helvetica-Bold', marginBottom: 1 }}>
                {label}
              </Text>
              <Text style={{ fontSize: commentFontSize(comment || ''), color: comment ? '#111111' : '#aaaaaa' }}>
                {comment || '—'}
              </Text>
            </View>
          ))}
        </View>

        <View style={S.divider} />

        {/* ── COL 3 — INNER RIGHT: Subjects Table ──────────────────────── */}
        <View style={S.col}>
          <SecLabel>SUBJECTS</SecLabel>

          {/* Header row */}
          <View style={S.tblHdrRow}>
            <View style={[S.hhCell, { width: SW.subject }]}>
              <Text style={S.hhText}>Subject</Text>
            </View>
            <VHeader label={'CW\n%'}   width={SW.cw} />
            <VHeader label={'Exam\n%'} width={SW.exam} />
            <VHeader label={'Final\n%'} width={SW.final} />
            <VHeader label="Grade"    width={SW.grade} />
            <VHeader label="Pos"      width={SW.pos} />
            <VHeader label="Cond"     width={SW.cond} />
            <View style={[S.hhCell, { width: SW.teacher }]}>
              <Text style={S.hhText}>Teacher</Text>
            </View>
            <VHeader label="#"        width={SW.num} />
          </View>

          {/* Data rows */}
          {data.subjects.map((s, i) => (
            <View
              key={s.subjectId}
              style={[S.tblRow, i % 2 === 1 ? S.tblRowAlt : {}]}
            >
              <View style={[S.tblCell, { width: SW.subject }]}>
                <Text style={[S.tblCellTxt, { fontSize: 5.5 }]}>
                  {trunc(s.subjectName, 18)}
                </Text>
              </View>
              <View style={[S.tblCell, { width: SW.cw }]}>
                <Text style={S.tblCellTxt}>
                  {s.cwGrade !== null ? s.cwGrade.toFixed(1) : '—'}
                </Text>
              </View>
              <View style={[S.tblCell, { width: SW.exam }]}>
                <Text style={S.tblCellTxt}>
                  {s.examGrade !== null ? s.examGrade.toFixed(1) : '—'}
                </Text>
              </View>
              <View style={[S.tblCell, { width: SW.final }]}>
                <Text style={S.tblCellTxt}>{s.finalGrade.toFixed(1)}</Text>
              </View>
              <View style={[S.tblCell, { width: SW.grade }]}>
                <Text style={[S.tblCellTxt, { fontFamily: 'Helvetica-Bold' }]}>
                  {s.letterGrade}
                </Text>
              </View>
              <View style={[S.tblCell, { width: SW.pos }]}>
                <Text style={S.tblCellTxt}>
                  {s.subjectPosition !== null ? String(s.subjectPosition) : '—'}
                </Text>
              </View>
              <View style={[S.tblCell, { width: SW.cond }]}>
                <Text style={[S.tblCellTxt, { fontFamily: 'Helvetica-Bold' }]}>
                  {s.conductGrade ?? '—'}
                </Text>
              </View>
              <View style={[S.tblCell, { width: SW.teacher }]}>
                <Text style={[S.tblCellTxt, { fontSize: 5.5 }]}>
                  {teacherAbbr(s.teacherName)}
                </Text>
              </View>
              <View style={[S.tblCell, { width: SW.num }]}>
                <Text style={S.tblCellTxt}>
                  {s.commentNumbers && s.commentNumbers.length > 0 ? s.commentNumbers.join(', ') : '—'}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={S.divider} />

        {/* ── COL 4 — FRONT COVER: Branding + Student Identity ─────────── */}
        <View style={S.col}>
          {data.institutionLogoUrl && (
            <Image src={data.institutionLogoUrl} style={S.coverLogo} />
          )}
          <Text style={S.coverName}>{data.institutionName}</Text>
          {data.institutionMotto && (
            <Text style={S.coverMotto}>{data.institutionMotto}</Text>
          )}
          {data.institutionAddress && (
            <Text style={S.coverContact}>{data.institutionAddress}</Text>
          )}
          {data.institutionPhone && (
            <Text style={S.coverContact}>Tel: {data.institutionPhone}</Text>
          )}
          {data.institutionEmail && (
            <Text style={S.coverContact}>{data.institutionEmail}</Text>
          )}

          <View style={S.coverSep} />
          <Text style={S.coverTitle}>STUDENT'S REPORT CARD</Text>

          <Text style={S.coverStudent}>{data.studentName}</Text>
          <Text style={S.coverDetail}>{data.className}</Text>
          <Text style={S.coverDetail}>{data.termName}</Text>
          <Text style={S.coverDetail}>{data.academicYearName}</Text>
          {data.houseName ? (
            <Text style={S.coverDetail}>House: {data.houseName}</Text>
          ) : null}
          {data.institutionStudentId ? (
            <Text style={S.coverDetail}>ID: {data.institutionStudentId}</Text>
          ) : null}

          <View style={S.coverSep} />

          <View style={S.coverMetricRow}>
            <View style={S.coverMetricItem}>
              <Text style={S.coverMetricLbl}>GPA</Text>
              <Text style={S.coverMetricVal}>
                {data.gpa !== null ? data.gpa.toFixed(2) : '—'}
              </Text>
            </View>
            <View style={S.coverMetricItem}>
              <Text style={S.coverMetricLbl}>RANK</Text>
              <Text style={S.coverMetricVal}>
                {data.classRank !== null
                  ? `${data.classRank}/${data.classPopulation}`
                  : '—'}
              </Text>
            </View>
            <View style={S.coverMetricItem}>
              <Text style={S.coverMetricLbl}>AVG</Text>
              <Text style={S.coverMetricVal}>
                {data.studentAverage !== null
                  ? `${data.studentAverage.toFixed(0)}%`
                  : '—'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={S.printNote}>
        Print single-sided on A4 landscape. Fold in half (left edge meets right edge) to form a 4-panel pamphlet.
      </Text>
    </Page>
  </Document>
);
