import { describe, expect, it } from 'vitest';
import {
  EMAIL_TEMPLATE_VARIABLES,
  MAX_TEMPLATE_BYTES,
  MUSTACHE_RULE,
  REQUIRED_VARIABLES,
  escapeHtml,
  findTemplateProblems,
  renderVariables,
} from '../../../scripts/emailTemplateCheckLogic.mjs';
import { buildLoginEmailParams } from '../loginEmail/payload';
import templateRaw from '../../../docs/email-templates/first-sign-in-email.html?raw';
import checkScriptRaw from '../../../scripts/check-email-template.mjs?raw';

// The first-sign-in email template is pasted by hand into EmailJS, which parses it as Mustache.
// On 2026-10-16 an HTML comment that mentioned "{{#...}}" opened a section that was never closed
// and EmailJS delivered "Template: One or more dynamic variables are corrupted" as the email
// body. These tests keep the tracked template, and the rule behind that failure, from regressing.
// Rule and recovery steps: docs/email-templates/README.md.

const template = templateRaw.replace(/\r\n/g, '\n');

// A tiny page that satisfies every rule, used as the base for the failing variants.
const GOOD = `<!DOCTYPE html><html><body>
<img src="{{logo_url}}" alt="x" width="96" />
<p>{{portal_name}} {{to_name}} {{role_label}} {{to_email}}</p>
<a href="{{login_url}}">Open</a>
</body></html>`;

describe('the tracked first-sign-in template', () => {
  it('has no problems', () => {
    expect(findTemplateProblems(template)).toEqual([]);
  });

  it('contains no HTML comment and no section or unescaped tag at all', () => {
    expect(template).not.toContain('<!--');
    expect(template).not.toMatch(/\{\{[#^/&!>={]/);
  });

  it('only uses plain {{variable}} tags that the app sends', () => {
    const used = new Set([...template.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map((m) => m[1]));
    for (const name of used) expect(EMAIL_TEMPLATE_VARIABLES, name).toContain(name);
    for (const name of REQUIRED_VARIABLES) expect([...used], name).toContain(name);
  });

  it('shows the logo at 96 px with both the attribute and the CSS width', () => {
    expect(template).toContain('width="96"');
    expect(template).toContain('width:96px');
    expect(template).not.toContain('fit-content');
  });

  it('renders with every value filled in and no braces left', () => {
    const params = buildLoginEmailParams({
      appUrl: 'https://app.example.com',
      institutionId: 'inst1',
      role: 'student',
      name: 'Ann <Lee> & "Co"',
      email: 'ann@example.com',
      settings: {
        enabled: true,
        emailjs: { publicKey: 'pk', serviceId: 'svc', templateId: 'tpl' },
        portalName: 'GENR8-3D Portal',
        logoUrl: 'https://academy.genr83d.com/assets/genr8-3d-email-icon.png',
      },
    });
    const html = renderVariables(template, params);
    expect(html).not.toContain('{{');
    expect(html).not.toContain('}}');
    expect(html).toContain('GENR8-3D Portal');
    expect(html).toContain(escapeHtml('https://app.example.com/login/inst1/student'));
    expect(html).toContain('Ann &lt;Lee&gt; &amp; &quot;Co&quot;');
  });
});

describe('the variable list', () => {
  it('matches the keys the app sends (buildLoginEmailParams)', () => {
    const params = buildLoginEmailParams({
      appUrl: 'https://a.test',
      institutionId: 'i',
      role: 'student',
      name: 'N',
      email: 'n@x.com',
      settings: { enabled: true, emailjs: { publicKey: 'p', serviceId: 's', templateId: 't' }, portalName: 'P' },
    });
    expect([...EMAIL_TEMPLATE_VARIABLES].sort()).toEqual(Object.keys(params).sort());
  });
});

describe('findTemplateProblems', () => {
  it('accepts a clean page', () => {
    expect(findTemplateProblems(GOOD)).toEqual([]);
  });

  it('rejects the exact 2026-10-16 failure: an unclosed {{#...}} inside an HTML comment', () => {
    const bad = GOOD.replace('<body>', '<body><!-- the last three drive the {{#...}} sections -->');
    const problems = findTemplateProblems(bad).join('\n');
    expect(problems).toContain('an HTML comment contains double braces');
    expect(problems).toContain(MUSTACHE_RULE);
    expect(problems).toContain('Unclosed section "..."');
  });

  it('rejects braces in any comment, even a harmless-looking variable name', () => {
    const problems = findTemplateProblems(GOOD.replace('<body>', '<body><!-- uses {{to_email}} -->'));
    expect(problems.join('\n')).toContain('contains double braces');
  });

  it('rejects any other HTML comment but allows an Outlook conditional comment', () => {
    expect(findTemplateProblems(GOOD.replace('<body>', '<body><!-- note -->')).join('\n')).toContain('HTML comments are not allowed');
    const mso = GOOD.replace('<body>', '<body><!--[if mso]><table><tr><td><![endif]-->');
    expect(findTemplateProblems(mso)).toEqual([]);
  });

  it('rejects unclosed, unopened and mismatched sections', () => {
    const open = GOOD.replace('<p>', '{{#is_student}}<p>');
    expect(findTemplateProblems(open, EMAIL_TEMPLATE_VARIABLES, { allowSections: true }).join('\n')).toContain('Unclosed section "is_student"');
    const close = GOOD.replace('</p>', '</p>{{/is_student}}');
    expect(findTemplateProblems(close, EMAIL_TEMPLATE_VARIABLES, { allowSections: true }).join('\n')).toContain('Unopened section "is_student"');
    const mismatch = GOOD.replace('<p>', '{{#is_student}}<p>').replace('</p>', '</p>{{/is_teacher}}');
    expect(findTemplateProblems(mismatch, EMAIL_TEMPLATE_VARIABLES, { allowSections: true }).join('\n')).toContain('Unclosed section "is_student"');
  });

  it('accepts balanced sections only when sections are allowed', () => {
    const ok = GOOD.replace('<p>', '{{#is_student}}<p>').replace('</p>', '</p>{{/is_student}}');
    expect(findTemplateProblems(ok, EMAIL_TEMPLATE_VARIABLES, { allowSections: true })).toEqual([]);
    expect(findTemplateProblems(ok).join('\n')).toContain('is not allowed');
  });

  it('rejects unescaped output, partials and Mustache comments', () => {
    for (const tag of ['{{{to_name}}}', '{{&to_name}}', '{{>part}}', '{{!note}}', '{{=<% %>=}}']) {
      expect(findTemplateProblems(GOOD.replace('<p>', `<p>${tag}`)).length, tag).toBeGreaterThan(0);
    }
  });

  it('rejects a variable the app does not send, a missing required variable, and a stray brace', () => {
    expect(findTemplateProblems(GOOD.replace('{{to_name}}', '{{full_name}}')).join('\n')).toContain('"full_name" is not one the app sends');
    expect(findTemplateProblems(GOOD.replace('{{to_name}}', '')).join('\n')).toContain('never uses {{to_name}}');
    expect(findTemplateProblems(GOOD.replace('<p>', '<p>{{to_name')).join('\n')).toContain('no matching');
  });

  it('requires the link and the logo to be wired to their variables', () => {
    expect(findTemplateProblems(GOOD.replace('href="{{login_url}}"', 'href="#"')).join('\n')).toContain('href="{{login_url}}"');
    expect(findTemplateProblems(GOOD.replace('src="{{logo_url}}"', 'src="x.png"')).join('\n')).toContain('src="{{logo_url}}"');
  });

  it('rejects style blocks, scripts, flexbox and oversized templates', () => {
    expect(findTemplateProblems(GOOD.replace('<body>', '<style>p{}</style><body>')).join('\n')).toContain('<style>');
    expect(findTemplateProblems(GOOD.replace('<body>', '<script></script><body>')).join('\n')).toContain('<script>');
    expect(findTemplateProblems(GOOD.replace('<p>', '<p style="display: flex">')).join('\n')).toContain('Flexbox');
    expect(findTemplateProblems(GOOD + 'x'.repeat(MAX_TEMPLATE_BYTES)).join('\n')).toContain('bytes');
  });
});

describe('check-email-template.mjs (source checks)', () => {
  it('defaults to the tracked template and exits 1 on problems', () => {
    expect(checkScriptRaw).toContain("'docs/email-templates/first-sign-in-email.html'");
    expect(checkScriptRaw).toContain('process.exit(1)');
    expect(checkScriptRaw).toContain('findTemplateProblems');
  });
});
