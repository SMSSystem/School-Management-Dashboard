// Templates use {token} placeholders substituted by renderComment(). Capitalized
// token names (e.g. {He_She}) render capitalized — use them at sentence starts.
export const COMMENT_KEY: readonly string[] = [
  "{name_of_student} is a keen student who has consistently done well in {name_of_subject}. {His_Her} dedication is commendable, and {he_she} is encouraged to maintain this positive momentum.",
  "{name_of_student} has shown very little interest in the subject and did not perform at {his_her} full potential. I encourage {him_her} to approach future learning with greater curiosity and persistence.",
  "{name_of_student} has shown very little interest in the subject and had absolutely no respect for authority. Greater discipline and focus are essential if {he_she} intends to do well.",
  "{name_of_student} has done a fair term's work, however, {he_she} can achieve much more with greater effort and focus.",
  "{name_of_student} performed fairly throughout the term, however, {his_her} exam grade did not fully demonstrate {his_her} true potential.",
  "{name_of_student} has done a satisfactory term's work, however, {his_her} exam grade did not fully demonstrate {his_her} true potential.",
  "{student_possessive} term work is commendable and reflects consistent effort. However, {his_her} exam grade did not fully demonstrate {his_her} true potential.",
  "{name_of_student} is capable of achieving much more with greater effort and focus.",
  "{name_of_student} has shown notable improvement. {He_She} must be commended for {his_her} performance in the exam.",
  "{name_of_student} demonstrates willingness to learn despite finding the subject difficult. {He_She} requires additional support.",
  "{name_of_student} has done a satisfactory term's work and showed some improvement on the final exam. {He_She} has the potential to achieve great results.",
  "{name_of_student} has done a satisfactory term's work. {He_She} has the potential to achieve great results.",
  "{name_of_student} has shown very little interest in the subject and has absolutely no respect for authority. Greater discipline and focus are essential if {he_she} intends to do well.",
  "{name_of_student} has produced a fair term's work and a commendable exam result.",
  "{student_possessive} performance throughout the term and on the final exam is commendable and reflects consistent effort.",
  "{name_of_student} struggled during the term but made progress on the final exam. With dedication, further improvement is achievable.",
  "{name_of_student} performed fairly throughout the term but showed some improvement on the final exam. {He_She} has the potential to achieve great results.",
  "{student_possessive} poor attendance has negatively affected {his_her} academic performance.",
  "{name_of_student} has failed to submit a number of assignments.",
  "Needs individual attention.",
] as const;

export type CommentGender = 'Male' | 'Female' | null | undefined;

export type CommentRenderContext = {
  studentName?: string;
  gender?: CommentGender;
  subjectName?: string;
};

const PRONOUNS: Record<'Male' | 'Female', Record<'he_she' | 'his_her' | 'him_her', string>> = {
  Male: { he_she: 'he', his_her: 'his', him_her: 'him' },
  Female: { he_she: 'she', his_her: 'her', him_her: 'her' },
};

const NEUTRAL_PRONOUNS: Record<'he_she' | 'his_her' | 'him_her', string> = {
  he_she: 'he/she',
  his_her: 'his/her',
  him_her: 'him/her',
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function pronoun(kind: 'he_she' | 'his_her' | 'him_her', gender: CommentGender, capitalized: boolean): string {
  const base = gender === 'Male' || gender === 'Female' ? PRONOUNS[gender][kind] : NEUTRAL_PRONOUNS[kind];
  return capitalized ? capitalize(base) : base;
}

// Renders a COMMENT_KEY template for a specific student/subject. Called with no
// context (e.g. for a generic legend), names/subject fall back to "The student"/
// "the subject" and pronouns fall back to the neutral "he/she" style.
export function renderComment(template: string, ctx: CommentRenderContext = {}): string {
  const name = ctx.studentName?.trim() || 'The student';
  const subjectName = ctx.subjectName?.trim() || 'the subject';
  const possessive = `${name}'s`;

  return template
    .replaceAll('{name_of_student}', name)
    .replaceAll('{name_of_subject}', subjectName)
    .replaceAll('{student_possessive}', possessive)
    .replaceAll('{he_she}', pronoun('he_she', ctx.gender, false))
    .replaceAll('{He_She}', pronoun('he_she', ctx.gender, true))
    .replaceAll('{his_her}', pronoun('his_her', ctx.gender, false))
    .replaceAll('{His_Her}', pronoun('his_her', ctx.gender, true))
    .replaceAll('{him_her}', pronoun('him_her', ctx.gender, false))
    .replaceAll('{Him_Her}', pronoun('him_her', ctx.gender, true));
}
