import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceState = 'P' | 'A' | 'L' | 'S' | 'E';
type Session = 'AM' | 'PM';

export interface AttendancePDFData {
  institutionName: string;
  className: string;
  termName: string;
  dateRangeLabel: string;
  sessions: Session[];
  /** Sorted list of students */
  students: { uid: string; name: string }[];
  /** date ISO strings in the scope, sorted ascending */
  dates: string[];
  /** Map: `${date}_${session}` → Map: studentId → state */
  records: Record<string, Record<string, AttendanceState | null>>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 8, fontFamily: 'Helvetica' },
  header: { marginBottom: 10 },
  title: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  subtitle: { fontSize: 9, color: '#555', marginBottom: 1 },
  table: { borderWidth: 1, borderColor: '#ccc', borderStyle: 'solid' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#ccc', borderStyle: 'solid' },
  lastRow: { flexDirection: 'row' },
  headerRow: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderColor: '#ccc', borderStyle: 'solid' },
  nameCell: { width: 130, padding: 3, borderRightWidth: 1, borderColor: '#ccc', borderStyle: 'solid' },
  sessionCell: { flex: 1, padding: 3, textAlign: 'center', borderRightWidth: 1, borderColor: '#ccc', borderStyle: 'solid' },
  lastCell: { flex: 1, padding: 3, textAlign: 'center' },
  dateGroup: { flex: 1, borderRightWidth: 1, borderColor: '#ccc', borderStyle: 'solid' },
  dateGroupLast: { flex: 1 },
  dateLabel: { textAlign: 'center', padding: 2, borderBottomWidth: 1, borderColor: '#ccc', borderStyle: 'solid', fontSize: 7 },
  sessionRow: { flexDirection: 'row' },
  bold: { fontFamily: 'Helvetica-Bold' },
  summaryRow: { flexDirection: 'row', backgroundColor: '#f8f8f8', borderTopWidth: 1, borderColor: '#aaa', borderStyle: 'solid' },
});

// ─── State colors (greyscale for print) ──────────────────────────────────────

const STATE_BG: Record<AttendanceState, string> = {
  P: '#d4edda',
  A: '#f8d7da',
  L: '#fff3cd',
  S: '#e2d9f3',
  E: '#cce5ff',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AttendancePDF({ data }: { data: AttendancePDFData }) {
  const { institutionName, className, termName, dateRangeLabel, sessions, students, dates, records } = data;

  // Count P sessions per student
  function presentCount(uid: string): number {
    let count = 0;
    for (const date of dates) {
      for (const session of sessions) {
        const state = records[`${date}_${session}`]?.[uid];
        if (state === 'P') count++;
      }
    }
    return count;
  }

  function totalSessions(uid: string): number {
    let count = 0;
    for (const date of dates) {
      for (const session of sessions) {
        const state = records[`${date}_${session}`]?.[uid];
        if (state) count++;
      }
    }
    return count;
  }

  const totalColumns = dates.length * sessions.length;

  return (
    <Document>
      <Page
        size="A4"
        orientation={totalColumns > 10 ? 'landscape' : 'portrait'}
        style={styles.page}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, styles.bold]}>{institutionName}</Text>
          <Text style={styles.subtitle}>General Attendance Register — {className}</Text>
          <Text style={styles.subtitle}>{termName} · {dateRangeLabel}</Text>
          <Text style={styles.subtitle}>Sessions: {sessions.join(', ')}</Text>
        </View>

        {/* Table */}
        <View style={styles.table}>
          {/* Date header row */}
          <View style={styles.headerRow}>
            <View style={[styles.nameCell, { borderRightWidth: 1, borderColor: '#ccc', borderStyle: 'solid' }]}>
              <Text style={styles.bold}>Student</Text>
            </View>
            {dates.map((date, i) => (
              <View
                key={date}
                style={i < dates.length - 1 ? styles.dateGroup : styles.dateGroupLast}
              >
                <Text style={[styles.dateLabel, styles.bold]}>{shortDate(date)}</Text>
                <View style={styles.sessionRow}>
                  {sessions.map((s, si) => {
                    const isLast = si === sessions.length - 1 && i === dates.length - 1;
                    return (
                      <Text
                        key={s}
                        style={isLast ? styles.lastCell : styles.sessionCell}
                      >
                        {s}
                      </Text>
                    );
                  })}
                </View>
              </View>
            ))}
            <View style={{ width: 44, padding: 3, textAlign: 'center' as const }}>
              <Text style={styles.bold}>Rate</Text>
            </View>
          </View>

          {/* Student rows */}
          {students.map((student, si) => {
            const pCount = presentCount(student.uid);
            const total = totalSessions(student.uid);
            const rate = total > 0 ? Math.round((pCount / total) * 100) : null;
            const isLast = si === students.length - 1;

            return (
              <View key={student.uid} style={isLast ? styles.lastRow : styles.row}>
                <View style={[styles.nameCell, { borderRightWidth: 1, borderColor: '#ccc', borderStyle: 'solid' }]}>
                  <Text>{student.name}</Text>
                </View>
                {dates.map((date, di) => (
                  <View
                    key={date}
                    style={di < dates.length - 1 ? styles.dateGroup : styles.dateGroupLast}
                  >
                    <View style={styles.sessionRow}>
                      {sessions.map((s, sessionIdx) => {
                        const state = records[`${date}_${s}`]?.[student.uid] ?? null;
                        const isLastCell = sessionIdx === sessions.length - 1 && di === dates.length - 1;
                        return (
                          <Text
                            key={s}
                            style={[
                              isLastCell ? styles.lastCell : styles.sessionCell,
                              state ? { backgroundColor: STATE_BG[state] } : {},
                            ]}
                          >
                            {state ?? ''}
                          </Text>
                        );
                      })}
                    </View>
                  </View>
                ))}
                <View style={{ width: 44, padding: 3, textAlign: 'center' as const }}>
                  <Text>{rate !== null ? `${rate}%` : '—'}</Text>
                </View>
              </View>
            );
          })}

          {/* Summary row */}
          <View style={styles.summaryRow}>
            <View style={[styles.nameCell, { borderRightWidth: 1, borderColor: '#ccc', borderStyle: 'solid' }]}>
              <Text style={styles.bold}>Present total</Text>
            </View>
            {dates.map((date, di) => (
              <View
                key={date}
                style={di < dates.length - 1 ? styles.dateGroup : styles.dateGroupLast}
              >
                <View style={styles.sessionRow}>
                  {sessions.map((s, si) => {
                    const presentTotal = students.filter(
                      (st) => records[`${date}_${s}`]?.[st.uid] === 'P'
                    ).length;
                    const filled = students.filter(
                      (st) => !!records[`${date}_${s}`]?.[st.uid]
                    ).length;
                    const isLastCell = si === sessions.length - 1 && di === dates.length - 1;
                    return (
                      <Text key={s} style={isLastCell ? styles.lastCell : styles.sessionCell}>
                        {filled > 0 ? `${presentTotal}/${filled}` : '—'}
                      </Text>
                    );
                  })}
                </View>
              </View>
            ))}
            <View style={{ width: 44, padding: 3 }} />
          </View>
        </View>

        {/* Footer legend */}
        <View style={{ marginTop: 8, flexDirection: 'row', gap: 12 }}>
          {(['P', 'A', 'L', 'S', 'E'] as AttendanceState[]).map((s) => (
            <Text key={s} style={{ fontSize: 7, color: '#555' }}>
              {s} = {s === 'P' ? 'Present' : s === 'A' ? 'Absent' : s === 'L' ? 'Late' : s === 'S' ? 'Sick' : 'Excused'}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}
