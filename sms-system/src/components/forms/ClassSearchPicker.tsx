import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { naturalCompare } from "@/lib/sortByName";

type Option = { id: string; name: string };

const MAX_SHOWN = 50;

// A search box that suggests classes as you type, for picking one class at a time out of a long list without the
// form growing with every class (ExtraClassesField). The suggestions drop down under the box, scroll, and close on a
// pick, on Escape, when the focus leaves the box (Tab), or on a click elsewhere. Arrow keys move through them, the
// highlighted one is kept in view, and Enter picks. The chosen classes are not suggested again; the field shows them
// itself. With more than 50 matches only the first 50 are listed, with a line asking for more letters.
export default function ClassSearchPicker({
  options,
  onPick,
  placeholder = "Search classes…",
  label,
}: {
  /** The classes that can still be picked. */
  options: readonly Option[];
  onPick: (id: string) => void;
  placeholder?: string;
  /** The accessible name of the search box. */
  label: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-option-${i}`;

  // Every class that matches, in natural order; the list shows the first MAX_SHOWN of them.
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q
      ? options.filter((o) => o.name.toLowerCase().includes(q))
      : [...options];
    return hits.sort((a, b) => naturalCompare(a.name, b.name));
  }, [options, query]);
  const matches = found.slice(0, MAX_SHOWN);

  // A click anywhere outside the box and its list closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  // The highlighted suggestion stays in view while the arrow keys move past the visible rows.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(optionId(active))
      ?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is stable for the component's life
  }, [active, open]);

  const pick = (id: string) => {
    onPick(id);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Never submit the surrounding form from here.
      e.preventDefault();
      if (open && matches[active]) pick(matches[active].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // What the list says instead of, or below, the suggestions. It is not an option, so it sits outside the listbox.
  const note =
    matches.length === 0
      ? options.length === 0
        ? "No more classes to add."
        : "No class matches."
      : found.length > MAX_SHOWN
        ? `Showing ${MAX_SHOWN} of ${found.length}. Keep typing to narrow the list.`
        : null;

  return (
    <div ref={rootRef} className="relative w-full">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        aria-hidden="true"
      />
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open && matches.length > 0 ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[active] ? optionId(active) : undefined
        }
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Tabbing away closes the list; a click on a suggestion or the list keeps the focus here (mousedown below).
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md py-2 pl-9 pr-3 text-sm ring-[1.5px] ring-gray-300 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-600"
      />
      {open && (
        <div
          // Clicking the list (its scrollbar included) does not take the focus from the box.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {matches.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              aria-label={label}
              className="max-h-60 w-full overflow-y-auto"
            >
              {matches.map((o, i) => (
                <li
                  key={o.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  // mousedown, not click: the pick lands before the box loses focus.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o.id);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer px-3 py-2 ${
                    i === active
                      ? "bg-sky-50 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {o.name}
                </li>
              ))}
            </ul>
          )}
          {note && (
            <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
              {note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
