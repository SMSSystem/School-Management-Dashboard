import { useQuery } from "@tanstack/react-query";
import { getDocs, query, where } from "firebase/firestore";
import type { TimetableSlotDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { DATA_MODE } from "@/lib/data";
import { institutionCollection } from "@/lib/paths";
import { REFERENCE_STALE_MS } from "@/lib/queryPolicies";

export type WeekTimetableSlot = TimetableSlotDocument & { id: string };

type WeekOf = { by: "class" | "teacher"; id: string };

/** Firestore's limit on the values of one `in` filter. */
const IN_LIMIT = 30;

/** One getDocs per 30 term ids (normally one), merged. */
async function fetchWeekSlots(
  institutionId: string,
  of: WeekOf,
  termIds: string[],
): Promise<WeekTimetableSlot[]> {
  const field = of.by === "teacher" ? "teacherId" : "classId";
  const chunks: string[][] = [];
  for (let i = 0; i < termIds.length; i += IN_LIMIT)
    chunks.push(termIds.slice(i, i + IN_LIMIT));
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(
        query(
          institutionCollection(institutionId, "timetable_slots"),
          where(field, "==", of.id),
          where("termId", "in", chunk),
        ),
      ),
    ),
  );
  return snaps.flatMap((snap) =>
    snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as TimetableSlotDocument),
    })),
  );
}

/**
 * One class's or one teacher's timetable slots for the terms (or time blocks) covering the shown week: the Schedule
 * page's staff views. A student's merged week reads through useClassTimetable instead, sharing the dashboard's cache.
 *
 * Reads once and caches (no live listener): the key holds the class or teacher and the term ids, never the week, so
 * moving between weeks of the same term costs no reads. FormModal invalidates `['scheduleSlots', institutionId]`
 * in this browser after a slot is added, edited or deleted; other devices refetch when their cache goes stale.
 *
 * Kept in memory only: 'scheduleSlots' is deliberately not in lib/queryPersistence.ts's allow-list. Slots carry
 * teacher names, and the compliance storage table describes that sessionStorage cache as holding no personal data.
 */
export function useWeekTimetable(
  of: WeekOf | null,
  termIds: string[],
): {
  slots: WeekTimetableSlot[] | undefined;
  loading: boolean;
  error: boolean;
} {
  const { institutionId } = useAuth();
  const ids = [...new Set(termIds)].sort();
  const live = DATA_MODE === "live" && !!institutionId && institutionId !== "*";

  const result = useQuery({
    queryKey: [
      "scheduleSlots",
      institutionId,
      of?.by ?? "",
      of?.id ?? "",
      ids.join(","),
    ],
    queryFn: () => fetchWeekSlots(institutionId as string, of as WeekOf, ids),
    enabled: live && of !== null && ids.length > 0,
    staleTime: REFERENCE_STALE_MS,
  });

  return {
    slots: result.data,
    loading: result.isLoading,
    error: result.isError,
  };
}
