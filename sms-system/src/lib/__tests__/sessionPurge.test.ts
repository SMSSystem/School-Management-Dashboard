import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDraftCell, setDraftOwner } from '../attendanceDraft';
import { setPersistedFilter, getPersistedFilter } from '../filterPersistence';
import { queryClient } from '../queryClient';
import {
  SESSION_SIGNIN_KEY,
  purgeSession,
  stashAccountNotice,
  takeAccountNotice,
} from '../sessionPurge';
import { createFakeStorage } from './fakeStorage';

let local: ReturnType<typeof createFakeStorage>;
let session: ReturnType<typeof createFakeStorage>;

beforeEach(() => {
  local = createFakeStorage();
  session = createFakeStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  queryClient.clear();
});

afterEach(() => {
  setDraftOwner(null);
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe('purgeSession', () => {
  it('removes every browser-side copy of the signed-in person', () => {
    setDraftOwner('uid-a');
    setDraftCell('inst', 'c1', '2026-10-05', 'AM', 's1', { state: 'E', reason: 'Dentist' });
    setPersistedFilter('gradebook', 'classId', 'c1');
    session.setItem('sms_query_cache', '{"clientState":{}}');
    session.setItem(SESSION_SIGNIN_KEY, '1');
    local.setItem('sidebar-collapsed', '1'); // not personal: must survive
    queryClient.setQueryData(['users', 'inst'], [{ id: 'u1', dateOfBirth: '2010-01-01' }]);

    purgeSession();

    expect(local.dump()).toEqual({ 'sidebar-collapsed': '1' });
    expect(session.dump()).toEqual({});
    expect(getPersistedFilter('gradebook', 'classId')).toBe('');
    expect(queryClient.getQueryData(['users', 'inst'])).toBeUndefined();
  });

  it('never throws when storage is unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      get length(): number { throw new Error('denied'); },
      key() { throw new Error('denied'); },
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); },
    });
    expect(() => purgeSession()).not.toThrow();
  });
});

describe('account notice across the sign-out reload', () => {
  it('is read once and then forgotten', () => {
    stashAccountNotice('This account is inactive.');
    expect(takeAccountNotice()).toBe('This account is inactive.');
    expect(takeAccountNotice()).toBeNull();
  });
});
