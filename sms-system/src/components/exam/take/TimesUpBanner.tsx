// What the attempt screen says at 00:00, while the automatic submit runs or is retried: the heading, then whether the
// answers are on their way or the connection is the trouble. Spoken once as an alert. Answering is already switched off.
export default function TimesUpBanner({ sendingFailed }: { sendingFailed: boolean }) {
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-md bg-red-50 p-3 text-red-900 dark:bg-red-900/20 dark:text-red-100">
      <h2 className="text-lg font-semibold">Time&apos;s up!</h2>
      <p className="text-sm">{sendingFailed ? "We are still trying to send your answers. Stay on this page." : "Submitting your answers…"}</p>
    </div>
  );
}
