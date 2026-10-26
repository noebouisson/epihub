/** Mini-écrivain PDF pour les tests : une page par tableau de lignes, police Helvetica, xref exact. */
export function makePdf(pages: string[][], opt: { size?: number; gap?: number } = {}): Uint8Array {
  const size = opt.size ?? 12
  const gap = opt.gap ?? 20
  const objs: string[] = []
  const n = pages.length
  // 1 catalogue, 2 pages, 3 police, puis (page, contenu) par page
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  pages.forEach((lines, i) => {
    const esc = (s: string) => s.replace(/[\\()]/g, '\\$&')
    const stream = lines.map((l, k) => `BT /F1 ${size} Tf 20 ${780 - k * gap} Td (${esc(l)}) Tj ET`).join('\n')
    objs[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`
    objs[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
