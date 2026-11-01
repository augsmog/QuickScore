/** ASCII PDF syntax keeps string lengths identical to byte offsets, including escaped WinAnsi text. */
function literal(text: string): string {
  return [...text].map(char => {
    const code = char.codePointAt(0)!;
    if (char === '(' || char === ')' || char === '\\') return '\\' + char;
    if (code >= 32 && code <= 126) return char;
    if (code >= 160 && code <= 255) return '\\' + code.toString(8).padStart(3, '0');
    return code === 0x2212 ? '-' : '?';
  }).join('');
}
/** Text-only, paginated Helvetica PDF. Callers supply existing display copy and computed results. */
export function buildScorecardPdf(lines: readonly string[]): string {
  const wrapped = lines.flatMap(line => {
    const chars = [...line];
    return Array.from({ length: Math.max(1, Math.ceil(chars.length / 90)) }, (_, i) => chars.slice(i * 90, (i + 1) * 90).join(''));
  });
  const pages = Array.from({ length: Math.max(1, Math.ceil(wrapped.length / 48)) }, (_, i) => wrapped.slice(i * 48, (i + 1) * 48));
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  pages.forEach((page, i) => {
    const stream = `BT /F1 10 Tf 14 TL 40 750 Td\n${page.map(line => `(${literal(line)}) Tj T*`).join('\n')}\nET\n`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  return pdf + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
