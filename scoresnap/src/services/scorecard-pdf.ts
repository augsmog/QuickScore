import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export type ScorecardPdfLine = string | { cells: readonly string[] } | { block: readonly ScorecardPdfLine[] };
export class UnsupportedScorecardCharactersError extends Error {
  constructor() { super('Unsupported scorecard font glyph'); this.name = 'UnsupportedScorecardCharactersError'; }
}

/** Pure local builder. No font/network lookup, score calculation, or text substitution. */
export async function buildScorecardPdf(lines: readonly ScorecardPdfLine[], fontBytes: Uint8Array): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  // This bundled font renders missing glyphs with fontkit subsetting; retain the full licensed font.
  const font = await document.embedFont(fontBytes, { subset: false });
  const supported = new Set(font.getCharacterSet());
  const normalize = (text: string) => text.normalize('NFC');
  // Check every character before creating pages. Never emit '?' or invisible .notdef glyphs.
  const texts = (line: ScorecardPdfLine): readonly string[] => typeof line === 'string' ? [line]
    : 'block' in line ? line.block.flatMap(texts) : line.cells;
  for (const line of lines) for (const text of texts(line)) {
    for (const char of normalize(text).replace(/\n/g, '')) {
      if (!supported.has(char.codePointAt(0)!)) throw new UnsupportedScorecardCharactersError();
    }
  }
  const size = 10, leading = 14, left = 40, right = 572, top = 750, bottom = 40;
  let page = document.addPage([612, 792]), y = top;
  const nextRow = () => { if (y < bottom) { page = document.addPage([612, 792]); y = top; } };
  const draw = (text: string, x: number) => page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
  const wrap = (text: string, width: number): string[] => {
    const rows: string[] = [];
    for (const paragraph of normalize(text).split('\n')) {
      let row = '';
      for (const char of paragraph) {
        if (font.widthOfTextAtSize(char, size) > width) throw new Error('PDF column too narrow');
        if (row && font.widthOfTextAtSize(row + char, size) > width) { rows.push(row); row = ''; }
        row += char;
      }
      rows.push(row);
    }
    return rows;
  };
  type Row = { text: string; x: number }[];
  const rowsFor = (line: ScorecardPdfLine): Row[] => {
    if (typeof line === 'string') return wrap(line, right - left).map(text => [{ text, x: left }]);
    if ('block' in line) return line.block.flatMap(rowsFor);
    if (!line.cells.length || line.cells.length > 9) throw new Error('Invalid scorecard columns');
    // Always nine fixed columns so a final short block aligns with a full block.
    const width = (right - left) / 9;
    const cells = line.cells.map(text => wrap(text, width - 8));
    return Array.from({ length: Math.max(...cells.map(cell => cell.length)) }, (_, row) =>
      cells.map((cell, i) => ({ text: cell[row] ?? '', x: left + i * width })));
  };
  for (const line of lines) {
    const rows = rowsFor(line);
    // Keep one player's name, hole headers, scores and total together when the block fits a page.
    if (typeof line !== 'string' && 'block' in line &&
        rows.length <= Math.floor((top - bottom) / leading) + 1 &&
        rows.length > Math.floor((y - bottom) / leading) + 1) {
      page = document.addPage([612, 792]); y = top;
    }
    for (const row of rows) { nextRow(); row.forEach(cell => draw(cell.text, cell.x)); y -= leading; }
  }
  return document.save();
}
