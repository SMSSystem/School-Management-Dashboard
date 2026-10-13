import { describe, expect, it } from 'vitest';
import page from '../../scenes/(dashboard)/spectator/index.tsx?raw';
import quickLinks from '../../components/SpectatorQuickLinks.tsx?raw';
import overdueHook from '../../hooks/useOverdueRegisterCount.ts?raw';
import awaitingCard from '../../components/AwaitingSignInCard.tsx?raw';
import registrationsCard from '../../components/PendingRegistrationsCard.tsx?raw';
import adminPage from '../../scenes/(dashboard)/admin/index.tsx?raw';

// The spectator home is read-only (docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md,
// Phase 3 item 4). These checks read the source as text, like the other
// spectator guards, and fail if a write call or a link to an editing screen
// sneaks into the files the spectator home is built from.

const WRITE_CALLS = /\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction)\s*\(/;
const EDIT_ROUTES = [
  '/dashboard/create-user',
  '/dashboard/import',
  '/dashboard/admin/backfill-student-classes',
  '/dashboard/admin/rebuild-attendance-summaries',
  '/dashboard/brand-settings',
  '/dashboard/institution-profile',
  '/dashboard/academic-calendar',
];

const SPECTATOR_FILES: [string, string][] = [
  ['spectator/index.tsx', page],
  ['SpectatorQuickLinks.tsx', quickLinks],
  ['useOverdueRegisterCount.ts', overdueHook],
  ['AwaitingSignInCard.tsx', awaitingCard],
  ['PendingRegistrationsCard.tsx', registrationsCard],
];

describe('spectator home is read-only', () => {
  it.each(SPECTATOR_FILES)('%s makes no writes', (_name, src) => {
    expect(WRITE_CALLS.test(src)).toBe(false);
  });

  it.each(SPECTATOR_FILES)('%s links to no editing screen', (_name, src) => {
    for (const route of EDIT_ROUTES) expect(src, route).not.toContain(route);
  });

  it('leaves out the admin prompts and shortcuts', () => {
    for (const name of ['AdminQuickActions', 'PendingInstitutionProfileCard', 'PendingAcademicYearCard', 'FormModal']) {
      expect(page, name).not.toContain(name);
    }
  });

  it('no longer shows the Events, Announcements and Institution Profile cards (admin or spectator home)', () => {
    for (const [name, src] of [['spectator', page], ['admin', adminPage]] as const) {
      for (const card of ['<EventsList', '<Announcements', '<InstitutionBrandCard']) {
        expect(src, `${name} ${card}`).not.toContain(card);
      }
    }
  });

  it('shows the two count cards on both homes; the spectator one leaves out the Spectators row', () => {
    expect(adminPage).toContain('<AwaitingSignInCard />');
    expect(adminPage).toContain('<PendingRegistrationsCard />');
    expect(page).toContain('<AwaitingSignInCard includeSpectators={false} />');
    expect(page).toContain('<PendingRegistrationsCard />');
    expect(awaitingCard).toContain('includeSpectators || r.key !== "spectators"');
  });

  it('keeps the admin home showing its quick actions', () => {
    expect(adminPage).toContain('<AdminQuickActions />');
  });

  it('shares the overdue-register logic instead of copying it', () => {
    expect(page).toContain('useOverdueRegisterCount(');
    expect(adminPage).toContain('useOverdueRegisterCount(');
    expect(page).not.toContain('generalAttendance');
    expect(adminPage).not.toContain('generalAttendance');
  });
});
