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
};

const Table = <T,>({
  columns,
  renderRow,
  data,
  loading  = false,
  rowCount = 8,
}: TableProps<T>) => (
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
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
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

export default Table;
