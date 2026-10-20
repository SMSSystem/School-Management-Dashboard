import { describe, expect, it } from 'vitest';
import {
  CALENDAR_MODE_OPTIONS,
  STEP_LABELS,
  applyInstitutionDoc,
  initialWizardData,
  profileUpdate,
  validateBasicInfo,
  validateContact,
  validateRoleLabels,
  validateSignatureText,
  type WizardData,
} from '../institutionProfileLogic';

// The institution profile wizard's rules that need no screen or database. Written when they were moved out of
// the page, so the move is pinned to what the wizard did.

const blank = (over: Partial<WizardData> = {}): WizardData => ({ ...initialWizardData(null), ...over });

describe('labels', () => {
  it('names the seven steps in order', () => {
    expect(STEP_LABELS).toEqual(['Basic Info', 'Contact', 'Logo', 'Signature', 'Role Labels', 'Grading System', 'Review']);
  });

  it('offers the academic year first and custom time blocks second', () => {
    expect(CALENDAR_MODE_OPTIONS.map((o) => o.value)).toEqual(['academic_year', 'custom']);
  });
});

describe('validateBasicInfo', () => {
  it('needs a name and allows a motto of up to 200 characters', () => {
    expect(validateBasicInfo(blank({ name: 'Riverside' }))).toBeNull();
    expect(validateBasicInfo(blank({ name: 'Riverside', motto: 'x'.repeat(200) }))).toBeNull();
    expect(validateBasicInfo(blank({ name: '' }))).toEqual({ name: 'Institution name is required.' });
    expect(validateBasicInfo(blank({ name: 'Riverside', motto: 'x'.repeat(201) }))).toEqual({ motto: 'Motto must be 200 characters or fewer.' });
  });

  it('reports both problems at once', () => {
    expect(validateBasicInfo(blank({ name: '', motto: 'x'.repeat(201) }))).toEqual({
      name: 'Institution name is required.',
      motto: 'Motto must be 200 characters or fewer.',
    });
  });
});

describe('validateContact', () => {
  it('allows everything blank, a valid email, and an address of up to 300 characters', () => {
    expect(validateContact(blank())).toBeNull();
    expect(validateContact(blank({ email: 'office@example.com', address: 'a'.repeat(300) }))).toBeNull();
  });

  it('rejects a bad email and an address over 300 characters', () => {
    expect(validateContact(blank({ email: 'not-an-email' }))).toEqual({ email: 'Invalid email address.' });
    expect(validateContact(blank({ address: 'a'.repeat(301) }))).toEqual({ address: 'Address must be 300 characters or fewer.' });
  });
});

describe('validateSignatureText', () => {
  it('limits a typed signature to 30 characters and leaves an image signature alone', () => {
    expect(validateSignatureText(blank({ signatureMode: 'text', signatureText: 'x'.repeat(30) }))).toBeNull();
    expect(validateSignatureText(blank({ signatureMode: 'text', signatureText: 'x'.repeat(31) }))).toEqual({
      signatureText: 'Signature text must be 30 characters or fewer.',
    });
    expect(validateSignatureText(blank({ signatureMode: 'image', signatureText: 'x'.repeat(31) }))).toBeNull();
  });
});

describe('validateRoleLabels', () => {
  it('allows blank labels and labels of up to 50 characters, and names the one that is too long', () => {
    expect(validateRoleLabels(blank())).toBeNull();
    expect(validateRoleLabels(blank({ principalLabel: 'p'.repeat(50) }))).toBeNull();
    expect(validateRoleLabels(blank({ principalLabel: 'p'.repeat(51), vicePrincipalLabel: 'v'.repeat(51) }))).toEqual({
      principalLabel: 'Max 50 characters.',
      vicePrincipalLabel: 'Max 50 characters.',
    });
  });
});

describe('initialWizardData', () => {
  it('starts empty, as a flat-graded text signature, when there is no institution', () => {
    expect(initialWizardData(null)).toEqual({
      name: '',
      motto: '',
      phone: '',
      email: '',
      address: '',
      logoDataUrl: null,
      signatureMode: 'text',
      signatureDataUrl: null,
      signatureText: '',
      classSupervisorLabel: '',
      gradeSupervisorLabel: '',
      principalLabel: '',
      vicePrincipalLabel: '',
      gradingSystem: 'flat',
    });
  });

  it('takes the name, motto, contact details and logo from the signed-in profile, with the phone formatted', () => {
    const data = initialWizardData({
      name: 'Riverside',
      motto: 'Onward',
      phone: '18765551234',
      email: 'office@example.com',
      address: '1 Main St',
      logoUrl: 'data:image/png;base64,AAAA',
    });
    expect(data).toMatchObject({
      name: 'Riverside',
      motto: 'Onward',
      phone: '+1-876-555-1234',
      email: 'office@example.com',
      address: '1 Main St',
      logoDataUrl: 'data:image/png;base64,AAAA',
    });
  });
});

describe('applyInstitutionDoc', () => {
  it('lays the saved signature, labels and grading system over the form and keeps the rest', () => {
    const prev = blank({ name: 'Riverside', motto: 'Onward' });
    const next = applyInstitutionDoc(prev, {
      authorizedSignature: { mode: 'image', imageUrl: 'data:image/png;base64,BBBB' },
      classSupervisorLabel: 'Form Teacher',
      principalLabel: 'Head',
      gradingSystem: 'weighted',
    });
    expect(next).toMatchObject({
      name: 'Riverside',
      motto: 'Onward',
      signatureMode: 'image',
      signatureDataUrl: 'data:image/png;base64,BBBB',
      signatureText: '',
      classSupervisorLabel: 'Form Teacher',
      gradeSupervisorLabel: '',
      principalLabel: 'Head',
      vicePrincipalLabel: '',
      gradingSystem: 'weighted',
    });
  });

  it('reads a typed signature, and treats a missing or unknown grading system as flat', () => {
    expect(applyInstitutionDoc(blank(), { authorizedSignature: { mode: 'text', text: 'Dr. Smith' } })).toMatchObject({
      signatureMode: 'text',
      signatureText: 'Dr. Smith',
      signatureDataUrl: null,
      gradingSystem: 'flat',
    });
    expect(applyInstitutionDoc(blank(), { gradingSystem: 'other' }).gradingSystem).toBe('flat');
    expect(applyInstitutionDoc(blank(), {})).toMatchObject({ signatureMode: 'text', gradingSystem: 'flat' });
  });
});

describe('profileUpdate', () => {
  it('saves empty text as null, blank role labels as their defaults, and marks the profile complete', () => {
    expect(profileUpdate(blank({ name: 'Riverside' }))).toEqual({
      name: 'Riverside',
      motto: null,
      phone: null,
      email: null,
      address: null,
      logoUrl: null,
      authorizedSignature: { mode: 'text', text: null },
      classSupervisorLabel: 'Class Supervisor',
      gradeSupervisorLabel: 'Grade Supervisor',
      principalLabel: 'Principal',
      vicePrincipalLabel: 'Vice Principal',
      gradingSystem: 'flat',
      profileComplete: true,
    });
  });

  it('saves what was filled in', () => {
    const saved = profileUpdate(
      blank({
        name: 'Riverside',
        motto: 'Onward',
        phone: '+1-876-555-1234',
        email: 'office@example.com',
        address: '1 Main St',
        logoDataUrl: 'data:image/png;base64,AAAA',
        signatureMode: 'image',
        signatureDataUrl: 'data:image/png;base64,BBBB',
        signatureText: 'ignored while the signature is an image',
        principalLabel: 'Head',
        gradingSystem: 'weighted',
      }),
    );
    expect(saved).toMatchObject({
      motto: 'Onward',
      phone: '+1-876-555-1234',
      email: 'office@example.com',
      address: '1 Main St',
      logoUrl: 'data:image/png;base64,AAAA',
      authorizedSignature: { mode: 'image', imageUrl: 'data:image/png;base64,BBBB' },
      principalLabel: 'Head',
      gradingSystem: 'weighted',
      profileComplete: true,
    });
  });

  it('saves a typed signature as text', () => {
    expect(profileUpdate(blank({ signatureText: 'Dr. Smith' })).authorizedSignature).toEqual({ mode: 'text', text: 'Dr. Smith' });
  });
});
