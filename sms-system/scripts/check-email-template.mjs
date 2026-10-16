#!/usr/bin/env node
/**
 * Checks the EmailJS first-sign-in template BEFORE it is pasted into the EmailJS dashboard.
 *
 * Why: EmailJS templates are Mustache, and Mustache parses double-brace text even inside HTML
 * comments. An unclosed tag (for example a comment that mentions "{{#...}}") makes EmailJS send
 * "Template: One or more dynamic variables are corrupted" as the body of every email once the
 * template is saved. See docs/email-templates/README.md.
 *
 * Checks (scripts/emailTemplateCheckLogic.mjs): no braces in comments, no comments at all,
 * balanced sections (none are allowed), only variables the app sends, the required variables,
 * no <style>/<script>/flexbox, size, and a clean sample render.
 *
 * Usage:
 *   node scripts/check-email-template.mjs [path-to-template.html]
 *   npm run check:email-template
 *
 * Exits 0 when the template is fine, 1 when it is not (each problem is printed).
 */

import { readFileSync, existsSync } from 'node:fs';
import { findTemplateProblems } from './emailTemplateCheckLogic.mjs';

const path = process.argv[2] ?? 'docs/email-templates/first-sign-in-email.html';
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/check-email-template.mjs [path-to-template.html]');
  process.exit(0);
}
if (!existsSync(path)) {
  console.error(`Template not found: ${path}`);
  process.exit(1);
}

const problems = findTemplateProblems(readFileSync(path, 'utf8'));
if (problems.length === 0) {
  console.log(`OK: ${path} is safe to paste into EmailJS.`);
  process.exit(0);
}
console.error(`${path} has ${problems.length} problem(s):`);
for (const problem of problems) console.error(`  - ${problem}`);
process.exit(1);
