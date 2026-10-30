import process from 'node:process';

// The names and addresses of the QA fixtures the specs create or look for, in one place, so that moving the suite to another
// institution is a change to .env.qa and not to the code. playwright.config.ts loads .env.qa before any spec is read.
//   QA_EMAIL_PREFIX     the start of every fixture address (default "qa", which keeps qa.lessons.teacher@demo.com and the rest).
//                       Firebase Auth addresses are global, so a second institution needs another prefix (for example "qa.bf").
//   QA_DEPARTMENT_NAME  the department the QA teachers belong to (default "QA Department").
//   QA_TERM_NAME        the term the QA classes, subjects and exams use (default "QA Term").

const clean = (value: string | undefined) => (value ?? '').trim();

/** The fixture address start: QA_EMAIL_PREFIX, or "qa". */
export const QA_EMAIL_PREFIX = clean(process.env.QA_EMAIL_PREFIX) || 'qa';

/** `qaEmail('lessons.teacher')` is "qa.lessons.teacher@demo.com" with the default prefix. */
export const qaEmail = (name: string): string => `${QA_EMAIL_PREFIX}.${name}@demo.com`;

export const DEPARTMENT_NAME = clean(process.env.QA_DEPARTMENT_NAME) || 'QA Department';
export const TERM_NAME = clean(process.env.QA_TERM_NAME) || 'QA Term';
