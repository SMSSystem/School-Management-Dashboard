import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { RubricGrid } from "@/lib/rubricTable";

// A rubric's grid as a PDF. Each criterion is its own block, not a table column, so long descriptions and criteria with
// different levels still fit a page. Loaded only when someone chooses PDF (rubricDownload.ts), because the PDF engine is large.
const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#111827" },
  title: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  description: { color: "#4b5563", marginBottom: 12 },
  criterion: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  name: { fontSize: 11, fontWeight: "bold", flexShrink: 1, paddingRight: 8 },
  level: { backgroundColor: "#f8fafc", padding: 5, marginTop: 3 },
  levelHead: { flexDirection: "row", justifyContent: "space-between" },
  levelLabel: { fontWeight: "bold" },
  levelText: { color: "#4b5563", marginTop: 2 },
});

const points = (n: number) => `${n} pt${n === 1 ? "" : "s"}`;

export default function RubricPDF({ rubric }: { rubric: RubricGrid }) {
  return (
    <Document title={rubric.title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{rubric.title}</Text>
        {rubric.description ? (
          <Text style={styles.description}>{rubric.description}</Text>
        ) : null}
        {rubric.criteria.map((criterion) => (
          <View key={criterion.id} style={styles.criterion} wrap={false}>
            <View style={styles.head}>
              <Text style={styles.name}>{criterion.name}</Text>
              <Text>{points(criterion.maxPoints)} max</Text>
            </View>
            {criterion.levels.length === 0 ? (
              <Text style={styles.levelText}>No levels.</Text>
            ) : null}
            {criterion.levels.map((level, i) => (
              <View key={i} style={styles.level}>
                <View style={styles.levelHead}>
                  <Text style={styles.levelLabel}>{level.label}</Text>
                  <Text>{points(level.points)}</Text>
                </View>
                {level.description ? (
                  <Text style={styles.levelText}>{level.description}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}
