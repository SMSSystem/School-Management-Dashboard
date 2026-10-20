import { describe, expect, it } from 'vitest';
import tourStepsSrc from '../useTourSteps.ts?raw';
import { institutionProfileSource } from './institutionProfileSource';

// The institution profile wizard carries the element ids the product tour and the end-to-end specs look for.
// The page is several files, so these are pinned across all of them: an id that goes missing breaks a tour step
// (it would wait for an element that never appears) or a spec, and nothing else would notice.

const IDS = [
  'tour-institution-profile-${String(key).replace(',
  'tour-institution-profile-address',
  'tour-institution-profile-email',
  'tour-institution-profile-grading-${value}',
  'tour-institution-profile-logo-remove',
  'tour-institution-profile-logo-upload',
  'tour-institution-profile-motto',
  'tour-institution-profile-name',
  'tour-institution-profile-phone',
  'tour-institution-profile-sig-mode-${mode}',
  'tour-institution-profile-sig-remove',
  'tour-institution-profile-sig-text',
  'tour-institution-profile-sig-upload',
  'tour-institution-profile-wizard-back',
  'tour-institution-profile-wizard-next',
  'tour-institution-profile-wizard-save',
];

describe('the institution profile page keeps its tour and spec ids', () => {
  it('has exactly the ids it has always had, across its files', () => {
    const found = [...new Set(institutionProfileSource.match(/tour-institution-profile-[\w${}.()-]*/g) ?? [])].sort();
    expect(found).toEqual(IDS);
  });

  it('has every element the product tour points at', () => {
    const selectors = [...tourStepsSrc.matchAll(/selector:\s*'#(tour-institution-profile-[\w-]+)'/g)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(0);
    for (const id of selectors) expect(institutionProfileSource, id).toContain(id);
  });
});
