// Pure checks for the first-sign-in EmailJS template (no I/O, so they can be unit tested from
// src/lib/__tests__/emailTemplate.test.ts and run by scripts/check-email-template.mjs).
//
// Why this exists: EmailJS templates are Mustache. Mustache has no HTML comments, so any
// double-brace text inside <!-- --> is parsed like the rest of the template. On 2026-10-16 a
// header comment that said "the {{#...}} sections" opened a section named "..." that was never
// closed, and EmailJS delivered the text "Template: One or more dynamic variables are
// corrupted" as the body of every email. The rules below make that class of mistake fail here
// instead of in production. The parser mirrors mustache.js's section handling (parseTemplate).

/** The variables the app sends (keys of buildLoginEmailParams in src/lib/loginEmail/payload.ts); a test keeps this in step. */
export const EMAIL_TEMPLATE_VARIABLES = [
  'to_email',
  'to_name',
  'portal_name',
  'role_label',
  'login_url',
  'logo_url',
  'reply_to',
  'subject',
  'is_student',
  'is_teacher',
  'is_spectator',
];

/** Variables the body must use. `reply_to` and `subject` are EmailJS settings fields, not body text. */
export const REQUIRED_VARIABLES = ['to_email', 'to_name', 'portal_name', 'role_label', 'login_url', 'logo_url'];

/** Gmail clips a message near 102 KB; stay well below it. */
export const MAX_TEMPLATE_BYTES = 100_000;

export const MUSTACHE_RULE =
  'EmailJS parses double-brace text everywhere, including inside HTML comments (it is Mustache, which has no ' +
  'HTML comments). A tag like {{#x}} that is never closed makes EmailJS answer "One or more dynamic variables ' +
  'are corrupted". Remove the comment: the pasted HTML has no comments, and explanations belong in ' +
  'docs/email-templates/README.md.';

const TAG_RE = /\{\{(\{?)\s*([#^/&!>=]?)\s*([\s\S]*?)\s*\}?\}\}/g;

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** HTML-escapes a value the way EmailJS/Mustache does for {{double}} braces. */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g, '&#x60;')
    .replace(/=/g, '&#x3D;');
}

/** Replaces plain {{variable}} tags with escaped values; leaves anything else untouched. */
export function renderVariables(html, params) {
  return html.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_all, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? escapeHtml(params[name]) : '',
  );
}

/**
 * Everything wrong with the template, as human-readable lines (empty array = fine).
 * options.allowSections (default false): the shipped template uses no conditional sections
 * because they were never verified on the EmailJS dashboard.
 */
export function findTemplateProblems(html, allowedVariables = EMAIL_TEMPLATE_VARIABLES, options = {}) {
  const allowSections = options.allowSections === true;
  const problems = [];
  const allowed = new Set(allowedVariables);

  // 1) HTML comments
  const commentRe = /<!--([\s\S]*?)-->/g;
  let cm;
  while ((cm = commentRe.exec(html)) !== null) {
    const body = cm[1];
    const line = lineOf(html, cm.index);
    if (body.includes('{{')) {
      problems.push(`Line ${line}: an HTML comment contains double braces. ${MUSTACHE_RULE}`);
    } else if (!/^\[if\b|^<!\[endif\]|^\[endif\]/.test(body.trim())) {
      problems.push(`Line ${line}: HTML comments are not allowed in the pasted template (conditional comments for Outlook are the only exception).`);
    }
  }
  if (/<!--/.test(html.replace(commentRe, ''))) {
    problems.push('An HTML comment is never closed (missing -->).');
  }

  // 2) tags
  const stack = [];
  const seenVariables = new Set();
  const matches = [];
  let tm;
  TAG_RE.lastIndex = 0;
  while ((tm = TAG_RE.exec(html)) !== null) matches.push({ triple: tm[1] === '{', type: tm[2], name: tm[3].trim(), index: tm.index });
  const openCount = html.split('{{').length - 1;
  if (openCount !== matches.length) {
    problems.push(`A "{{" has no matching "}}" (${openCount} openings, ${matches.length} complete tags).`);
  }

  for (const tag of matches) {
    const where = `Line ${lineOf(html, tag.index)}`;
    if (tag.triple || tag.type === '&') {
      problems.push(`${where}: unescaped output ({{{x}}} or {{&x}}) is not allowed; it bypasses HTML escaping.`);
      continue;
    }
    if (tag.type === '>' || tag.type === '=' || tag.type === '!') {
      problems.push(`${where}: {{${tag.type}${tag.name}}} (partial, delimiter change or Mustache comment) is not used in this template.`);
      continue;
    }
    if (tag.type === '#' || tag.type === '^') {
      stack.push(tag);
      if (!allowSections) problems.push(`${where}: section {{${tag.type}${tag.name}}} is not allowed (conditional sections were never verified on the EmailJS dashboard).`);
      if (!allowed.has(tag.name)) problems.push(`${where}: section name "${tag.name}" is not a variable the app sends.`);
      continue;
    }
    if (tag.type === '/') {
      const opener = stack.pop();
      if (!opener) problems.push(`${where}: Unopened section "${tag.name}".`);
      else if (opener.name !== tag.name) problems.push(`${where}: Unclosed section "${opener.name}" (this closing tag is "${tag.name}").`);
      continue;
    }
    seenVariables.add(tag.name);
    if (!allowed.has(tag.name)) problems.push(`${where}: variable "${tag.name}" is not one the app sends (${[...allowed].join(', ')}).`);
  }
  for (const opener of stack) {
    problems.push(`Line ${lineOf(html, opener.index)}: Unclosed section "${opener.name}".`);
  }

  // 3) required variables, in the right attributes
  for (const name of REQUIRED_VARIABLES) {
    if (!seenVariables.has(name)) problems.push(`The body never uses {{${name}}}.`);
  }
  if (!/href="\{\{login_url\}\}"/.test(html)) problems.push('The sign-in button/link must be href="{{login_url}}".');
  if (!/<img\b[^>]*\bsrc="\{\{logo_url\}\}"/.test(html)) problems.push('The logo must be <img src="{{logo_url}}">.');

  // 4) markup the target email clients mishandle
  if (/<style\b/i.test(html)) problems.push('<style> blocks are not allowed (Outlook ignores them); use inline styles.');
  if (/<script\b/i.test(html)) problems.push('<script> is not allowed in an email.');
  if (/display\s*:\s*flex/i.test(html)) problems.push('Flexbox is not allowed (Outlook ignores it); use tables.');

  // 5) size
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_TEMPLATE_BYTES) problems.push(`The template is ${bytes} bytes; keep it under ${MAX_TEMPLATE_BYTES} (Gmail clips near 102,000).`);

  // 6) a sample render must leave no braces behind (renderVariables does not evaluate sections,
  //    so this only applies to templates without them, which is the shipped case)
  const hasSections = matches.some((tag) => tag.type === '#' || tag.type === '^' || tag.type === '/');
  if (problems.length === 0 && !hasSections) {
    const sample = Object.fromEntries(allowedVariables.map((name) => [name, `sample-${name}`]));
    const rendered = renderVariables(html, sample);
    if (rendered.includes('{{') || rendered.includes('}}')) problems.push('A sample render still contains "{{" or "}}".');
  }

  return problems;
}
