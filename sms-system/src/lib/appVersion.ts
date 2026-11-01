// The version of the app this tab is running, fixed when it was built (vite.config.ts `define`),
// so showing it costs no Firestore read. The number comes from package.json and is listed in
// CHANGELOG.md at the repository root; docs/VERSIONING.md says how it is chosen.
//
// APP_COMMIT is the short commit Vercel built ("local" for a build made off Vercel without git) and
// APP_ENV is Vercel's environment: "production", "preview", or "development" for npm run dev.

export const APP_VERSION: string = __APP_VERSION__;
export const APP_COMMIT: string = __APP_COMMIT__;
export const APP_ENV: string = __APP_ENV__;

// The repository is private: only its members (the platform's operators) can open this.
export const CHANGELOG_URL = 'https://github.com/SMSSystem/School-Management-Dashboard/blob/main/CHANGELOG.md';

/**
 * "v2.39.0" in production. Elsewhere the commit is added as SemVer build metadata
 * ("v2.39.0+a1b2c3d"), so a screenshot from a preview or a local build is not mistaken for the
 * released version.
 */
export function displayVersion(env: string = APP_ENV, version: string = APP_VERSION, commit: string = APP_COMMIT): string {
  return env === 'production' ? `v${version}` : `v${version}+${commit}`;
}

/** "v2.39.0 · build a1b2c3d · production", for Settings and error messages. */
export function buildDescription(env: string = APP_ENV, version: string = APP_VERSION, commit: string = APP_COMMIT): string {
  return `v${version} · build ${commit} · ${env}`;
}
