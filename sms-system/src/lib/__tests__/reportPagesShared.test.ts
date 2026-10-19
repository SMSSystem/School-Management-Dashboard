import { describe, expect, it } from 'vitest';
import { formatGeneratedDate } from '../formatGeneratedDate';
import reportCardsRaw from '../../scenes/(dashboard)/report-cards/index.tsx?raw';
import progressReportsRaw from '../../scenes/(dashboard)/progress-reports/index.tsx?raw';
import panelRaw from '../../components/reports/GenerateReportPanel.tsx?raw';
import panelStateRaw from '../../hooks/useGeneratePanelState.ts?raw';
import scopedReportsRaw from '../../hooks/useRoleScopedReports.ts?raw';
import linkedIdsRaw from '../../hooks/useLinkedStudentIds.ts?raw';
import studentOptionsRaw from '../../hooks/useReportStudentOptions.ts?raw';

// The Report Cards and Progress Reports pages were one page copied from the other (the duplication
// report, Item 5). Their generate panel, their role-scoped list, the parent's linked children, the
// admin's student dropdown and the date format now live in one place each. Each page still runs its
// own generator. These pin what the shared pieces must keep doing, since a change to one is now a
// change to both pages.

const lf = (s: string) => s.split('\r\n').join('\n');
const reportCards = lf(reportCardsRaw);
const progressReports = lf(progressReportsRaw);
const panel = lf(panelRaw);
const panelState = lf(panelStateRaw);
const scopedReports = lf(scopedReportsRaw);
const linkedIds = lf(linkedIdsRaw);
const studentOptions = lf(studentOptionsRaw);

describe('formatGeneratedDate', () => {
  it('writes the long US date', () => {
    expect(formatGeneratedDate({ toDate: () => new Date(2026, 9, 19, 12) })).toBe('October 19, 2026');
  });

  it('writes a dash for a document with no timestamp yet', () => {
    expect(formatGeneratedDate(undefined)).toBe('—');
    expect(formatGeneratedDate(null)).toBe('—');
    expect(formatGeneratedDate({})).toBe('—');
  });
});

describe('the role-scoped list (useRoleScopedReports)', () => {
  it('asks a student for their own documents only', () => {
    expect(scopedReports).toMatch(/role === "student" && user\?\.uid\) \{\s*q = query\(\s*institutionCollection\(institutionId, collectionName\),\s*where\("studentId", "==", user\.uid\)/);
  });

  it('asks a parent for their linked children, at most 10, and for nothing when there are none', () => {
    expect(scopedReports).toContain('where("studentId", "in", linkedStudentIds.slice(0, 10))');
    expect(scopedReports).toMatch(/if \(linkedStudentIds\.length === 0\) \{\s*setRows\(\[\]\);\s*setLoading\(false\);\s*return;/);
  });

  it('asks everyone else for the whole institution collection', () => {
    expect(scopedReports).toMatch(/\} else \{\s*q = query\(institutionCollection\(institutionId, collectionName\)\);/);
  });

  it('keys the shared listener by collection, institution, role and person, and reports a failed read', () => {
    expect(scopedReports).toContain('`${collectionName}:${institutionId}:${role}:${user?.uid ?? ""}`');
    expect(scopedReports).toContain('onLoadError(loadLabel, () => setLoading(false))');
    expect(scopedReports).toContain('if (!enabled || !institutionId || institutionId === "*") return;');
  });

  it('is used for reportCards by one page and progressReports by the other', () => {
    expect(reportCards).toMatch(/useRoleScopedReports<ReportCardDocument>\(\s*"reportCards"/);
    expect(progressReports).toMatch(/useRoleScopedReports<ProgressReportDocument>\(\s*"progressReports"/);
  });
});

describe('the parent’s linked children (useLinkedStudentIds)', () => {
  it('reads the parent’s own links and strips the parent id off the document id', () => {
    expect(linkedIds).toContain('where("parentId", "==", user.uid)');
    expect(linkedIds).toContain('d.id.replace(`${user.uid}_`, "")');
    expect(linkedIds).toContain('if (!enabled || role !== "parent" || !user) return;');
    expect(linkedIds).toContain('onLoadError("your children")');
  });
});

describe('the admin’s student dropdown (useReportStudentOptions)', () => {
  it('lists the institution’s students by name, only for a caller that may generate', () => {
    expect(studentOptions).toContain('where("role", "==", "student")');
    expect(studentOptions).toContain('where("institutionId", "==", institutionId)');
    expect(studentOptions).toContain('if (!enabled || !institutionId || institutionId === "*") return;');
    expect(studentOptions).toContain('onLoadError("the students to choose from")');
  });
});

describe('the generate panel state', () => {
  it('seeds both terms from the current term, never over a choice already made', () => {
    expect(panelState).toContain('if (!genTermId && currentTermId) setGenTermId(currentTermId);');
    expect(panelState).toContain('if (!batchTermId && currentTermId) setBatchTermId(currentTermId);');
  });

  it('clears the last run’s messages whenever the panel is opened, closed or toggled', () => {
    expect(panelState).toMatch(/const clearMessages = \(\) => \{\s*setPanelError\(null\);\s*setPanelWarnings\(\[\]\);\s*setBatchProgress\(null\);/);
    expect(panelState).toMatch(/const closePanel = \(\) => \{\s*setShowPanel\(false\);\s*clearMessages\(\);/);
    expect(panelState).toMatch(/const togglePanel = \(\) => \{\s*setShowPanel\(\(p\) => !p\);\s*clearMessages\(\);/);
  });
});

describe('the generate panel and the two pages', () => {
  it('keeps the panel’s controls and wording', () => {
    for (const text of ['Single Student', 'Batch (Class)', 'Select student…', 'Select term…', 'Select class…', 'Batch Generate', 'Cancel']) {
      expect(panel, text).toContain(text);
    }
    expect(panel).toContain('Progress: {batchProgress.done} / {batchProgress.total}');
    expect(panel).toContain('succeeded, {batchProgress.errors.length} failed.');
  });

  it('shows the panel to an institution admin only, on both pages', () => {
    for (const page of [reportCards, progressReports]) {
      expect(page).toContain('const isAdmin = role === "institution_admin";');
      expect(page).toMatch(/\{showPanel && isAdmin && \(\s*<GenerateReportPanel/);
    }
  });

  it('leaves the generating itself to each page, and holds no copy of the shared loads', () => {
    expect(reportCards).toContain('generateReportCard(');
    expect(progressReports).toContain('generateProgressReport(');
    for (const page of [reportCards, progressReports]) {
      expect(page).not.toContain('subscribeSnapshot(');
      expect(page).not.toContain('"student_parents"');
      expect(page).not.toContain('Select student…');
      expect(page).not.toContain('toLocaleDateString');
    }
  });
});
