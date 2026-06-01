import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { FeedbackCommentDocument, ResultDocument } from '@/lib/firebase';

export type ReportPDFReport = {
  institutionName: string;
  studentName: string;
  termName: string;
  generatedAt: string;
  gradingSystem: string;
  grades: ResultDocument[];
  feedback: FeedbackCommentDocument[];
  overallScore: number;
  generatedByRole: string;
};

type ReportPDFProps = {
  report: ReportPDFReport;
};

const SKY = '#0ea5e9';
const SKY_DARK = '#0369a1';
const SKY_LIGHT = '#e0f2fe';
const SKY_MUTED = '#bae6fd';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: '#111827', backgroundColor: '#ffffff' },

  header: {
    backgroundColor: SKY,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerLeft: { flex: 1, paddingRight: 16 },
  institutionName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 2 },
  headerSubtitle: { fontSize: 9, color: SKY_LIGHT, marginBottom: 10 },
  headerDetail: { fontSize: 9, color: '#f0f9ff', marginBottom: 2 },
  logoBox: {
    width: 64,
    height: 64,
    borderWidth: 1,
    borderColor: SKY_MUTED,
    borderStyle: 'solid',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLabel: { fontSize: 7, color: SKY_MUTED, textAlign: 'center' },

  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: SKY_DARK,
    paddingBottom: 4,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: SKY_LIGHT,
    borderBottomStyle: 'solid',
  },

  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f9ff',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: SKY_MUTED,
    borderBottomStyle: 'solid',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    borderBottomStyle: 'solid',
  },
  tableRowAlt: { backgroundColor: '#f8fafc' },
  colAssessment: { flex: 3 },
  colNum: { flex: 1 },
  colHeaderText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151' },
  colHeaderTextRight: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151', textAlign: 'right' },
  colText: { fontSize: 9, color: '#374151' },
  colTextRight: { fontSize: 9, color: '#374151', textAlign: 'right' },

  feedbackEntry: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    borderBottomStyle: 'solid',
  },
  feedbackComment: { fontSize: 9, color: '#374151', lineHeight: 1.5, marginBottom: 4 },
  feedbackAttribution: { fontSize: 8, color: '#6b7280', textAlign: 'right' },
  feedbackEmpty: { fontSize: 9, color: '#9ca3af' },

  footer: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: SKY,
    borderTopStyle: 'solid',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overallScore: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: SKY_DARK },
  overallLabel: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  footerRight: { alignItems: 'flex-end' },
  footerMeta: { fontSize: 8, color: '#6b7280', marginBottom: 2 },
});

export const ReportPDF = ({ report }: ReportPDFProps) => {
  const isWeighted = report.gradingSystem === 'weighted';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.institutionName}>{report.institutionName || 'School Name'}</Text>
            <Text style={styles.headerSubtitle}>Academic Report</Text>
            <Text style={styles.headerDetail}>Student: {report.studentName}</Text>
            <Text style={styles.headerDetail}>Term: {report.termName}</Text>
            <Text style={styles.headerDetail}>Generated: {report.generatedAt.slice(0, 10)}</Text>
          </View>
          <View style={styles.logoBox}>
            <Text style={styles.logoLabel}>{'School\nLogo'}</Text>
          </View>
        </View>

        {/* Grades */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Grades</Text>
          <View style={styles.tableHeaderRow}>
            <View style={styles.colAssessment}>
              <Text style={styles.colHeaderText}>Assessment</Text>
            </View>
            <View style={styles.colNum}>
              <Text style={styles.colHeaderTextRight}>Score</Text>
            </View>
            <View style={styles.colNum}>
              <Text style={styles.colHeaderTextRight}>Max</Text>
            </View>
            <View style={styles.colNum}>
              <Text style={styles.colHeaderTextRight}>%</Text>
            </View>
            {isWeighted && (
              <View style={styles.colNum}>
                <Text style={styles.colHeaderTextRight}>Weight</Text>
              </View>
            )}
          </View>
          {report.grades.map((g, i) => (
            <View key={i} style={[styles.tableRow, i % 2 !== 0 && styles.tableRowAlt]}>
              <View style={styles.colAssessment}>
                <Text style={styles.colText}>{g.assessmentName}</Text>
              </View>
              <View style={styles.colNum}>
                <Text style={styles.colTextRight}>{g.score}</Text>
              </View>
              <View style={styles.colNum}>
                <Text style={styles.colTextRight}>{g.maxScore}</Text>
              </View>
              <View style={styles.colNum}>
                <Text style={styles.colTextRight}>
                  {((g.score / g.maxScore) * 100).toFixed(1)}
                </Text>
              </View>
              {isWeighted && (
                <View style={styles.colNum}>
                  <Text style={styles.colTextRight}>
                    {g.weight !== undefined ? g.weight.toFixed(2) : '—'}
                  </Text>
                </View>
              )}
            </View>
          ))}
          {report.grades.length === 0 && (
            <Text style={styles.feedbackEmpty}>No grades recorded.</Text>
          )}
        </View>

        {/* Teacher Comments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Teacher Comments</Text>
          {report.feedback.length === 0 ? (
            <Text style={styles.feedbackEmpty}>No teacher comments recorded.</Text>
          ) : (
            report.feedback.map((f, i) => (
              <View key={i} style={styles.feedbackEntry}>
                <Text style={styles.feedbackComment}>{f.comment}</Text>
                <Text style={styles.feedbackAttribution}>
                  {f.teacherName ?? 'Teacher'} · {f.createdAt.slice(0, 10)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.overallScore}>{report.overallScore.toFixed(1)}%</Text>
            <Text style={styles.overallLabel}>Overall Score</Text>
          </View>
          <View style={styles.footerRight}>
            <Text style={styles.footerMeta}>
              Grading system: {report.gradingSystem === 'weighted' ? 'Weighted' : 'Flat'}
            </Text>
            <Text style={styles.footerMeta}>
              Generated by: {report.generatedByRole.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};
