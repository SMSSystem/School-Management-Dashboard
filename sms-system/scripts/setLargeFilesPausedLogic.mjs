// Pure decisions for scripts/set-large-files-paused.mjs (no I/O, so they can be unit
// tested from src/lib/__tests__/setLargeFilesPaused.test.ts).
// See docs/miscellaneous-specs/LESSON_NOTE_12_FILES_SPEC.md section 7.

export const READS_PATH = 'config/largeFileReadsPaused';
export const WRITES_PATH = 'config/largeFileWritesPaused';

const parseSwitch = (flag, value) => {
  if (value === 'on') return true;
  if (value === 'off') return false;
  throw new Error(`${flag} must be "on" or "off".`);
};

/** Reads the command line. Throws on anything it does not recognise, since this script can stop every download. */
export function parseArgs(argv) {
  const opts = { key: null, project: null, databaseUrl: null, reads: undefined, writes: undefined, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg.startsWith('--key=')) opts.key = arg.slice('--key='.length);
    else if (arg.startsWith('--project=')) opts.project = arg.slice('--project='.length);
    else if (arg.startsWith('--database-url=')) opts.databaseUrl = arg.slice('--database-url='.length);
    else if (arg === '--reads') opts.reads = parseSwitch('--reads', argv[++i]);
    else if (arg === '--writes') opts.writes = parseSwitch('--writes', argv[++i]);
    else throw new Error(`Unrecognized argument: ${arg}`);
  }
  if (!opts.key) throw new Error('--key=<path> is required.');
  if (!opts.project) throw new Error('--project=<id> is required, so the script can prove it writes to the project you meant.');
  return opts;
}

/**
 * What to change, as a multi-path update: true turns a switch on, and null removes the
 * node, since the rules treat a missing flag as off. A switch not asked about is left out.
 */
export function planUpdate({ reads, writes }) {
  const update = {};
  if (reads !== undefined) update[READS_PATH] = reads ? true : null;
  if (writes !== undefined) update[WRITES_PATH] = writes ? true : null;
  return update;
}

export const describeSwitch = (value) => (value === true ? 'ON (paused)' : 'off');
