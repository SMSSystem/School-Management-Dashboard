// Pure decisions for scripts/rename-institution.mjs (no I/O, so they can be unit tested
// from src/lib/__tests__/renameInstitution.test.ts).

/** Documents in `institutions` that are not schools; never renamed (see backfill-registration-directory.mjs). */
export const NON_INSTITUTION_IDS = ['_placeholder', '_platform', 'master'];

/** The longest name InstitutionForm accepts. */
export const MAX_NAME_LENGTH = 100;

/** Firestore allows 500 writes per batch; stay below it. */
export const BATCH_SIZE = 400;

/** A name trimmed, or null when it is empty, not text, or longer than the form allows. */
export function normalizeName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

/**
 * Which institution to rename.
 *  - blocked: a name is invalid, the old and new names are the same, no institution matches,
 *    or more than one does (the script never guesses);
 *  - rename: the one institution. `nameChange` is false when its name already is the new one
 *    (a re-run after a partial failure still has copies to fix).
 *
 * Without --institution-id an institution matches when its name equals the old OR the new
 * name, so a run that stopped half-way can be repeated with the same arguments.
 */
export function planInstitutionRename({ institutions, fromName, toName, institutionId }) {
  const from = normalizeName(fromName);
  const to = normalizeName(toName);
  if (!from || !to) {
    return { action: 'blocked', reason: `names must be 1 to ${MAX_NAME_LENGTH} characters` };
  }
  if (from === to) return { action: 'blocked', reason: 'the old and new names are the same' };

  const real = (institutions ?? []).filter((i) => i && !NON_INSTITUTION_IDS.includes(i.id));
  let matches;
  if (institutionId) {
    if (NON_INSTITUTION_IDS.includes(institutionId)) {
      return { action: 'blocked', reason: `"${institutionId}" is a system document, not a school` };
    }
    matches = real.filter((i) => i.id === institutionId);
    if (matches.length === 0) return { action: 'blocked', reason: `no institution has the id "${institutionId}"` };
    const current = typeof matches[0].name === 'string' ? matches[0].name.trim() : '';
    if (current !== from && current !== to) {
      return {
        action: 'blocked',
        reason: `institution "${institutionId}" is named "${current}", which is neither "${from}" nor "${to}"`,
      };
    }
  } else {
    matches = real.filter((i) => {
      const current = typeof i.name === 'string' ? i.name.trim() : '';
      return current === from || current === to;
    });
    if (matches.length === 0) return { action: 'blocked', reason: `no institution is named "${from}" or "${to}"` };
    if (matches.length > 1) {
      return {
        action: 'blocked',
        reason: `${matches.length} institutions match (${matches.map((m) => m.id).join(', ')}); pass --institution-id`,
      };
    }
  }
  const target = matches[0];
  const current = typeof target.name === 'string' ? target.name.trim() : '';
  return { action: 'rename', id: target.id, from, to, nameChange: current !== to };
}

/**
 * Stored-copy documents to update: those whose `institutionName` is exactly the old name.
 * `docs` is [{ ref, institutionName }]; anything else (already new, or some other text) is left alone.
 */
export function pickSnapshotsToUpdate(docs, fromName) {
  const from = normalizeName(fromName);
  if (!from) return [];
  return (docs ?? []).filter((d) => d && typeof d.institutionName === 'string' && d.institutionName.trim() === from);
}

/** Whether the registration_directory entry needs its name written. */
export function directoryNeedsUpdate(directoryDoc, toName) {
  const to = normalizeName(toName);
  if (!to) return false;
  if (!directoryDoc) return false;
  return directoryDoc.name !== to;
}

/** Whether email_settings/config needs its portalName written (only when a portal name was asked for). */
export function portalNeedsUpdate(settingsDoc, portalName) {
  const portal = normalizeName(portalName);
  if (!portal) return false;
  if (!settingsDoc) return false;
  return settingsDoc.portalName !== portal;
}

/** The longest logo URL accepted (browsers and EmailJS cope with far longer, but nothing sane needs it). */
export const MAX_LOGO_URL_LENGTH = 2048;

/**
 * A logo URL trimmed, or null when it is not an https URL without spaces. This is the same
 * rule the app applies when it reads email_settings/config (src/lib/loginEmail/emailSettings.ts),
 * which silently drops any other value, so the script must refuse it up front.
 */
export function normalizeLogoUrl(raw) {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (url.length === 0 || url.length > MAX_LOGO_URL_LENGTH) return null;
  return /^https:\/\/\S+$/.test(url) ? url : null;
}

/** Whether email_settings/config needs its logoUrl written (only when a logo URL was asked for). */
export function logoNeedsUpdate(settingsDoc, logoUrl) {
  const logo = normalizeLogoUrl(logoUrl);
  if (!logo) return false;
  if (!settingsDoc) return false;
  return settingsDoc.logoUrl !== logo;
}

/** Splits a list into batches of at most `size`. */
export function chunk(list, size = BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
