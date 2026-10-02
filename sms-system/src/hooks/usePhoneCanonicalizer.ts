import { useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { canonicalizePhone } from '@/lib/phone';

// Blur/submit normaliser for a phone field: a bare NANP number becomes
// +1-XXX-XXX-XXXX when the signed-in user's institution has a +1 phone of its
// own (see canonicalizePhone). A super_admin has no single institution, so the
// value is returned unchanged for them.
export function usePhoneCanonicalizer(): (value: string) => string {
  const { institution } = useAuth();
  const institutionPhone = institution?.phone ?? null;
  return useCallback(
    (value: string) => canonicalizePhone(value, { institutionPhone }),
    [institutionPhone],
  );
}
