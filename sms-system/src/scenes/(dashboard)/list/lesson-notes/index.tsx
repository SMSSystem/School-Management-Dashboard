import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Link as LinkIcon, Search } from "lucide-react";
import FormModal from "@/components/FormModal";
import LessonNoteViewModal, { LessonNoteViewDialog } from "@/components/forms/LessonNoteViewModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { useAuth } from "@/lib/AuthContext";
import { PAGE_SIZE } from "@/lib/utils";
import { noteFiles } from "@/lib/lessonNoteFiles";
import { LESSON_NOTES_LIMIT, useLessonNotes, type LessonNote } from "@/hooks/useLessonNotes";
import FilterSelect from "@/components/FilterSelect";
import ResultCount from "@/components/ResultCount";
import { getPersistedFilter, setPersistedFilter } from "@/lib/filterPersistence";
import { naturalCompare } from "@/lib/sortByName";

type FormData = Record<string, string | number | readonly string[] | undefined>;

// The Subject column is there only while the Subject dropdown and chips are not (one subject or none among
// the notes): with two or more, the filter already says it. Name, Class, Subject and Teacher get a share of
// the width and are cut to one line with an ellipsis (their cells carry the full text as a tooltip), so a
// long name never squeezes the Content icons or the action buttons.
const columns = (showSubject: boolean) => [
  { header: "Name", accessor: "name", className: "w-[30%]" },
  { header: "Class", accessor: "class", className: "hidden md:table-cell w-[24%]" },
  ...(showSubject ? [{ header: "Subject", accessor: "subject", className: "hidden md:table-cell w-[16%]" }] : []),
  { header: "Teacher", accessor: "teacher", className: "hidden lg:table-cell w-[16%]" },
  { header: "Content", accessor: "content" },
  { header: "Actions", accessor: "action" },
];

// LESSON_NOTES_FEATURE_SPEC.md §7 — one role-aware page. Staff get the
// full table with create/edit/delete; students and parents get the same
// table read-only (their notes are already narrowed by useLessonNotes()).
// Below md the table becomes a list of tappable cards, and a search box and
// subject chips (client-side, over the notes already loaded — no extra reads)
// let a phone user narrow the list.
const LessonNotesPage = () => {
  const { role, user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  // The subject chips and the Subject dropdown share this one value; it is remembered for
  // the browser session (lib/filterPersistence.ts).
  const [subject, setSubjectState] = useState(() => getPersistedFilter("lesson-notes", "subject"));
  const setSubject = (value: string) => {
    setSubjectState(value);
    setPersistedFilter("lesson-notes", "subject", value);
  };
  const [viewing, setViewing] = useState<LessonNote | null>(null);
  const { notes, loading, error, capped } = useLessonNotes();

  const isStaff =
    role === "institution_admin" || role === "senior_teacher" || role === "regular_teacher";

  // Mirrors firestore.rules: admin, the author, or a senior_teacher on a
  // same-department regular_teacher's note (useLessonNotes() only returns
  // those). The rules remain the real gate.
  const canModify = (n: LessonNote) =>
    role === "institution_admin" ||
    n.teacherId === user?.uid ||
    (role === "senior_teacher" && n.teacherRole === "regular_teacher");

  // A spectator sees every note (useLessonNotes) under the staff heading, but is
  // not isStaff, so it gets no create/edit/delete control above.
  const heading = isStaff || role === "spectator" ? "Lesson Notes" : role === "student" ? "My Lessons" : "Lessons";

  const subjects = useMemo(
    () => [...new Set(notes.map((n) => n.subjectName).filter((s): s is string => !!s))].sort(naturalCompare),
    [notes],
  );
  // The Subject dropdown and chips, and (when they are absent) the Subject column.
  const hasSubjectFilter = subjects.length > 1;
  // A chip whose subject has since disappeared (e.g. the last note was deleted)
  // falls back to "All" rather than showing an empty list.
  const activeSubject = subjects.includes(subject) ? subject : "";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter(
      (n) =>
        (!activeSubject || n.subjectName === activeSubject) &&
        (!q ||
          [n.name, n.subjectName, n.className, n.teacherName].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [notes, activeSubject, search]);

  useEffect(() => {
    setPage(1);
  }, [search, activeSubject]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const contentIcons = (item: LessonNote) => (
    <div className="flex items-center gap-3 text-gray-500 dark:text-gray-300">
      {noteFiles(item).length > 0 && (
        <span
          className="inline-flex items-center gap-1"
          title={noteFiles(item).map((f) => f.fileName).join(", ")}
        >
          <FileText className="w-4 h-4" aria-label={noteFiles(item).length === 1 ? "Has file" : "Has files"} />
          {noteFiles(item).length > 1 ? noteFiles(item).length : null}
        </span>
      )}
      {item.resourceLinks.length > 0 && (
        <span
          className="inline-flex items-center gap-1"
          title={`${item.resourceLinks.length} link${item.resourceLinks.length === 1 ? "" : "s"}`}
        >
          <LinkIcon className="w-4 h-4" aria-label="Has links" />
          {item.resourceLinks.length}
        </span>
      )}
    </div>
  );

  const renderRow = (item: LessonNote) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="p-4 font-medium max-w-0">
        <div className="truncate" title={item.name}>
          {item.name}
        </div>
      </td>
      <td className="hidden md:table-cell max-w-0 pr-4">
        <div className="truncate" title={item.className}>
          {item.className ?? "—"}
        </div>
      </td>
      {!hasSubjectFilter && (
        <td className="hidden md:table-cell max-w-0 pr-4">
          <div className="truncate" title={item.subjectName}>
            {item.subjectName ?? "—"}
          </div>
        </td>
      )}
      <td className="hidden lg:table-cell max-w-0 pr-4">
        <div className="truncate" title={item.teacherName}>
          {item.teacherName}
        </div>
      </td>
      <td className="whitespace-nowrap pr-6">{contentIcons(item)}</td>
      <td>
        <div className="flex items-center gap-2">
          <LessonNoteViewModal note={item} />
          {isStaff && canModify(item) && (
            <>
              <FormModal
                table="lesson_note"
                type="update"
                data={item as unknown as FormData}
              />
              <FormModal table="lesson_note" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  // Phones: the whole card opens the note; staff edit/delete sit in a footer
  // (not inside the card's own button, which would nest interactive elements).
  const renderCard = (item: LessonNote) => (
    <li
      key={item.id}
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setViewing(item)}
        aria-label={`View ${item.name}`}
        className="w-full min-h-16 flex items-center gap-3 p-4 text-left active:bg-gray-50 dark:active:bg-gray-800"
      >
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-gray-900 dark:text-gray-100 wrap-break-word">{item.name}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {item.subjectName && (
              <span className="rounded-full bg-sky-100 dark:bg-sky-900/30 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                {item.subjectName}
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {[item.className, item.teacherName].filter(Boolean).join(" · ")}
            </span>
          </div>
          <div className="mt-2 text-xs">{contentIcons(item)}</div>
        </div>
        <ChevronRight className="w-5 h-5 shrink-0 text-gray-300 dark:text-gray-600" aria-hidden="true" />
      </button>
      {isStaff && canModify(item) && (
        <div className="flex items-center gap-2 border-t border-gray-100 dark:border-gray-800 px-4 py-2">
          <FormModal table="lesson_note" type="update" data={item as unknown as FormData} />
          <FormModal table="lesson_note" type="delete" id={item.id} />
        </div>
      )}
    </li>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-md flex-1 m-2 sm:m-4">
      {/* TOP */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{heading}</h1>
        <div className="flex items-center gap-4">
          {isStaff && <FormModal table="lesson_note" type="create" />}
        </div>
        <ResultCount
          matching={filtered.length}
          total={notes.length}
          page={page}
          singular="lesson"
          plural="lessons"
          loading={loading}
          capLimit={capped ? LESSON_NOTES_LIMIT : undefined}
        />
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      {capped && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Showing the {LESSON_NOTES_LIMIT} most recent notes.
        </p>
      )}

      {/* SEARCH + SUBJECT CHIPS */}
      {notes.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="relative block flex-1">
            <span className="sr-only">Search lessons</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lessons…"
              className="w-full min-h-11 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 pl-9 pr-3 text-base sm:text-sm outline-none focus:ring-2 focus:ring-sky-400"
            />
          </label>
          {hasSubjectFilter && (
            <FilterSelect
              label="Subject"
              allLabel="All subjects"
              options={subjects.map((s) => ({ value: s, label: s }))}
              value={activeSubject}
              onChange={setSubject}
            />
          )}
          </div>
          {hasSubjectFilter && (
            <div role="group" aria-label="Filter by subject" className="-mx-3 sm:mx-0 px-3 sm:px-0 flex gap-2 overflow-x-auto pb-1">
              {["", ...subjects].map((s) => {
                const active = s === activeSubject;
                return (
                  <button
                    key={s || "all"}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSubject(s)}
                    className={`shrink-0 min-h-9 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-sky-600 border-sky-600 text-white"
                        : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {s || "All"}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* LIST */}
      <Table columns={columns(!hasSubjectFilter)} renderRow={renderRow} renderCard={renderCard} data={paginated} loading={loading} />

      {/* PAGINATION */}
      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {viewing && <LessonNoteViewDialog note={viewing} open onClose={() => setViewing(null)} />}
    </div>
  );
};

export default LessonNotesPage;
