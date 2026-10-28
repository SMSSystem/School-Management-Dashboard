import { describe, expect, it } from 'vitest';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { PICTURE_MARKER_PREFIX, readDocxLines } from '../docxText';
import { questionsFromDocx } from '../examDocx';
import { buildPng } from './imageFixtures';

// Word-shaped files for the picture reader (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.1). The XML below
// follows what Word writes for a picture: the extent, the frame locks, the non-visual properties, the stretch, an extension
// list inside the picture, and, for a file that older readers can open, a VML fallback beside the drawing. The files are made
// here; a real paper from Word is the manual check.

const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
  'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
  'xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"',
].join(' ');
const IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const PNG = buildPng({ width: 60, height: 40 });
const PNG_2 = buildPng({ width: 20, height: 20 });

const docx = (body: string, rels: string, media: Zippable): Uint8Array =>
  zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`),
    'word/styles.xml': strToU8(`<?xml version="1.0"?><w:styles ${NS}/>`),
    ...media,
  });

const rel = (id: string, target: string) => `<Relationship Id="${id}" Type="${IMAGE}" Target="${target}"/>`;
const p = (text: string) => `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:rPr><w:lang w:val="en-JM"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** A picture the way Word 2016 writes an inline one. */
const inline = (id: string, descr = 'A picture containing text') =>
  `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1905000" cy="1270000"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
  `<wp:docPr id="1" name="Picture 1" descr="${descr}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
  `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
  `<pic:blipFill><a:blip r:embed="${id}"><a:extLst><a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}"><a14:useLocalDpi val="0"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
  `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="1270000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;

const anchored = (id: string) =>
  `<w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
  `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
  `<wp:extent cx="1905000" cy="1270000"/><wp:wrapTopAndBottom/><wp:docPr id="2" name="Picture 2" descr="Anchored"/>` +
  `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing>`;

const run = (inner: string) => `<w:p><w:r>${inner}</w:r></w:p>`;

describe('a picture the way Word writes it', () => {
  it('reads an inline picture with its extension list, stretch and shape properties', () => {
    const out = readDocxLines(docx(p('1. Which tool?') + run(inline('rId5')) + p('A. one'), rel('rId5', 'media/image1.png'), { 'word/media/image1.png': PNG }));
    expect(out.lines).toEqual(['1. Which tool?', `${PICTURE_MARKER_PREFIX}0`, 'A. one']);
    expect(out.pictures[0]).toMatchObject({ format: 'png', alt: 'A picture containing text', cropped: false });
    expect(out.notes).toEqual([]);
  });

  it('reads an anchored picture with its position and wrapping elements', () => {
    const out = readDocxLines(docx(p('1. Q?') + run(anchored('rId5')), rel('rId5', 'media/image1.png'), { 'word/media/image1.png': PNG }));
    expect(out.lines).toEqual(['1. Q?', `${PICTURE_MARKER_PREFIX}0`]);
    expect(out.pictures[0].alt).toBe('Anchored');
  });

  it('counts a picture once when a drawing has a VML fallback beside it', () => {
    const fallback = '<mc:Fallback><w:pict><v:shape id="_x0000_i1025" style="width:150pt;height:100pt"><v:imagedata r:id="rId5" o:title=""/></v:shape></w:pict></mc:Fallback>';
    const choice = `<mc:AlternateContent><mc:Choice Requires="wps">${inline('rId5')}</mc:Choice>${fallback}</mc:AlternateContent>`;
    const out = readDocxLines(docx(p('1. Q?') + run(choice), rel('rId5', 'media/image1.png'), { 'word/media/image1.png': PNG }));
    expect(out.pictures).toHaveLength(1);
    expect(out.lines).toEqual(['1. Q?', `${PICTURE_MARKER_PREFIX}0`]);
    expect(out.notes).toEqual([]);
  });

  it('follows a media path written from the root of the package', () => {
    const out = readDocxLines(docx(run(inline('rId5')), rel('rId5', '/word/media/image1.png'), { 'word/media/image1.png': PNG }));
    expect(out.pictures[0].bytes).not.toBeNull();
  });

  it('reads two different pictures in order, each from its own file', () => {
    const out = readDocxLines(
      docx(run(inline('rId5')) + run(inline('rId6')), rel('rId5', 'media/image1.png') + rel('rId6', 'media/image2.png'), { 'word/media/image1.png': PNG, 'word/media/image2.png': PNG_2 }),
    );
    expect(out.pictures.map((x) => x.bytes!.length)).toEqual([PNG.length, PNG_2.length]);
  });

  it('reads the questions around the pictures exactly as without them', () => {
    const body = p('1. Which tool is this?') + run(inline('rId5')) + p('A. A vice') + p('B. A clamp') + p('Answer: A');
    const withPicture = questionsFromDocx(docx(body, rel('rId5', 'media/image1.png'), { 'word/media/image1.png': PNG }), 'single');
    const without = questionsFromDocx(docx(p('1. Which tool is this?') + p('A. A vice') + p('B. A clamp') + p('Answer: A'), '', {}), 'single');
    expect(withPicture.questions.map((q) => [q.text, q.options.map((o) => o.text)])).toEqual(without.questions.map((q) => [q.text, q.options.map((o) => o.text)]));
    expect(withPicture.warnings).toEqual([]);
  });
});

describe('what the reader does not take (the limits that remain)', () => {
  it('ignores a picture that is only in VML, counts it as a shape and keeps the question', () => {
    const vml = '<w:pict><v:shape id="_x0000_i1025" style="width:150pt;height:100pt"><v:imagedata r:id="rId5"/></v:shape></w:pict>';
    const out = readDocxLines(docx(p('1. Q?') + run(vml), rel('rId5', 'media/image1.png'), { 'word/media/image1.png': PNG }));
    expect(out.pictures).toEqual([]);
    expect(out.lines).toEqual(['1. Q?', '']);
    expect(out.notes).toEqual(['1 text box or shape was ignored.']);
  });

  it('reads only the first picture of a group of pictures', () => {
    const group =
      `<w:drawing><wp:inline><wp:docPr id="3" name="Group 3"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"><wpg:wgp>` +
      `<pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic><pic:pic><pic:blipFill><a:blip r:embed="rId6"/></pic:blipFill></pic:pic></wpg:wgp></a:graphicData></a:graphic></wp:inline></w:drawing>`;
    const out = readDocxLines(docx(run(group), rel('rId5', 'media/image1.png') + rel('rId6', 'media/image2.png'), { 'word/media/image1.png': PNG, 'word/media/image2.png': PNG_2 }));
    expect(out.pictures).toHaveLength(1);
    expect(out.pictures[0].bytes!.length).toBe(PNG.length);
  });
});
