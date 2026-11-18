// Minimal .xlsx writer for the Command Center export: an .xlsx file is a zip of XML parts, written here
// uncompressed (zip "store"), so no spreadsheet library is needed. Text is written as inline strings,
// which Excel never evaluates as formulas.

export type CellStyle = 'header' | 'title' | 'bold'
export type Cell = string | number | null | undefined | { value: string | number | null | undefined; style: CellStyle }
export type Sheet = { name: string; rows: Cell[][]; widths?: number[]; freezeRows?: number }

const STYLE_INDEX: Record<CellStyle, number> = { header: 1, title: 2, bold: 3 }
const MAX_CELL_TEXT = 32767

function xmlText(value: string) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function columnName(index: number) {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

function cellXml(cell: Cell, ref: string) {
  const value = cell != null && typeof cell === 'object' ? cell.value : cell
  const style = cell != null && typeof cell === 'object' ? ` s="${STYLE_INDEX[cell.style]}"` : ''
  if (value == null || value === '') return style ? `<c r="${ref}"${style}/>` : ''
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${style}><v>${value}</v></c>` : ''
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlText(String(value).slice(0, MAX_CELL_TEXT))}</t></is></c>`
}

// Sheet names: at most 31 characters, none of : \ / ? * [ ], and unique.
export function sheetNames(names: string[]) {
  const used = new Set<string>()
  return names.map((name) => {
    const base = (name.replace(/[:\\/?*[\]]/g, ' ').trim() || 'Sheet').slice(0, 31)
    let candidate = base
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`
    used.add(candidate.toLowerCase())
    return candidate
  })
}

function worksheetXml(sheet: Sheet) {
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`)).join('')
    return cells ? `<row r="${r + 1}">${cells}</row>` : ''
  }).join('')
  const freeze = sheet.freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : ''
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${rows}</sheetData></worksheet>`
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0E7DB"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

// ── zip (store only) ──
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function zipStore(files: { name: string; data: Uint8Array }[]) {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const crc = crc32(file.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint16(10, 0, true); local.setUint16(12, 0x21, true); local.setUint32(14, crc, true)
    local.setUint32(18, file.data.length, true); local.setUint32(22, file.data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true)
    const header = new DataView(new ArrayBuffer(46))
    header.setUint32(0, 0x02014b50, true); header.setUint16(4, 20, true); header.setUint16(6, 20, true); header.setUint16(8, 0x0800, true); header.setUint16(10, 0, true)
    header.setUint16(12, 0, true); header.setUint16(14, 0x21, true); header.setUint32(16, crc, true)
    header.setUint32(20, file.data.length, true); header.setUint32(24, file.data.length, true); header.setUint16(28, name.length, true)
    header.setUint32(42, offset, true)
    parts.push(new Uint8Array(local.buffer), name, file.data)
    central.push(new Uint8Array(header.buffer), name)
    offset += 30 + name.length + file.data.length
  }
  const centralSize = central.reduce((size, part) => size + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((size, part) => size + part.length, 0))
  let position = 0
  for (const part of all) { out.set(part, position); position += part.length }
  return out
}

export function buildXlsx(sheets: Sheet[]) {
  const encoder = new TextEncoder()
  const names = sheetNames(sheets.map((sheet) => sheet.name))
  const sheetList = names.map((name, i) => `<sheet name="${xmlText(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
  const files: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetList}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((sheet, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, worksheetXml(sheet)]),
  ]
  return zipStore(files.map(([name, text]) => ({ name, data: encoder.encode(text) })))
}
