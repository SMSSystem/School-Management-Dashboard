// Small helpers shared by the admin scripts. Each script keeps its own flag parsing, so its
// dry-run and --live behaviour stays visible in that script.
import { existsSync } from "node:fs";

/** Returns a function that prints the usage text and exits with the code it is given. */
export function usageExit(usage) {
  return (code) => {
    console.log(usage);
    process.exit(code);
  };
}

/** The key path from --key or GOOGLE_APPLICATION_CREDENTIALS. Exits if there is none or the file is missing. */
export function requireKeyPath(optionPath) {
  const keyPath = optionPath ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath || !existsSync(keyPath)) {
    console.error(
      "A service-account key is required: pass --key=<path> or set GOOGLE_APPLICATION_CREDENTIALS.",
    );
    process.exit(1);
  }
  return keyPath;
}
