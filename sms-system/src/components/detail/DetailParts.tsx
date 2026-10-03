import type { ReactNode } from "react";
import { Link } from "react-router-dom";

// Small pieces shared by the Class, Subject and Term detail pages (opened from
// the eye button on their list rows), so the three read the same as the House
// detail page: a back link, a summary card, and related lists.

export const DetailBackLink = ({ to, label }: { to: string; label: string }) => (
  <Link to={to} className="text-sm text-sky-600 hover:underline self-start">
    ← {label}
  </Link>
);

export const DetailLoading = () => <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>;

export const DetailNotFound = ({ what, backTo, backLabel }: { what: string; backTo: string; backLabel: string }) => (
  <div className="p-8 text-center flex flex-col items-center gap-3">
    <p className="text-gray-500">{what} not found.</p>
    <Link to={backTo} className="text-sky-600 underline text-sm">
      ← {backLabel}
    </Link>
  </div>
);

export const DetailCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="bg-white dark:bg-gray-800 p-6 rounded-md flex flex-col gap-3">
    <h1 className="text-2xl font-semibold">{title}</h1>
    {children}
  </div>
);

export const DetailSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
    <h2 className="text-lg font-semibold">{title}</h2>
    {children}
  </div>
);

export const DetailFields = ({ rows }: { rows: { label: string; value: ReactNode }[] }) => (
  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
    {rows.map(({ label, value }) => (
      <div key={label} className="flex gap-2">
        <dt className="font-medium text-gray-500 dark:text-gray-400 w-36 shrink-0">{label}</dt>
        <dd className="text-gray-900 dark:text-gray-100 wrap-anywhere">{value || "—"}</dd>
      </div>
    ))}
  </dl>
);
