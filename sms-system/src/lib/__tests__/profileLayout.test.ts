import { describe, expect, it } from 'vitest';
import pageRaw from '../../scenes/(dashboard)/profile/index.tsx?raw';
import sectionRaw from '../../components/profile/ProfileSection.tsx?raw';
import activityRaw from '../../components/profile/ProfileActivitySection.tsx?raw';
import auditRaw from '../../components/profile/ProfileAuditSection.tsx?raw';

// The profile page layout: for every role but super_admin, two columns from 1024 px
// whose bottoms line up (Role-specific Details and Account Details fill their columns)
// with Activity full width below; super_admin keeps the original xl split. Source-text
// checks, like the other page guards (there is no DOM test setup for this page).

const norm = (s: string) => s.split('\r\n').join('\n');
const page = norm(pageRaw);
const section = norm(sectionRaw);

describe('the profile page layout', () => {
  it('uses a two-column grid from lg for everyone but super_admin, stretched so the columns end together', () => {
    expect(page).toContain('const isSuper = currentRole === "super_admin";');
    expect(page).toContain('${isSuper ? "items-start" : "items-stretch"}');
    expect(page).toContain('${isSuper ? "xl:col-span-7" : "lg:col-span-7"}');
    expect(page).toContain('${isSuper ? "xl:col-span-5" : "lg:col-span-5"}');
  });

  it('lets Role-specific Details and Account Details grow to the end of their columns, not for super_admin', () => {
    expect(page.match(/fill=\{!isSuper\}/g)).toHaveLength(2);
    const role = page.indexOf('title="Role-specific Details"');
    const account = page.indexOf('title="Account Details"');
    expect(page.indexOf('fill={!isSuper}', role)).toBeGreaterThan(role);
    expect(page.indexOf('fill={!isSuper}', account)).toBeGreaterThan(account);
  });

  it('shows Activity full width below the grid for other roles, and inside the right column for super_admin', () => {
    expect(page).toContain('{isSuper && activitySection}');
    expect(page).toContain('{!isSuper && activitySection}');
    const grid = page.indexOf('items-start" : "items-stretch"');
    const inColumn = page.indexOf('{isSuper && activitySection}');
    const below = page.indexOf('{!isSuper && activitySection}');
    expect(inColumn).toBeGreaterThan(grid);
    expect(below).toBeGreaterThan(inColumn);
    // The admin Audit card is still the last thing on the page.
    expect(page.indexOf('<ProfileAuditSection')).toBeGreaterThan(below);
  });

  it('keeps one Activity element, so its props are not duplicated', () => {
    expect(page.match(/<ProfileActivitySection/g)).toHaveLength(1);
  });
});

describe('ProfileSection fill', () => {
  it('is opt-in and only adds flex-1', () => {
    expect(section).toContain('fill = false,');
    expect(section).toContain('${fill ? " flex-1" : ""}');
  });

  it('is not used by the Activity or Audit cards, which must end where their content ends', () => {
    expect(norm(activityRaw)).not.toContain('fill');
    expect(norm(auditRaw)).not.toContain('fill');
  });
});
