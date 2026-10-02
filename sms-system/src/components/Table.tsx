import { MOBILE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";

type Column = {
  header:     string;
  accessor:   string;
  className?: string;
};

type TableProps<T> = {
  columns:   Column[];
  renderRow: (item: T) => React.ReactNode;
  data:      T[];
  loading?:  boolean;
  rowCount?: number;
  // Opt-in mobile layout: when given, screens below `md` show a stacked list of
  // cards (each item rendered by this, as an <li> with its own key) and the
  // table only appears from `md` up. Only one of the two is mounted at a time
  // (chosen with a JS media query), so no text is duplicated in the DOM. Omit it
  // and the table renders at every width, exactly as before.
  renderCard?: (item: T) => React.ReactNode;
};

const Table = <T,>({
  columns,
  renderRow,
  data,
  loading  = false,
  rowCount = 8,
  renderCard,
}: TableProps<T>) => {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const table = (
    <table className="w-full mt-4">
      <thead>
        <tr className="text-left text-gray-500 dark:text-gray-300 text-sm">
          {columns.map((col) => (
            <th key={col.accessor} className={col.className}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          Array.from({ length: rowCount }).map((_, i) => (
            <tr key={i} className="border-b border-gray-200 dark:border-gray-700">
              {columns.map((col) =>
                col.accessor === "info" ? (
                  <td key={col.accessor} className={col.className}>
                    <div className="flex items-center gap-4 p-4">
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0" />
                      <div className="flex flex-col gap-1.5 flex-1">
                        <div className="h-3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse w-3/4" />
                        <div className="h-3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse w-1/2" />
                      </div>
                    </div>
                  </td>
                ) : (
                  <td key={col.accessor} className={col.className}>
                    <div className="h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse w-3/4 my-2 mx-2" />
                  </td>
                )
              )}
            </tr>
          ))
        ) : data.length === 0 ? (
          <tr>
            <td
              colSpan={columns.length}
              className="py-8 text-center text-sm text-gray-400 dark:text-gray-500"
            >
              No data to display.
            </td>
          </tr>
        ) : (
          data.map((item) => renderRow(item))
        )}
      </tbody>
    </table>
  );

  if (!renderCard || !isMobile) return table;

  return (
    <>
      <div className="mt-4">
        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {Array.from({ length: Math.min(rowCount, 4) }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-2">
                <div className="h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse w-2/3" />
                <div className="h-3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse w-1/2" />
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No data to display.</p>
        ) : (
          <ul className="flex flex-col gap-3">{data.map((item) => renderCard(item))}</ul>
        )}
      </div>
    </>
  );
};

export default Table;
