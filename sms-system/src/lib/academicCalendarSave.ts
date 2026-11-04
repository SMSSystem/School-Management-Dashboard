import { addDoc, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db, type AcademicYearDocument, type TermDocument, type NonSchoolDayDocument } from '@/lib/firebase';
import { queryClient } from '@/lib/queryClient';
import { institutionCollection, institutionDoc } from '@/lib/paths';
import {
  buildYearName,
  nextYearDraftFor,
  termStatusFor,
  type CustomNSD,
  type WizardHoliday,
  type WizardTerm,
} from '@/lib/academicCalendarLogic';

// Every read and write of the Academic Calendar page (scenes/(dashboard)/academic-calendar): the set-up and
// draft-edit wizards, the time-block wizards, activating a draft, session days, term edits, non-school days
// and the automatic next-year draft. Each write keeps the cache invalidation that follows it, because none of
// it goes through FormModal and nothing else refreshes the shared calendar queries. Moved from the page as it
// was: the order of the writes is part of what they do.

// ─── Reads ────────────────────────────────────────────────────────────────────

/** A draft year's already-saved terms and non-school days, as the wizard's own state (empty if never saved). */
export async function fetchDraftYearDetails(institutionId: string, yearId: string) {
  const [termsSnap, nsdSnap] = await Promise.all([
    getDocs(query(institutionCollection(institutionId, 'terms'), where('academicYearId', '==', yearId))),
    getDocs(query(institutionCollection(institutionId, 'nonSchoolDays'), where('academicYearId', '==', yearId))),
  ]);

  const loadedTerms = termsSnap.docs
    .map((d) => d.data() as TermDocument)
    .sort((a, b) => (a.termNumber ?? 0) - (b.termNumber ?? 0))
    .map((t) => ({
      number: t.termNumber as 1 | 2 | 3,
      name: t.name,
      defaultName: t.defaultName ?? t.name,
      startDate: t.startDate,
      endDate: t.endDate,
    }));

  let holidayIdCounter = 0;
  const loadedHolidays = nsdSnap.docs
    .map((d) => d.data() as NonSchoolDayDocument)
    .filter((n) => n.source === 'public_holiday' && n.date)
    .map((n) => ({
      id: holidayIdCounter++,
      name: n.reason,
      date: new Date(`${n.date}T12:00:00Z`),
      isoDate: n.date as string,
      interacted: true,
      confirmed: true,
    }));

  const loadedNSDs = nsdSnap.docs
    .map((d) => d.data() as NonSchoolDayDocument)
    .filter((n) => n.source === 'institution_specific')
    .map((n, i): CustomNSD => ({
      id: i + 1,
      type: n.type,
      date: n.date ?? '',
      startDate: n.startDate ?? '',
      endDate: n.endDate ?? '',
      reason: n.reason,
    }));

  return { terms: loadedTerms, holidays: loadedHolidays, customNSDs: loadedNSDs };
}

// ─── Guard: does removing a day discard already-recorded attendance? ──────────
//
// Item 2 of EDIT_TIME_BLOCK_SCHOOL_WEEK_DAYS_REMEDIATION_PLAN.md §4.2.
// General registers store a raw `date` string and subject registers a raw
// `sessionDate` (no frozen "was this a valid school day" flag) — isSchoolDay() and
// isSubjectSessionDay() re-derive validity live from whatever
// schoolWeekDays currently is, so removing a day that already has
// attendance recorded on it would silently reinterpret history rather than
// just changing future behavior. Firestore can't query "day-of-week of a
// date string" server-side, so this reads every attendance doc for this
// time block and checks client-side — bounded by however many sessions
// this specific block has ever had (§4.2's read-cost note: fine at the
// "once-a-week, one programme" scale custom-mode institutions are built
// for, not a free-tier concern).
export async function findAttendanceOnRemovedDays(
  institutionId: string,
  yearId: string,
  removedDays: number[],
): Promise<{ day: number; exampleDate: string } | null> {
  const [general, subject] = await Promise.all([
    getDocs(
      query(institutionCollection(institutionId, 'generalAttendance'), where('academicYearId', '==', yearId)),
    ),
    getDocs(
      query(institutionCollection(institutionId, 'subjectAttendance'), where('academicYearId', '==', yearId)),
    ),
  ]);
  const dates = [
    ...general.docs.map((d) => d.data().date as string),
    ...subject.docs.map((d) => d.data().sessionDate as string),
  ];
  for (const date of dates) {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (removedDays.includes(day)) return { day, exampleDate: date };
  }
  return null;
}

// ─── The set-up wizard's two saves ────────────────────────────────────────────

type WizardInput = {
  institutionId: string;
  yearStart: string;
  yearEnd: string;
  schoolWeekDays: number[];
  terms: WizardTerm[];
  holidays: WizardHoliday[];
  customNSDs: CustomNSD[];
};

/**
 * Editing an existing draft (Item 12.2): update the draft doc in place (status stays 'draft' — activation is
 * DraftYearConfirmation's job), and delete-and-recreate its terms/non-school days so this save fully
 * reflects the wizard's current state.
 */
export async function saveDraftYear({ yearId, ...w }: WizardInput & { yearId: string }): Promise<void> {
  const { institutionId, yearStart, yearEnd, schoolWeekDays, terms, holidays, customNSDs } = w;
  const now = new Date().toISOString();
  const todayISO = now.slice(0, 10);

  const batch = writeBatch(db);
  batch.update(institutionDoc(institutionId, 'academicYears', yearId), {
    startDate: yearStart,
    endDate: yearEnd,
    schoolWeekDays,
  });

  const [existingTermsSnap, existingNSDSnap] = await Promise.all([
    getDocs(query(institutionCollection(institutionId, 'terms'), where('academicYearId', '==', yearId))),
    getDocs(query(institutionCollection(institutionId, 'nonSchoolDays'), where('academicYearId', '==', yearId))),
  ]);
  // Preserve any admin-renamed grade-tracking period labels (Item 5.3)
  // across the delete-and-recreate below — term IDs are deterministic
  // (`${yearId}_${t.number}`), so the recreated doc for a given term
  // number is the same doc the override was saved on.
  const existingLabelOverrides = new Map<string, Record<string, string> | undefined>();
  existingTermsSnap.docs.forEach((d) => {
    existingLabelOverrides.set(d.id, (d.data() as TermDocument).periodLabelOverrides);
  });

  existingTermsSnap.docs.forEach((d) => batch.delete(d.ref));
  existingNSDSnap.docs.forEach((d) => batch.delete(d.ref));

  for (const t of terms) {
    const termId = `${yearId}_${t.number}`;
    const periodLabelOverrides = existingLabelOverrides.get(termId);
    batch.set(institutionDoc(institutionId, 'terms', termId), {
      institutionId,
      academicYearId: yearId,
      termNumber: t.number,
      name: t.name,
      defaultName: t.defaultName,
      startDate: t.startDate,
      endDate: t.endDate,
      status: termStatusFor(t.startDate, t.endDate, todayISO),
      ...(periodLabelOverrides ? { periodLabelOverrides } : {}),
    });
  }

  // Confirmed holidays and custom non-school days join the same batch
  // as the year/term writes above rather than being written via
  // sequential addDoc calls — one atomic commit instead of N+1 round
  // trips, well within the batch's 500-write limit for realistic
  // holiday/NSD counts. addDoc doesn't support batching directly, so
  // doc(collectionRef) is used to pre-generate each auto-ID doc ref.
  for (const h of holidays.filter((h) => h.confirmed)) {
    const nsdRef = doc(institutionCollection(institutionId, 'nonSchoolDays'));
    batch.set(nsdRef, {
      institutionId,
      academicYearId: yearId,
      type: 'single',
      date: h.isoDate,
      reason: h.name,
      source: 'public_holiday',
      isActive: true,
      createdAt: serverTimestamp(),
    });
  }

  for (const n of customNSDs) {
    const nsdRef = doc(institutionCollection(institutionId, 'nonSchoolDays'));
    batch.set(nsdRef, {
      institutionId,
      academicYearId: yearId,
      type: n.type,
      ...(n.type === 'single' ? { date: n.date } : { startDate: n.startDate, endDate: n.endDate }),
      reason: n.reason,
      source: 'institution_specific',
      isActive: true,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();

  // Remediation plan §5, row 1 — this batch touches academicYears
  // (update), terms (delete+recreate), and nonSchoolDays
  // (delete+recreate), and none of it goes through FormModal, so
  // nothing else invalidates useInstitutionAcademicCalendar()'s cache
  // for it. Prefix-only keys ([collection, institutionId]) so this
  // matches both the academic-mode and custom-mode query key variants
  // (react-query's invalidateQueries does prefix matching by default).
  queryClient.invalidateQueries({ queryKey: ['academicYears', institutionId] });
  queryClient.invalidateQueries({ queryKey: ['terms', institutionId] });
  queryClient.invalidateQueries({ queryKey: ['nonSchoolDays', institutionId] });
}

/**
 * First-time set-up: the active year and its terms in one batch, with the confirmed holidays written before it
 * and the custom non-school days after it, one document at a time (in this order).
 */
export async function createAcademicYear({ uid, ...w }: WizardInput & { uid: string }): Promise<void> {
  const { institutionId, yearStart, yearEnd, schoolWeekDays, terms, holidays, customNSDs } = w;
  const now = new Date().toISOString();
  const todayISO = now.slice(0, 10);

  const batch = writeBatch(db);
  const yearName = buildYearName(yearStart, yearEnd);
  const yearId = `${institutionId}_${yearName}`;

  // Academic year
  batch.set(institutionDoc(institutionId, 'academicYears', yearId), {
    institutionId,
    name: yearName,
    startDate: yearStart,
    endDate: yearEnd,
    status: 'active',
    schoolWeekDays,
    createdAt: serverTimestamp(),
    confirmedAt: now,
    confirmedBy: uid,
  });

  // Terms
  for (const t of terms) {
    const termId = `${yearId}_${t.number}`;
    batch.set(institutionDoc(institutionId, 'terms', termId), {
      institutionId,
      academicYearId: yearId,
      termNumber: t.number,
      name: t.name,
      defaultName: t.defaultName,
      startDate: t.startDate,
      endDate: t.endDate,
      status: termStatusFor(t.startDate, t.endDate, todayISO),
    });
  }

  // Public holiday non-school days
  for (const h of holidays.filter((h) => h.confirmed)) {
    await addDoc(institutionCollection(institutionId, 'nonSchoolDays'), {
      institutionId,
      academicYearId: yearId,
      type: 'single',
      date: h.isoDate,
      reason: h.name,
      source: 'public_holiday',
      isActive: true,
      createdAt: serverTimestamp(),
    });
  }

  // Custom non-school days (not in batch since addDoc doesn't support batch easily for auto-IDs; we batch the year + terms)
  await batch.commit();

  for (const n of customNSDs) {
    await addDoc(institutionCollection(institutionId, 'nonSchoolDays'), {
      institutionId,
      academicYearId: yearId,
      type: n.type,
      ...(n.type === 'single' ? { date: n.date } : { startDate: n.startDate, endDate: n.endDate }),
      reason: n.reason,
      source: 'institution_specific',
      isActive: true,
      createdAt: serverTimestamp(),
    });
  }

  // Remediation plan §5, row 2 — same reasoning as the draft-edit path
  // above: academicYears + terms + nonSchoolDays all written here,
  // none of it through FormModal.
  queryClient.invalidateQueries({ queryKey: ['academicYears', institutionId] });
  queryClient.invalidateQueries({ queryKey: ['terms', institutionId] });
  queryClient.invalidateQueries({ queryKey: ['nonSchoolDays', institutionId] });
}

// ─── Custom-calendar mode ─────────────────────────────────────────────────────

/**
 * A new time block (CUSTOM_CALENDAR_MODE_SPEC.md §2): one academic year with exactly one term, sharing the
 * admin's one name. Written by both the first-time wizard and the quick-create modal.
 */
export async function createTimeBlock({
  institutionId,
  uid,
  name,
  startDate,
  endDate,
  schoolWeekDays,
}: {
  institutionId: string;
  uid: string;
  name: string;
  startDate: string;
  endDate: string;
  schoolWeekDays: number[];
}): Promise<void> {
  const now = new Date().toISOString();
  const todayISO = now.slice(0, 10);
  const yearRef = doc(institutionCollection(institutionId, 'academicYears'));
  const termRef = doc(institutionCollection(institutionId, 'terms'));

  const batch = writeBatch(db);
  batch.set(yearRef, {
    institutionId,
    name: name.trim(),
    startDate,
    endDate,
    status: 'active',
    schoolWeekDays,
    createdAt: serverTimestamp(),
    confirmedAt: now,
    confirmedBy: uid,
  });
  batch.set(termRef, {
    institutionId,
    academicYearId: yearRef.id,
    termNumber: 1,
    name: name.trim(),
    defaultName: name.trim(),
    startDate,
    endDate,
    status: termStatusFor(startDate, endDate, todayISO),
  });
  await batch.commit();
  // Remediation plan §5, rows 3 and 4 — academicYears + terms batch, bespoke
  // write outside FormModal.
  queryClient.invalidateQueries({ queryKey: ['academicYears', institutionId] });
  queryClient.invalidateQueries({ queryKey: ['terms', institutionId] });
}

/** Changes a time block's session days (the caller has already checked no attendance sits on a removed day). */
export async function updateSessionDays(institutionId: string, yearId: string, schoolWeekDays: number[]): Promise<void> {
  await updateDoc(institutionDoc(institutionId, 'academicYears', yearId), { schoolWeekDays });
  // Same 2-segment prefix invalidation convention as the caching
  // remediation plan's §5 — every consumer's cached academicYears read
  // (ClassForm, Attendance pages, the dashboards, CurrentTermContext,
  // ...) picks up the change without a reload.
  queryClient.invalidateQueries({ queryKey: ['academicYears', institutionId] });
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

/** Activates a draft year and, if there is one, marks the previous year completed. */
export async function activateDraftYear({
  draftYear,
  previousYearId,
  uid,
}: {
  draftYear: { institutionId: string; id: string };
  previousYearId: string | null;
  uid: string;
}): Promise<void> {
  const batch = writeBatch(db);
  // Activate the draft year
  batch.update(institutionDoc(draftYear.institutionId, 'academicYears', draftYear.id), {
    status: 'active',
    confirmedAt: new Date().toISOString(),
    confirmedBy: uid,
  });
  // Mark previous year completed
  if (previousYearId) {
    batch.update(institutionDoc(draftYear.institutionId, 'academicYears', previousYearId), { status: 'completed' });
  }
  await batch.commit();
  // Remediation plan §5, row 5 — academicYears-only batch (activation +
  // previous-year completion), bespoke write outside FormModal.
  queryClient.invalidateQueries({ queryKey: ['academicYears', draftYear.institutionId] });
}

/** The draft of the next year, made when the active year has ended (never for custom-calendar institutions). */
export function createNextYearDraft(
  institutionId: string,
  activeYear: Pick<AcademicYearDocument, 'startDate' | 'endDate' | 'schoolWeekDays'>,
): Promise<void> {
  const next = nextYearDraftFor(activeYear);
  return addDoc(institutionCollection(institutionId, 'academicYears'), {
    institutionId,
    name: next.name,
    startDate: next.startDate,
    endDate: next.endDate,
    status: 'draft',
    schoolWeekDays: next.schoolWeekDays,
    createdAt: serverTimestamp(),
  })
    // Remediation plan §5, row 9.
    .then(() => queryClient.invalidateQueries({ queryKey: ['academicYears', institutionId] }))
    .catch(() => {});
}

// ─── The management view ──────────────────────────────────────────────────────

export async function saveTermEdits(institutionId: string, termId: string, termEdits: Partial<TermDocument>): Promise<void> {
  await updateDoc(institutionDoc(institutionId, 'terms', termId), termEdits);
  // Remediation plan §5, row 6.
  queryClient.invalidateQueries({ queryKey: ['terms', institutionId] });
}

export async function toggleNonSchoolDay(nsd: NonSchoolDayDocument & { id: string }): Promise<void> {
  await updateDoc(institutionDoc(nsd.institutionId, 'nonSchoolDays', nsd.id), { isActive: !nsd.isActive });
  // Remediation plan §5, row 7.
  queryClient.invalidateQueries({ queryKey: ['nonSchoolDays', nsd.institutionId] });
}

export async function addNonSchoolDay(
  institutionId: string,
  academicYearId: string,
  newNSD: Omit<CustomNSD, 'id'>,
): Promise<void> {
  await addDoc(institutionCollection(institutionId, 'nonSchoolDays'), {
    institutionId,
    academicYearId,
    type: newNSD.type,
    ...(newNSD.type === 'single' ? { date: newNSD.date } : { startDate: newNSD.startDate, endDate: newNSD.endDate }),
    reason: newNSD.reason,
    source: 'institution_specific',
    isActive: true,
    createdAt: serverTimestamp(),
  });
  // Remediation plan §5, row 8.
  queryClient.invalidateQueries({ queryKey: ['nonSchoolDays', institutionId] });
}
