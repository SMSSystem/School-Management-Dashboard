import { APP_COMMIT, APP_ENV, APP_VERSION, CHANGELOG_URL } from "@/lib/appVersion";
import type { Role } from "@/lib/firebase";

// Settings → About: the version this tab runs (src/lib/appVersion.ts). The CHANGELOG lives in the
// private repository, so only a super admin (an operator with access to it) gets the link.
const AboutPanel = ({ role }: { role: Role | null | undefined }) => (
  <section className="bg-white dark:bg-gray-800 rounded-md p-4 shadow-sm">
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">About</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">The version of the app you are using.</p>
    </div>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-gray-500 dark:text-gray-400">Version</dt>
      <dd className="font-medium text-gray-900 dark:text-gray-100">v{APP_VERSION}</dd>
      <dt className="text-gray-500 dark:text-gray-400">Build</dt>
      <dd className="font-mono text-gray-700 dark:text-gray-300">{APP_COMMIT}</dd>
      <dt className="text-gray-500 dark:text-gray-400">Environment</dt>
      <dd className="text-gray-700 dark:text-gray-300">{APP_ENV}</dd>
    </dl>
    {role === "super_admin" && (
      <a
        href={CHANGELOG_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-block mt-3 text-xs text-sky-600 hover:underline dark:text-sky-400"
      >
        What changed in each version (CHANGELOG)
      </a>
    )}
  </section>
);

export default AboutPanel;
