import { describe, it, expect } from 'vitest';
import {
  cleanLessonNoteLinks,
  validateLessonNoteLinks,
  validateLessonNoteUrl,
  MAX_LESSON_NOTE_LINKS,
  MAX_LINK_URL_LENGTH,
} from '../lessonNoteLinks';

describe('validateLessonNoteUrl', () => {
  it('accepts http and https URLs', () => {
    expect(validateLessonNoteUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(validateLessonNoteUrl('http://example.com/article')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(validateLessonNoteUrl('  https://example.com  ')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(validateLessonNoteUrl('')).not.toBeNull();
    expect(validateLessonNoteUrl('   ')).not.toBeNull();
  });

  it('rejects strings that are not URLs', () => {
    expect(validateLessonNoteUrl('not a url')).not.toBeNull();
    expect(validateLessonNoteUrl('example.com')).not.toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'ftp://example.com/file',
    'file:///etc/passwd',
  ])('rejects the non-http(s) protocol in %s', (url) => {
    expect(validateLessonNoteUrl(url)).not.toBeNull();
  });

  it('rejects URLs over the length cap', () => {
    const long = 'https://example.com/' + 'a'.repeat(MAX_LINK_URL_LENGTH);
    expect(validateLessonNoteUrl(long)).not.toBeNull();
  });
});

describe('cleanLessonNoteLinks', () => {
  it('drops blank rows, trims, and omits empty labels', () => {
    expect(
      cleanLessonNoteLinks([
        { url: ' https://a.com ', label: ' Intro ' },
        { url: '', label: '' },
        { url: 'https://b.com', label: '   ' },
        { url: 'https://c.com' },
      ]),
    ).toEqual([
      { url: 'https://a.com', label: 'Intro' },
      { url: 'https://b.com' },
      { url: 'https://c.com' },
    ]);
  });
});

describe('validateLessonNoteLinks', () => {
  it('accepts an empty list and a list of good links', () => {
    expect(validateLessonNoteLinks([])).toBeNull();
    expect(validateLessonNoteLinks([{ url: '' }])).toBeNull();
    expect(validateLessonNoteLinks([{ url: 'https://a.com', label: 'A' }])).toBeNull();
  });

  it('flags a label with no URL', () => {
    expect(validateLessonNoteLinks([{ url: '', label: 'Orphan label' }])).not.toBeNull();
  });

  it('flags a bad link anywhere in the list', () => {
    expect(
      validateLessonNoteLinks([{ url: 'https://ok.com' }, { url: 'javascript:alert(1)' }]),
    ).not.toBeNull();
  });

  it('rejects more than the maximum number of links', () => {
    const rows = Array.from({ length: MAX_LESSON_NOTE_LINKS + 1 }, (_, i) => ({
      url: `https://example.com/${i}`,
    }));
    expect(validateLessonNoteLinks(rows)).not.toBeNull();
    expect(validateLessonNoteLinks(rows.slice(0, MAX_LESSON_NOTE_LINKS))).toBeNull();
  });
});
