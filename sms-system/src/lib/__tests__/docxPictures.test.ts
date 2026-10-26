import { describe, expect, it } from 'vitest';
import { strToU8, zipSync, type Zippable } from 'fflate';
import {
  MAX_PICTURE_BYTES,
  MAX_PICTURES,
  PICTURE_MARKER_PREFIX,
  mediaPathOf,
  pictureIndexOf,
  readDocxLines,
} from '../docxText';
import { questionsFromDocx } from '../examDocx';
import { buildPng } from './imageFixtures';

// The pictures of a Word file (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.1): found through the
// document's relationships, written into the lines as marker lines where they stand, with the limits that keep a crafted
// file from costing the browser its memory. The .docx files are made here.

const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
].join(' ');
const IMAGE_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

const rel = (id: string, target: string, extra = '') => `<Relationship Id="${id}" Type="${IMAGE_TYPE}" Target="${target}"${extra}/>`;
const docx = (body: string, rels: string[] = [], media: Zippable = {}, extra: Zippable = {}): Uint8Array =>
  zipSync({
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`),
    ...media,
    ...extra,
  });

const text = (s: string) => `<w:r><w:t xml:space="preserve">${s}</w:t></w:r>`;
const p = (s: string) => `<w:p>${text(s)}</w:p>`;
const drawing = (id: string, o: { alt?: string; crop?: boolean; anchor?: boolean; link?: boolean } = {}) => {
  const body =
    `<wp:docPr id="1" name="Picture 1"${o.alt !== undefined ? ` descr="${o.alt}"` : ''}/>` +
    `<a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip ${o.link ? 'r:link' : 'r:embed'}="${id}"/>${o.crop ? '<a:srcRect l="12000" t="0"/>' : '<a:srcRect/>'}</pic:blipFill></pic:pic></a:graphicData></a:graphic>`;
  return `<w:drawing>${o.anchor ? `<wp:anchor>${body}</wp:anchor>` : `<wp:inline>${body}</wp:inline>`}</w:drawing>`;
};
const picture = (id: string, o?: Parameters<typeof drawing>[1]) => `<w:p><w:r>${drawing(id, o)}</w:r></w:p>`;

const PNG = buildPng({ width: 40, height: 30 });
const PNG_2 = buildPng({ width: 50, height: 20 });
const media = (name: string, bytes: Uint8Array): Zippable => ({ [`word/media/${name}`]: bytes });

describe('where a picture stands in the lines', () => {
  it('writes a marker line after the question text it follows, and keeps the text lines as they were', () => {
    const out = readDocxLines(docx(`${p('1. What is this tool?')}${picture('rId1')}${p('A. A vice')}${p('B. A clamp')}`, [rel('rId1', 'media/image1.png')], media('image1.png', PNG)));
    expect(out.lines).toEqual(['1. What is this tool?', `${PICTURE_MARKER_PREFIX}0`, 'A. A vice', 'B. A clamp']);
    expect(out.notes).toEqual([]);
    expect(out.pictures).toHaveLength(1);
    expect(out.pictures[0]).toMatchObject({ format: 'png', alt: '', cropped: false });
    expect([...out.pictures[0].bytes!]).toEqual([...PNG]);
  });

  it('splits a paragraph around a picture inside it, with no empty lines beside the picture', () => {
    const body = `<w:p>${text('See the figure')}<w:r>${drawing('rId1')}</w:r>${text('then answer')}</w:p>`;
    expect(readDocxLines(docx(body, [rel('rId1', 'media/image1.png')], media('image1.png', PNG))).lines).toEqual([
      'See the figure',
      `${PICTURE_MARKER_PREFIX}0`,
      'then answer',
    ]);
  });

  it('gives a picture-only paragraph one line, and a picture at the start of a paragraph before its text', () => {
    const body = `${picture('rId1')}<w:p><w:r>${drawing('rId1')}</w:r>${text('Caption')}</w:p>`;
    expect(readDocxLines(docx(body, [rel('rId1', 'media/image1.png')], media('image1.png', PNG))).lines).toEqual([
      `${PICTURE_MARKER_PREFIX}0`,
      `${PICTURE_MARKER_PREFIX}1`,
      'Caption',
    ]);
  });

  it('puts a list number in front of the text of a numbered paragraph, never in front of the marker', () => {
    const numbering =
      '<w:numbering ' + NS + '><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
    const body = `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r>${drawing('rId1')}</w:r>${text('Which tool?')}</w:p>`;
    const out = readDocxLines(docx(body, [rel('rId1', 'media/image1.png')], media('image1.png', PNG), { 'word/numbering.xml': strToU8(numbering) }));
    expect(out.lines).toEqual([`${PICTURE_MARKER_PREFIX}0`, '1. Which tool?']);
  });

  it('reads an anchored (floating) picture like an inline one', () => {
    const out = readDocxLines(docx(`${p('Q')}${picture('rId1', { anchor: true })}`, [rel('rId1', 'media/image1.png')], media('image1.png', PNG)));
    expect(out.lines).toEqual(['Q', `${PICTURE_MARKER_PREFIX}0`]);
  });

  it('does not change the lines of a file without pictures', () => {
    const out = readDocxLines(docx(`${p('1. Q?')}<w:p/>${p('A. a')}`));
    expect(out.lines).toEqual(['1. Q?', '', 'A. a']);
    expect(out.pictures).toEqual([]);
  });

  it('knows a marker line and its index', () => {
    expect(pictureIndexOf(`${PICTURE_MARKER_PREFIX}12`)).toBe(12);
    expect(pictureIndexOf('IMG:3')).toBeNull();
    expect(pictureIndexOf(`${PICTURE_MARKER_PREFIX}x`)).toBeNull();
    expect(pictureIndexOf('')).toBeNull();
  });
});

describe('what is kept about a picture', () => {
  it('uses one file for two places, as two pictures with the same bytes', () => {
    const out = readDocxLines(docx(`${picture('rId1')}${picture('rId1')}`, [rel('rId1', 'media/image1.png')], media('image1.png', PNG)));
    expect(out.lines).toEqual([`${PICTURE_MARKER_PREFIX}0`, `${PICTURE_MARKER_PREFIX}1`]);
    expect(out.pictures[0].bytes).toBe(out.pictures[1].bytes);
  });

  it('reads two different files in the order they stand', () => {
    const out = readDocxLines(
      docx(`${picture('rId2')}${picture('rId1')}`, [rel('rId1', 'media/a.png'), rel('rId2', 'media/b.jpeg')], { ...media('a.png', PNG), ...media('b.jpeg', PNG_2) }),
    );
    expect(out.pictures.map((x) => x.format)).toEqual(['jpeg', 'png']);
    expect([...out.pictures[1].bytes!]).toEqual([...PNG]);
  });

  it('carries Word’s description as the alt text, trimmed and on one line', () => {
    const out = readDocxLines(docx(picture('rId1', { alt: '  A vice &amp; a   clamp ' }), [rel('rId1', 'media/image1.png')], media('image1.png', PNG)));
    expect(out.pictures[0].alt).toBe('A vice & a clamp');
  });

  it('says a crop made in Word is not applied, and counts only real crops', () => {
    const out = readDocxLines(docx(`${picture('rId1', { crop: true })}${picture('rId1')}`, [rel('rId1', 'media/image1.png')], media('image1.png', PNG)));
    expect(out.pictures.map((x) => x.cropped)).toEqual([true, false]);
    expect(out.notes).toEqual(['1 picture was cropped in Word; the whole original is used.']);
  });
});

describe('pictures that cannot be used as they are', () => {
  it('keeps the place of an EMF or WMF picture, without its bytes, and tells the teacher what to do', () => {
    const out = readDocxLines(docx(`${picture('rId1')}${picture('rId2')}`, [rel('rId1', 'media/a.emf'), rel('rId2', 'media/b.wmf')], { ...media('a.emf', PNG), ...media('b.wmf', PNG) }));
    expect(out.lines).toEqual([`${PICTURE_MARKER_PREFIX}0`, `${PICTURE_MARKER_PREFIX}1`]);
    expect(out.pictures.map((x) => [x.bytes, x.problem])).toEqual([
      [null, 'unsupported'],
      [null, 'unsupported'],
    ]);
    expect(out.notes).toEqual(['2 pictures are in a format that cannot be imported (EMF or WMF). Save them as PNG or JPEG in Word.']);
  });

  it('passes a GIF or any other format on with its bytes, for the picture check to judge', () => {
    const out = readDocxLines(docx(picture('rId1'), [rel('rId1', 'media/a.gif')], media('a.gif', strToU8('GIF89a'))));
    expect(out.pictures[0]).toMatchObject({ format: 'gif' });
    expect(out.pictures[0].problem).toBeUndefined();
  });

  it('marks a picture whose relationship is missing, external, not an image path or not in the zip', () => {
    const body = ['rIdNone', 'rIdLink', 'rIdOut', 'rIdGone'].map((id) => picture(id)).join('');
    const out = readDocxLines(
      docx(body, [rel('rIdLink', 'https://example.com/a.png', ' TargetMode="External"'), rel('rIdOut', '../customXml/item1.xml'), rel('rIdGone', 'media/none.png')], media('image1.png', PNG)),
    );
    expect(out.lines).toHaveLength(4);
    expect(out.pictures.map((x) => x.problem)).toEqual(['missing', 'missing', 'missing', 'missing']);
    expect(out.notes).toEqual(['4 pictures could not be found in the file or could not be read.']);
  });

  it('ignores a linked picture (r:link) and a drawing that has no embedded picture', () => {
    const out = readDocxLines(docx(`${picture('rId1', { link: true })}`, [rel('rId1', 'media/image1.png')], media('image1.png', PNG)));
    expect(out.pictures).toEqual([]);
    expect(out.notes).toEqual(['1 text box or shape was ignored.']);
  });

  it('only reads files under word/media', () => {
    expect(mediaPathOf('media/image1.png')).toBe('word/media/image1.png');
    expect(mediaPathOf('/word/media/image1.png')).toBe('word/media/image1.png');
    expect(mediaPathOf('media/My%20picture.png')).toBe('word/media/My picture.png');
    expect(mediaPathOf('../customXml/item1.xml')).toBeNull();
    expect(mediaPathOf('media/../../docProps/core.xml')).toBeNull();
    expect(mediaPathOf('/word/document.xml')).toBeNull();
    expect(mediaPathOf('media/')).toBeNull();
    expect(mediaPathOf('')).toBeNull();
  });
});

describe('what is not a picture', () => {
  it('counts a text box, a chart and an empty drawing as shapes and reads none of their text', () => {
    const box = `<w:p><w:r><mc:AlternateContent><mc:Choice><w:drawing><wps:txbx><w:txbxContent>${p('boxed')}</w:txbxContent></wps:txbx></w:drawing></mc:Choice><mc:Fallback><w:pict/></mc:Fallback></mc:AlternateContent></w:r></w:p>`;
    const chart = '<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData uri="chart"><c:chart r:id="rId9"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
    const out = readDocxLines(docx(`${p('kept')}${box}${chart}<w:p><w:r><w:drawing/></w:r></w:p>`));
    expect(out.lines).toEqual(['kept', '', '', '']);
    expect(out.pictures).toEqual([]);
    expect(out.notes).toEqual(['3 text boxes or shapes were ignored.']);
  });

  it('does not take a picture that sits inside a text box, and does not read the text of that box', () => {
    const body = `<w:p><w:r><w:drawing><wp:inline><wps:txbx><w:txbxContent>${p('boxed')}${picture('rId1')}</w:txbxContent></wps:txbx>${drawing('rId1')}</wp:inline></w:drawing></w:r></w:p>`;
    const out = readDocxLines(docx(body, [rel('rId1', 'media/image1.png')], media('image1.png', PNG)));
    expect(out.pictures).toEqual([]);
    expect(out.lines).not.toContain('boxed');
  });

  it('ignores pictures in a table with a note of their own, and writes no marker for them', () => {
    const table = `<w:tbl><w:tr><w:tc>${p('x')}${picture('rId1')}</w:tc></w:tr></w:tbl>`;
    const out = readDocxLines(docx(`${p('1. Q?')}${table}`, [rel('rId1', 'media/image1.png')], media('image1.png', PNG)));
    expect(out.lines).toEqual(['1. Q?']);
    expect(out.pictures).toEqual([]);
    expect(out.notes).toEqual([
      '1 table was ignored; put questions in ordinary paragraphs.',
      '1 picture in tables was ignored; put a picture in an ordinary paragraph under its question.',
    ]);
  });
});

describe('the limits', () => {
  it('leaves a picture over the size of one picture out, keeps its place, and the file still reads', () => {
    const big = new Uint8Array(MAX_PICTURE_BYTES + 1);
    const out = readDocxLines(docx(`${p('Q')}${picture('rId1')}`, [rel('rId1', 'media/big.png')], { 'word/media/big.png': [big, { level: 0 }] }));
    expect(out.lines).toEqual(['Q', `${PICTURE_MARKER_PREFIX}0`]);
    expect(out.pictures[0]).toMatchObject({ bytes: null, problem: 'too_large' });
    expect(out.notes).toEqual(['1 picture was left out because it is too large (the limit is 10 MB for a picture and 64 MB together).']);
  });

  it('stops reading pictures when all of them together pass the total, and says how many were left out', () => {
    const each = new Uint8Array(9 * 1024 * 1024 + 512 * 1024);
    const files: Zippable = {};
    const rels: string[] = [];
    let body = '';
    for (let n = 1; n <= 7; n += 1) {
      files[`word/media/p${n}.png`] = [each, { level: 0 }];
      rels.push(rel(`rId${n}`, `media/p${n}.png`));
      body += picture(`rId${n}`);
    }
    const out = readDocxLines(docx(body, rels, files));
    expect(out.pictures.filter((x) => x.bytes !== null)).toHaveLength(6);
    expect(out.pictures[6]).toMatchObject({ bytes: null, problem: 'too_large' });
    expect(out.notes[0]).toContain('1 picture was left out');
  });

  it('reads at most 100 pictures, writes no marker for the rest, and says so', () => {
    const many = Array.from({ length: MAX_PICTURES + 3 }, () => picture('rId1')).join('');
    const out = readDocxLines(docx(many, [rel('rId1', 'media/image1.png')], media('image1.png', PNG)));
    expect(out.pictures).toHaveLength(MAX_PICTURES);
    expect(out.lines.filter((line) => pictureIndexOf(line) !== null)).toHaveLength(MAX_PICTURES);
    expect(out.notes).toEqual([`3 pictures after the first ${MAX_PICTURES} were left out.`]);
  });

  it('opens no picture file for a paper that uses none', () => {
    const unused = new Uint8Array(MAX_PICTURE_BYTES + 1);
    const out = readDocxLines(docx(p('Just text'), [rel('rId1', 'media/big.png')], { 'word/media/big.png': [unused, { level: 0 }] }));
    expect(out.lines).toEqual(['Just text']);
    expect(out.pictures).toEqual([]);
    expect(out.notes).toEqual([]);
  });
});

describe('the questions of a file with pictures', () => {
  const questions = (withPicture: boolean) => {
    const body = `${p('1. Which tool is this?')}${withPicture ? picture('rId1') : ''}${p('A. A vice')}${p('B. A clamp')}${p('Answer: A')}`;
    return questionsFromDocx(docx(body, [rel('rId1', 'media/image1.png')], media('image1.png', PNG)), 'single');
  };

  it('are read exactly as without the picture, and the teacher is told the picture was found and not placed yet', () => {
    const plain = questions(false);
    const withPicture = questions(true);
    expect(withPicture.questions.map((q) => [q.text, q.options.map((o) => o.text), q.correct.length])).toEqual(
      plain.questions.map((q) => [q.text, q.options.map((o) => o.text), q.correct.length]),
    );
    expect(plain.warnings).toEqual([]);
    expect(withPicture.warnings).toEqual([{ message: '1 picture was found in the file but is not placed on the questions yet; add it in the builder.' }]);
  });
});
