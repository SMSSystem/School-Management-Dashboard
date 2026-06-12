import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, AcademicYearDocument, TermDocument, NonSchoolDayDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';

export function useInstitutionAcademicCalendar() {
  const { institutionId } = useAuth();
  const [activeYear,    setActiveYear]    = useState<AcademicYearDocument & { id: string } | null>(null);
  const [draftYear,     setDraftYear]     = useState<AcademicYearDocument & { id: string } | null>(null);
  const [activeTerm,    setActiveTerm]    = useState<TermDocument & { id: string } | null>(null);
  const [allTerms,      setAllTerms]      = useState<(TermDocument & { id: string })[] | null>(null);
  const [nonSchoolDays, setNonSchoolDays] = useState<(NonSchoolDayDocument & { id: string })[]>([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    if (USE_MOCK || !institutionId) { setLoading(false); return; }

    const unsub = onSnapshot(
      query(collection(db, 'academicYears'), where('institutionId', '==', institutionId)),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AcademicYearDocument & { id: string }));
        setActiveYear(docs.find((y) => y.status === 'active') ?? null);
        setDraftYear(docs.find((y) => y.status === 'draft') ?? null);
      },
    );
    return unsub;
  }, [institutionId]);

  useEffect(() => {
    if (!activeYear) { setLoading(false); return; }

    const today = new Date().toISOString().slice(0, 10);

    const unsubT = onSnapshot(
      query(collection(db, 'terms'), where('academicYearId', '==', activeYear.id)),
      (snap) => {
        const terms = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TermDocument & { id: string }));
        setAllTerms(terms);
        setActiveTerm(
          terms.find((t) => today >= t.startDate && today <= t.endDate) ?? null,
        );
      },
    );

    const unsubD = onSnapshot(
      query(
        collection(db, 'nonSchoolDays'),
        where('academicYearId', '==', activeYear.id),
        where('isActive', '==', true),
      ),
      (snap) => {
        setNonSchoolDays(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NonSchoolDayDocument & { id: string })));
        setLoading(false);
      },
    );

    return () => { unsubT(); unsubD(); };
  }, [activeYear]);

  return { activeYear, draftYear, activeTerm, allTerms, nonSchoolDays, loading };
}
