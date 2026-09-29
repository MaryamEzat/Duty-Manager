// Builds the downloadable handover report as a real document PDF (text, tables, page numbers),
// instead of printing the on-screen report, which copied the app's look and was cut off mid-report.
// The app describes the content (see buildReportPdf in DutyManager.tsx); this file only lays it out.

export type PdfField = [label: string, value: string]
export type PdfRecord = { title: string; badge?: string; fields: PdfField[] }
export type PdfSection = {
  heading: string
  note?: string
  text?: string
  fields?: PdfField[]
  // Related values under their own small heading (e.g. Patient flow: Inbound, Outbound, Theatre flow).
  groups?: { heading: string; fields: PdfField[] }[]
  records?: PdfRecord[]
  empty?: string
}
export type PdfReport = {
  fileName: string
  title: string
  subtitle: string
  meta: PdfField[]
  counts: PdfField[]
  sections: PdfSection[]
}

// Pulse brand colours as RGB (PDF has no CSS variables).
const INK: [number, number, number] = [33, 28, 30]
const BODY: [number, number, number] = [81, 74, 68]
const MUTED: [number, number, number] = [138, 128, 121]
const GOLD: [number, number, number] = [165, 132, 91]
const GREEN: [number, number, number] = [46, 55, 45]
const LINE: [number, number, number] = [232, 224, 211]
const TINT: [number, number, number] = [249, 243, 237]

const MARGIN = 15
const PAGE_W = 210
const PAGE_H = 297
const CONTENT_W = PAGE_W - MARGIN * 2
const FOOTER_SPACE = 16

export async function downloadReportPdf(report: PdfReport) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN

  const lastTableY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - FOOTER_SPACE) {
      doc.addPage()
      y = MARGIN
    }
  }

  // ── Title block ──
  doc.setFillColor(...GREEN)
  doc.rect(0, 0, PAGE_W, 4, 'F')
  y = MARGIN + 2
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...GOLD)
  doc.text('DUTY MANAGER HANDOVER REPORT', MARGIN, y)
  y += 8
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...INK)
  doc.text(report.title, MARGIN, y)
  y += 6
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...BODY)
  doc.text(report.subtitle, MARGIN, y)
  y += 5

  // ── Report details: two label/value pairs per row ──
  const metaRows: string[][] = []
  for (let i = 0; i < report.meta.length; i += 2) {
    const [a, b] = [report.meta[i], report.meta[i + 1]]
    metaRows.push([a[0], a[1], b?.[0] ?? '', b?.[1] ?? ''])
  }
  autoTable(doc, {
    startY: y + 2,
    margin: { left: MARGIN, right: MARGIN },
    body: metaRows,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: MUTED, cellWidth: 32, fillColor: TINT },
      1: { cellWidth: CONTENT_W / 2 - 32 },
      2: { fontStyle: 'bold', textColor: MUTED, cellWidth: 32, fillColor: TINT },
    },
  })
  y = lastTableY() + 5

  // ── Record counts strip ──
  if (report.counts.length) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...BODY)
    const line = report.counts.map(([label, value]) => `${label}: ${value}`).join('   ·   ')
    doc.text(doc.splitTextToSize(line, CONTENT_W), MARGIN, y)
    y += 7
  }

  // ── Sections ──
  report.sections.forEach((section, index) => {
    ensureSpace(20)
    y += 3
    doc.setDrawColor(...GOLD).setLineWidth(0.6)
    doc.line(MARGIN, y, MARGIN + 12, y)
    y += 6
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...INK)
    doc.text(`${index + 1}. ${section.heading}`, MARGIN, y)
    if (section.note) {
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
      doc.text(section.note, PAGE_W - MARGIN, y, { align: 'right' })
    }
    y += 5

    if (section.text !== undefined) {
      doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...BODY)
      const lines = doc.splitTextToSize(section.text || '—', CONTENT_W) as string[]
      lines.forEach((line) => {
        ensureSpace(6)
        doc.text(line, MARGIN, y)
        y += 5
      })
      y += 2
    }

    section.groups?.forEach((group) => {
      ensureSpace(18)
      y += 1
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...GOLD)
      doc.text(group.heading.toUpperCase(), MARGIN, y + 3)
      y += 5
      renderFields(group.fields)
      y += 1
    })

    if (section.fields?.length) renderFields(section.fields)

    function renderFields(fields: PdfField[]) {
      const rows: string[][] = []
      const short = fields.filter(([, value]) => value.length <= 40)
      const long = fields.filter(([, value]) => value.length > 40)
      for (let i = 0; i < short.length; i += 2) {
        const [a, b] = [short[i], short[i + 1]]
        rows.push([a[0], a[1], b?.[0] ?? '', b?.[1] ?? ''])
      }
      if (rows.length) autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_SPACE },
        body: rows,
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
        columnStyles: {
          0: { textColor: MUTED, cellWidth: 45 },
          1: { fontStyle: 'bold', cellWidth: CONTENT_W / 2 - 45 },
          2: { textColor: MUTED, cellWidth: 45 },
          3: { fontStyle: 'bold' },
        },
      })
      if (rows.length) y = lastTableY() + 3
      // Narratives get the full width so they wrap as paragraphs.
      if (long.length) {
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_SPACE },
          body: long.map(([label, value]) => [label, value]),
          theme: 'plain',
          styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
          columnStyles: { 0: { textColor: MUTED, cellWidth: 45 } },
        })
        y = lastTableY() + 3
      }
    }

    if (section.records) {
      if (!section.records.length) {
        doc.setFont('helvetica', 'italic').setFontSize(9.5).setTextColor(...MUTED)
        ensureSpace(7)
        doc.text(section.empty || 'No records.', MARGIN, y + 1)
        y += 7
      }
      section.records.forEach((record) => {
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_SPACE },
          // Title spans both columns (the label column is only 40mm); the badge is drawn at its right edge.
          head: [[{ content: record.title, colSpan: 2 }]],
          body: record.fields.map(([label, value]) => [label, value || '—']),
          theme: 'plain',
          rowPageBreak: 'avoid',
          headStyles: { font: 'helvetica', fontStyle: 'bold', fontSize: 10, textColor: INK, fillColor: TINT, cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: record.badge ? 38 : 3 } },
          styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 }, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
          columnStyles: { 0: { textColor: MUTED, cellWidth: 40 } },
          didDrawCell: (data) => {
            if (data.section !== 'head' || !record.badge) return
            doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...GOLD)
            doc.text(record.badge.toUpperCase(), data.cell.x + data.cell.width - 3, data.cell.y + data.cell.height / 2, { align: 'right', baseline: 'middle' })
          },
        })
        y = lastTableY() + 4
      })
    }
  })

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages()
  const generated = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(...LINE).setLineWidth(0.2)
    doc.line(MARGIN, PAGE_H - 11, PAGE_W - MARGIN, PAGE_H - 11)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
    doc.text(`${report.title} · Generated ${generated}`, MARGIN, PAGE_H - 7)
    doc.text(`Page ${page} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 7, { align: 'right' })
  }

  doc.save(`${report.fileName}.pdf`)
}
