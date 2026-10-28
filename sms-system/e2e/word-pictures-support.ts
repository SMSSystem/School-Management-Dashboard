import { strToU8, zipSync } from 'fflate';
import { TEXT_CHUNK, buildPng } from '../src/lib/__tests__/imageFixtures';

// A small Word (.docx) file with pictures, for e2e/22-exam-word-pictures.spec.ts. Made here with the zip library, in the
// shape Word writes a picture (an inline drawing, its description, a relationship to a file under word/media):
//
//   Unit test                                 (a title)
//   [picture: the school badge]               above question 1, so it belongs to no question
//   1. Which tool is this?
//   [picture: A vice on a bench]              under the question text, so it is clear (this one carries a text chunk)
//   A. A vice   B. A clamp   Answer: A
//   2. Which is stronger?
//   A. one      B. two
//   [picture: Option picture]                 after the options, so it needs a check
//   Answer: B
//   3. What is 3 + 4?                          no picture
//   A. 6        B. 7         Answer: B

export const WORD_ALT = { badge: 'The school badge', tool: 'A vice on a bench', option: 'Option picture' } as const;

/** The picture of question 1, with a text chunk that says where it was taken (which must not be stored). */
export const WORD_TOOL_PNG = buildPng({ width: 160, height: 100, extra: [TEXT_CHUNK] });

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const picture = (id: string, descr: string) =>
  `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1905000" cy="1270000"/><wp:docPr id="1" name="Picture 1" descr="${descr}"/>` +
  `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

export function docxWithPictures(): Uint8Array {
  const body =
    p('Unit test') + picture('rId1', WORD_ALT.badge) +
    p('1. Which tool is this?') + picture('rId2', WORD_ALT.tool) + p('A. A vice') + p('B. A clamp') + p('Answer: A') +
    p('2. Which is stronger?') + p('A. one') + p('B. two') + picture('rId3', WORD_ALT.option) + p('Answer: B') +
    p('3. What is 3 + 4?') + p('A. 6') + p('B. 7') + p('Answer: B');
  const rels = [
    ['rId1', 'badge.png'],
    ['rId2', 'tool.png'],
    ['rId3', 'option.png'],
  ]
    .map(([id, file]) => `<Relationship Id="${id}" Type="${IMAGE}" Target="media/${file}"/>`)
    .join('');
  return zipSync({
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}</w:body></w:document>`),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`),
    'word/media/badge.png': buildPng({ width: 80, height: 80 }),
    'word/media/tool.png': WORD_TOOL_PNG,
    'word/media/option.png': buildPng({ width: 120, height: 60 }),
  });
}
