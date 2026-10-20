// Small pieces the profile wizard's steps share: the field error line and the input and label classes.

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-500">{message}</p>;
}

export const inputClass =
  'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
export const labelClass = 'flex flex-col gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200';
