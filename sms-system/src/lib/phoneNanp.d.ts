export type PhoneSkipReason =
  | 'invalid-nanp-digits'
  | 'bare-not-allowed'
  | 'bare-institution-not-nanp';

export type PhonePlan =
  | { action: 'unchanged' }
  | { action: 'convert'; next: string; kind: 'explicit' | 'bare' }
  | { action: 'skip'; reason: PhoneSkipReason };

export type PhonePlanContext = {
  /** The owning institution's own phone is a +1 number. */
  institutionIsNanp?: boolean | null;
  /** Whether a bare 10-digit number may be converted at all. */
  allowBare?: boolean;
};

export function isNanpValid(tenDigits: string): boolean;
export function formatNanpDigits(digits: string): string | null;
export function formatNanpProgressive(digits: string): string;
export function isNanpPhone(value: unknown): boolean;
export function planPhoneChange(raw: unknown, ctx?: PhonePlanContext): PhonePlan;
