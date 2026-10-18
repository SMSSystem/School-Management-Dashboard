// The small states of the register page: a spinner while the calendar loads, and a one-line notice.

export function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="h-8 w-8 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
    </div>
  );
}

export function InfoState({ message }: { message: string }) {
  return (
    <div className="p-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}
