import { describe, expect, it } from 'vitest';
import {
  READS_PATH,
  WRITES_PATH,
  describeSwitch,
  parseArgs,
  planUpdate,
} from '../../../scripts/setLargeFilesPausedLogic.mjs';
import scriptRaw from '../../../scripts/set-large-files-paused.mjs?raw';
import { READS_PAUSED_PATH, WRITES_PAUSED_PATH } from '../downloadGate';

const BASE = ['--key=k.json', '--project=p'];

describe('parseArgs', () => {
  it('is a dry run unless --apply is given', () => {
    expect(parseArgs(BASE).apply).toBe(false);
    expect(parseArgs([...BASE, '--apply']).apply).toBe(true);
  });

  it('reads each switch on its own', () => {
    expect(parseArgs([...BASE, '--reads', 'on'])).toMatchObject({ reads: true, writes: undefined });
    expect(parseArgs([...BASE, '--writes', 'off'])).toMatchObject({ reads: undefined, writes: false });
    expect(parseArgs([...BASE, '--reads', 'off', '--writes', 'on'])).toMatchObject({ reads: false, writes: true });
  });

  it('refuses anything it does not recognise, since this can stop every download', () => {
    expect(() => parseArgs([...BASE, '--reads', 'maybe'])).toThrow('on" or "off');
    expect(() => parseArgs([...BASE, '--reads'])).toThrow('on" or "off');
    expect(() => parseArgs([...BASE, '--pause'])).toThrow('Unrecognized');
  });

  it('needs a key and a project', () => {
    expect(() => parseArgs(['--project=p'])).toThrow('--key');
    expect(() => parseArgs(['--key=k.json'])).toThrow('--project');
  });
});

describe('planUpdate', () => {
  it('sets true to turn a switch on and removes the node to turn it off', () => {
    expect(planUpdate({ reads: true })).toEqual({ [READS_PATH]: true });
    expect(planUpdate({ writes: false })).toEqual({ [WRITES_PATH]: null });
  });

  it('leaves alone a switch it was not asked about', () => {
    expect(planUpdate({})).toEqual({});
    expect(Object.keys(planUpdate({ writes: true }))).toEqual([WRITES_PATH]);
  });

  it('uses the paths the app reads', () => {
    expect(READS_PATH).toBe(READS_PAUSED_PATH);
    expect(WRITES_PATH).toBe(WRITES_PAUSED_PATH);
  });
});

describe('describeSwitch', () => {
  it('treats only true as on', () => {
    expect(describeSwitch(true)).toContain('ON');
    for (const off of [null, undefined, false, 'true']) expect(describeSwitch(off)).toBe('off');
  });
});

describe('the script', () => {
  it('writes only behind --apply, and refuses a key for another project', () => {
    expect(scriptRaw.indexOf('if (!opts.apply)')).toBeLessThan(scriptRaw.indexOf('db.ref().update(update)'));
    expect(scriptRaw).toContain('serviceAccount.project_id !== opts.project');
  });
});
