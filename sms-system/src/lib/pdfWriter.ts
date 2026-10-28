// A minimal PDF writer for the exam import's PDF template (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4) and for
// the tests: plain text only, in the standard Helvetica font, one line of text placed 16 points below the last, no
// styling and, unless a page is given pictures (for the tests of the picture reader), no pictures. The result is a valid PDF
// whose text can be selected and read back by pdf.js. ASCII text only
// (the standard font has no other letters; anything else is written as a question mark); a line that is an empty string
// leaves a gap. Pure, no library.

const escapePdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, '?');

/** A picture to paint on a page: its place and size in points (the page is 612 by 792, the origin bottom left) and its RGB pixels. */
export type PdfPicture = { x: number; y: number; width: number; height: number; pixelsWide: number; pixelsHigh: number; rgb: Uint8Array };

/**
 * A PDF with each page a list of lines, written top to bottom from the top of a letter-size page. `pictures` gives each
 * page the pictures to paint (same order as `pages`), written as uncompressed RGB image objects.
 */
export function makePdf(pages: readonly (readonly string[])[], pictures: readonly (readonly PdfPicture[])[] = []): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  let nextImage = 4 + pages.length * 2;
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((lines, i) => {
    const painted = pictures[i] ?? [];
    const ids = painted.map(() => nextImage++);
    const text = lines.map((line, row) => `BT /F1 12 Tf 72 ${760 - row * 16} Td (${escapePdf(line)}) Tj ET`);
    const draws = painted.map((p, k) => `q ${p.width} 0 0 ${p.height} ${p.x} ${p.y} cm /Im${k} Do Q`);
    const stream = [...text, ...draws].join('\n');
    painted.forEach((p, k) => {
      const hex = `${[...p.rgb].map((b) => b.toString(16).padStart(2, '0')).join('')}>`;
      objects[ids[k]] = `<< /Type /XObject /Subtype /Image /Width ${p.pixelsWide} /Height ${p.pixelsHigh} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${hex.length} >>\nstream\n${hex}\nendstream`;
    });
    const xobjects = painted.length > 0 ? ` /XObject << ${painted.map((_, k) => `/Im${k} ${ids[k]} 0 R`).join(' ')} >>` : '';
    objects[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >>${xobjects} >> /Contents ${5 + i * 2} 0 R >>`;
    objects[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}
