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

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 24,
    color: '#1a1a1a',
  },
  coverPage: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 24,
    color: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  heading: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  subheading: {
    fontSize: 11,
    textAlign: 'center',
    color: '#444444',
  },
  logo: {
    width: 80,
    height: 80,
    objectFit: 'contain',
  },
  table: {
    width: '100%',
    marginTop: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #cccccc',
    paddingVertical: 3,
  },
  tableHeader: {
    backgroundColor: '#e0f2fe',
    fontFamily: 'Helvetica-Bold',
  },
  cell: {
    flex: 1,
    fontSize: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginTop: 12,
    marginBottom: 4,
    borderBottom: '1pt solid #1d4ed8',
    paddingBottom: 2,
    color: '#1d4ed8',
  },
  printNote: {
    position: 'absolute',
    bottom: 12,
    left: 24,
    right: 24,
    fontSize: 7,
    color: '#aaaaaa',
    textAlign: 'center',
  },
});

const PRINT_NOTE = 'Print double-sided (flip on short edge) and fold vertically to form pamphlet.';

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

const TABLE_HEADERS = ['Subject', 'CW', 'Exam', 'Final', 'Grade', 'Pos', 'Cond', 'Teacher', '#'];

interface Props {
  data: ReportCardDocument;
}

export const ReportCardPDF = ({ data }: Props) => (
  <Document>
    {/* Page 1 — Front Cover */}
    <Page size="A4" style={styles.coverPage}>
      {data.institutionLogoUrl && (
        <Image src={data.institutionLogoUrl} style={styles.logo} />
      )}
      <Text style={styles.heading}>{data.institutionName}</Text>
      {data.institutionMotto && (
        <Text style={styles.subheading}>{data.institutionMotto}</Text>
      )}
      <Text style={[styles.subheading, { marginTop: 16 }]}>
        Student's Report Card
      </Text>
      <Text style={{ fontSize: 13, marginTop: 8 }}>{data.studentName}</Text>
      <Text style={{ fontSize: 10, color: '#555555' }}>{data.termName}</Text>
      <Text style={{ fontSize: 10, color: '#555555' }}>{data.academicYearName}</Text>
      <Text style={styles.printNote}>{PRINT_NOTE}</Text>
    </Page>

    {/* Page 2 — Inner Left: Summary + Attendance + Activities */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionTitle}>Student Summary</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {(
          [
            ['Academic Year', data.academicYearName],
            ['Term', data.termName],
            ['Class', data.className],
            ['Date of Birth', data.dateOfBirth ?? '—'],
            ['Student ID', data.institutionStudentId ?? '—'],
            ['House', data.houseName ?? '—'],
            ['GPA', data.gpa !== null ? data.gpa.toFixed(2) : '—'],
            [
              'Class Rank',
              data.classRank !== null
                ? `${data.classRank} / ${data.classPopulation}`
                : '—',
            ],
            [
              'Student Average',
              data.studentAverage !== null
                ? `${data.studentAverage.toFixed(1)}%`
                : '—',
            ],
            [
              'Class Average',
              data.classAverage !== null
                ? `${data.classAverage.toFixed(1)}%`
                : '—',
            ],
          ] as [string, string][]
        ).map(([label, value]) => (
          <View
            key={label}
            style={{ width: '48%', flexDirection: 'row', gap: 4, marginBottom: 2 }}
          >
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8, width: 90 }}>
              {label}:
            </Text>
            <Text style={{ fontSize: 8 }}>{value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Attendance Sessions</Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Text style={{ fontSize: 8 }}>
          Total Possible: {data.totalPossibleSessions}
        </Text>
        <Text style={{ fontSize: 8 }}>Absent: {data.sessionsAbsent}</Text>
        <Text style={{ fontSize: 8 }}>Late: {data.daysLate}</Text>
      </View>

      {data.extraCurricularActivities.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Extra Curricular Activities</Text>
          {data.extraCurricularActivities.map((a, i) => (
            <Text key={i} style={{ fontSize: 8 }}>
              • {a}
            </Text>
          ))}
        </>
      )}

      {data.positionsOfResponsibility.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Positions of Responsibility</Text>
          {data.positionsOfResponsibility.map((p, i) => (
            <Text key={i} style={{ fontSize: 8 }}>
              • {p.title}
              {p.organisation ? ` — ${p.organisation}` : ''}
            </Text>
          ))}
        </>
      )}

      <Text style={styles.printNote}>{PRINT_NOTE}</Text>
    </Page>

    {/* Page 3 — Inner Right: Subjects Table + Comments + Key to Comments */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionTitle}>Subjects</Text>
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeader]}>
          {TABLE_HEADERS.map((h) => (
            <Text key={h} style={styles.cell}>{h}</Text>
          ))}
        </View>
        {data.subjects.map((s, i) => (
          <View
            key={s.subjectId}
            style={[
              styles.tableRow,
              i % 2 === 1 ? { backgroundColor: '#f8fafc' } : {},
            ]}
          >
            <Text style={styles.cell}>{s.subjectName}</Text>
            <Text style={styles.cell}>
              {s.cwGrade !== null ? s.cwGrade.toFixed(1) : '—'}
            </Text>
            <Text style={styles.cell}>
              {s.examGrade !== null ? s.examGrade.toFixed(1) : '—'}
            </Text>
            <Text style={styles.cell}>{s.finalGrade.toFixed(1)}</Text>
            <Text style={styles.cell}>{s.letterGrade}</Text>
            <Text style={styles.cell}>
              {s.subjectPosition !== null ? s.subjectPosition : '—'}
            </Text>
            <Text style={styles.cell}>{s.conductGrade ?? '—'}</Text>
            <Text style={styles.cell}>{s.teacherName}</Text>
            <Text style={styles.cell}>
              {s.commentNumber !== null ? s.commentNumber : '—'}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Comments</Text>
      {(
        [
          [data.classSupervisorLabel, data.classSupervisorComment],
          [data.gradeSupervisorLabel, data.gradeSupervisorComment],
          [data.principalLabel, data.principalComment],
          [data.vicePrincipalLabel, data.vicePrincipalComment],
        ] as [string, string][]
      ).map(([label, comment]) => (
        <View key={label} style={{ marginBottom: 6 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8 }}>
            {label}:
          </Text>
          <Text style={{ fontSize: 8, color: comment ? '#111111' : '#aaaaaa' }}>
            {comment || '—'}
          </Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Key to Comments</Text>
      {COMMENT_KEY.map((text, i) => (
        <Text key={i} style={{ fontSize: 7, marginBottom: 1 }}>
          {i + 1}. {text}
        </Text>
      ))}

      <Text style={styles.printNote}>{PRINT_NOTE}</Text>
    </Page>

    {/* Page 4 — Back Cover: Grade/Conduct Keys + Next Term + Signature */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionTitle}>Key to Letter Grades</Text>
      {GRADE_KEY.map(([grade, range]) => (
        <Text key={grade} style={{ fontSize: 8 }}>
          {grade}: {range}
        </Text>
      ))}

      <Text style={styles.sectionTitle}>Key to Conduct</Text>
      {CONDUCT_KEY.map(([code, meaning]) => (
        <Text key={code} style={{ fontSize: 8 }}>
          {code} — {meaning}
        </Text>
      ))}

      <Text style={styles.sectionTitle}>Next Term Begins</Text>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold' }}>
        {data.nextTermStart
          ? new Date(data.nextTermStart).toLocaleDateString('en-JM', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : 'To be announced'}
      </Text>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
        Authorized Signature
      </Text>
      {data.authorizedSignature?.mode === 'image' &&
        data.authorizedSignature.imageUrl && (
          <Image
            src={data.authorizedSignature.imageUrl}
            style={{ width: 120, height: 40, objectFit: 'contain' }}
          />
        )}
      {data.authorizedSignature?.mode === 'text' && (
        <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Oblique' }}>
          {data.authorizedSignature.text}
        </Text>
      )}
      {!data.authorizedSignature && (
        <Text style={{ fontSize: 8, color: '#aaaaaa' }}>
          No signature configured.
        </Text>
      )}

      <Text style={styles.printNote}>{PRINT_NOTE}</Text>
    </Page>
  </Document>
);
