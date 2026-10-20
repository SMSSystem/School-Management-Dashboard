import { z } from '@/lib/zod';
import { formatPhone } from '@/lib/phone';
import type { AuthorizedSignature, GradingSystem } from '@/lib/firebase';
import type { InstitutionBrand } from '@/lib/AuthContext';

// The institution profile wizard's rules that need no screen or database (scenes/(dashboard)/institution-profile):
// the step names, the form data and what it starts from, the checks each step makes before moving on, how the
// saved institution document fills the form, and the fields a finished profile is saved as.

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type WizardData = {
  name: string;
  motto: string;
  phone: string;
  email: string;
  address: string;
  logoDataUrl: string | null;
  signatureMode: 'image' | 'text';
  signatureDataUrl: string | null;
  signatureText: string;
  classSupervisorLabel: string;
  gradeSupervisorLabel: string;
  principalLabel: string;
  vicePrincipalLabel: string;
  gradingSystem: GradingSystem;
};

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const step1Schema = z.object({
  name:  z.string().min(1, 'Institution name is required.'),
  motto: z.string().max(200, 'Motto must be 200 characters or fewer.').optional(),
});

export const step2Schema = z.object({
  phone:   z.string().optional(),
  email:   z.string().email('Invalid email address.').optional().or(z.literal('')),
  address: z.string().max(300, 'Address must be 300 characters or fewer.').optional(),
});

export const step5Schema = z.object({
  classSupervisorLabel: z.string().max(50, 'Max 50 characters.').optional(),
  gradeSupervisorLabel: z.string().max(50, 'Max 50 characters.').optional(),
  principalLabel:       z.string().max(50, 'Max 50 characters.').optional(),
  vicePrincipalLabel:   z.string().max(50, 'Max 50 characters.').optional(),
});

export const parseErrors = (err: z.ZodError): Record<string, string> => {
  const out: Record<string, string> = {};
  err.issues.forEach((e) => { if (e.path[0]) out[String(e.path[0])] = e.message; });
  return out;
};

// ─── Labels ───────────────────────────────────────────────────────────────────

export const STEP_LABELS = ['Basic Info', 'Contact', 'Logo', 'Signature', 'Role Labels', 'Grading System', 'Review'];

export const CALENDAR_MODE_OPTIONS: { value: 'academic_year' | 'custom'; label: string; description: string }[] = [
  {
    value: 'academic_year',
    label: 'Academic Year',
    description: 'A traditional school year split into terms (e.g. Christmas, Easter, Summer). Most institutions want this.',
  },
  {
    value: 'custom',
    label: 'Custom Time Blocks',
    description: 'Independent, fixed-duration programmes (e.g. 10-week evening courses) that can run concurrently instead of one shared school year.',
  },
];

// ─── The checks each step makes before moving on: the errors to show, or null ─

export function validateBasicInfo(data: WizardData): Record<string, string> | null {
  const result = step1Schema.safeParse({ name: data.name, motto: data.motto || undefined });
  return result.success ? null : parseErrors(result.error);
}

export function validateContact(data: WizardData): Record<string, string> | null {
  const result = step2Schema.safeParse({
    phone:   data.phone   || undefined,
    email:   data.email   || undefined,
    address: data.address || undefined,
  });
  return result.success ? null : parseErrors(result.error);
}

/** Only a typed signature has a length to check; an image signature is checked when it is resized. */
export function validateSignatureText(data: WizardData): Record<string, string> | null {
  if (data.signatureMode === 'text' && data.signatureText.length > 30) {
    return { signatureText: 'Signature text must be 30 characters or fewer.' };
  }
  return null;
}

export function validateRoleLabels(data: WizardData): Record<string, string> | null {
  const result = step5Schema.safeParse({
    classSupervisorLabel: data.classSupervisorLabel || undefined,
    gradeSupervisorLabel: data.gradeSupervisorLabel || undefined,
    principalLabel:       data.principalLabel       || undefined,
    vicePrincipalLabel:   data.vicePrincipalLabel   || undefined,
  });
  return result.success ? null : parseErrors(result.error);
}

// ─── What the form starts from, and how the saved document fills it ──────────

/** The form before the institution document is read: what the signed-in profile already knows. */
export function initialWizardData(institution: InstitutionBrand | null): WizardData {
  return {
    name:                institution?.name   ?? '',
    motto:               institution?.motto  ?? '',
    phone:               formatPhone(institution?.phone ?? ''),
    email:               institution?.email  ?? '',
    address:             institution?.address ?? '',
    logoDataUrl:         institution?.logoUrl ?? null,
    signatureMode:       'text',
    signatureDataUrl:    null,
    signatureText:       '',
    classSupervisorLabel: '',
    gradeSupervisorLabel: '',
    principalLabel:      '',
    vicePrincipalLabel:  '',
    gradingSystem:       'flat',
  };
}

/** The saved institution document's signature, role labels and grading system, laid over the form. */
export function applyInstitutionDoc(prev: WizardData, d: Record<string, unknown>): WizardData {
  const sig = d.authorizedSignature as AuthorizedSignature | undefined;
  return {
    ...prev,
    signatureMode:        sig?.mode    ?? 'text',
    signatureDataUrl:     sig?.imageUrl ?? null,
    signatureText:        sig?.text     ?? '',
    classSupervisorLabel: (d.classSupervisorLabel as string | undefined) ?? '',
    gradeSupervisorLabel: (d.gradeSupervisorLabel as string | undefined) ?? '',
    principalLabel:       (d.principalLabel       as string | undefined) ?? '',
    vicePrincipalLabel:   (d.vicePrincipalLabel   as string | undefined) ?? '',
    gradingSystem:        ((d.gradingSystem as string | undefined) === 'weighted' ? 'weighted' : 'flat') as GradingSystem,
  };
}

/** The fields a finished profile is saved as: empty text becomes null, a blank role label its default. */
export function profileUpdate(data: WizardData) {
  return {
    name:    data.name,
    motto:   data.motto   || null,
    phone:   data.phone   || null,
    email:   data.email   || null,
    address: data.address || null,
    logoUrl: data.logoDataUrl || null,
    authorizedSignature:
      data.signatureMode === 'image'
        ? { mode: 'image', imageUrl: data.signatureDataUrl }
        : { mode: 'text',  text: data.signatureText || null },
    classSupervisorLabel: data.classSupervisorLabel || 'Class Supervisor',
    gradeSupervisorLabel: data.gradeSupervisorLabel || 'Grade Supervisor',
    principalLabel:       data.principalLabel       || 'Principal',
    vicePrincipalLabel:   data.vicePrincipalLabel   || 'Vice Principal',
    gradingSystem:        data.gradingSystem,
    profileComplete: true,
  };
}
