import { useEffect, useRef, useState } from 'react';

export type ExportFormat = 'csv' | 'xlsx';

type ExportMenuProps = {
  formats: ExportFormat[];
  disabled?: boolean;
  onExport: (format: ExportFormat) => void | Promise<void>;
  label?: string;
};

const FORMAT_LABEL: Record<ExportFormat, string> = {
  csv: 'Download CSV',
  xlsx: 'Download XLSX',
};

const BTN_CLASS =
  'rounded-md border border-sky-500 bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-50 disabled:cursor-not-allowed';

export default function ExportMenu({ formats, disabled, onExport, label = 'Export' }: ExportMenuProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const trigger = async (format: ExportFormat) => {
    setOpen(false);
    setLoading(true);
    try {
      await onExport(format);
    } finally {
      setLoading(false);
    }
  };

  if (formats.length === 0) return null;

  if (formats.length === 1) {
    const only = formats[0];
    return (
      <button type="button" disabled={disabled || loading} onClick={() => trigger(only)} className={BTN_CLASS}>
        {loading ? 'Preparing…' : FORMAT_LABEL[only]}
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" disabled={disabled || loading} onClick={() => setOpen((o) => !o)} className={BTN_CLASS}>
        {loading ? 'Preparing…' : `${label} ▾`}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => trigger(f)}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
