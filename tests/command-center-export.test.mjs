import assert from 'node:assert/strict'
import fs from 'node:fs'
import zlib from 'node:zlib'
import ts from 'typescript'
import { test } from 'node:test'

const transpile = (file) => ts.transpileModule(fs.readFileSync(new URL(`../src/duty/${file}`, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const dataUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
const kpisUrl = dataUrl(transpile('kpis.ts'))
const kpis = await import(kpisUrl)
const xlsx = await import(dataUrl(transpile('xlsx.ts')))
const report = await import(dataUrl(transpile('commandCenterReport.ts').replace(/(['"])\.\/kpis\1/g, `'${kpisUrl}'`)))

const F = '@OData.Community.Display.V1.FormattedValue'
const AMH = '983080000', ASH = '983080001', SMH = '983080002', AHJ = '983080003'
const hospitals = [[AMH, 'AMH'], [ASH, 'ASH'], [SMH, 'SMH'], [AHJ, 'AHJ']]
const ALL = ['Morning', 'Evening', 'Night']

const rep = (id, businessUnit, shift, shiftDate, extra = {}) => ({ id, businessUnit, shift, shiftDate, createdOn: `${shiftDate}T09:00:00Z`, ...extra })
const event = (type, code, severity, action, extra = {}) => ({ [`_dma_eventtype_value${F}`]: type, [`_dma_eventcode_value${F}`]: code, dma_severitylevel: severity, dma_immediateactionstaken: action, ...extra })
function fixture() {
  const reports = [
    rep('a1', AMH, 'Morning', '2026-11-01', { createdOn: '2026-11-01T07:00:00Z' }),
    rep('a1dup', AMH, 'Morning', '2026-11-01', { createdOn: '2026-11-01T11:00:00Z' }),
    rep('a2', AMH, 'Night', '2026-11-01', { acknowledgedAt: new Date(2026, 10, 2, 8, 30).toISOString(), nightMeeting: 778000000 }),
    rep('s1', ASH, 'Evening', '2026-11-02'),
    rep('m1', SMH, 'Morning', '2026-11-03'),
    rep('j1', AHJ, 'Night', '2026-11-02'),
    rep('out', AMH, 'Morning', '2026-10-20'),
  ]
  return {
    reports,
    reportRows: Object.fromEntries(reports.map((r) => [r.id, { dma_handoverreportid: r.id, dma_name: `R-${r.id}`, [`_dma_dutymanager_value${F}`]: `DM ${r.id}`, dma_hotissues: r.id === 'a1dup' ? '=SUM(A1) <b>&' : '' }])),
    flows: {
      a1: { dma_prolongederadmissionscount: 5, dma_discharges: 10 },
      a1dup: { dma_prolongederadmissionscount: 2, dma_discharges: 20, dma_delayeddischargescount: 2, [`dma_staffadequacy${F}`]: 'Adequate', dma_staffadequacy: 1 },
      a2: { dma_inputilization: 80, dma_icuutilization: 60, dma_erutilization: 50 },
      s1: { dma_prolongederadmissionscount: 1, dma_ervolume: 40, dma_erdama: 2, dma_erdamaretention: 1 },
      out: { dma_prolongederadmissionscount: 99 },
    },
    experiences: { a1dup: { dma_escalatedovrs: 2, dma_escalatedcomplaints: 1 }, j1: { dma_governmentalregulatoryvisits: 999740000, [`dma_governmentalregulatoryvisits${F}`]: 'Yes' } },
    events: {
      a1dup: [event('ER Code', 'STEMI', 778000002, 'Cath lab activated', { dma_name: 'STEMI case' })],
      j1: [event('Hospital Code', 'Red', 778000002, 'Evacuated wing')],
      out: [event('ER Code', 'Trauma', 778000002, 'old', { dma_name: 'Out of range' })],
    },
    adminEntries: { s1: [{ dma_resolutionstatus: 778000001, dma_actiontaken: 'Called vendor', dma_name: 'Delayed lab' }], m1: [{ dma_resolutionstatus: 778000000, dma_actiontaken: '', dma_name: 'Bed shortage' }] },
    operations: { a2: [{ dma_resolutionstatus: 778000001, dma_name: 'Lab outage' }] },
    capacities: { [AMH]: { er: 12, ward: 43, critical: { icu: 18 } }, [ASH]: { er: 14, ward: 48, critical: { icu: 23 } }, [SMH]: { er: 12, ward: 51, critical: {} }, [AHJ]: { critical: {} } },
  }
}
const scope = (extra = {}) => ({ from: '2026-11-01', to: '2026-11-03', shifts: ALL, businessUnit: 'all', hospitals, generatedAt: new Date(2026, 10, 4, 12), ...extra })
const value = (cell) => (cell != null && typeof cell === 'object' ? cell.value : cell)
const sheet = (sheets, name) => {
  const found = sheets.find((s) => s.name === name)
  assert.ok(found, `sheet ${name} exists`)
  return found.rows.map((row) => row.map(value))
}
const records = (sheets, name) => {
  const [head, ...rows] = sheet(sheets, name)
  return rows.map((row) => Object.fromEntries(head.map((label, i) => [label, row[i]])))
}

test('the workbook has the seven sections in order', () => {
  const sheets = report.buildCommandCenterWorkbook(fixture(), scope())
  assert.deepEqual(sheets.map((s) => s.name), ['Executive Summary', 'KPI Scorecard', 'Reports', 'Patient Flow', 'Events', 'Admin & Operations Issues', 'Patient Experience'])
})

test('exported KPI values equal computeScorecard / computeKpis for every KPI and column', () => {
  const data = fixture()
  const s = scope()
  const expected = kpis.computeScorecard(data, { from: s.from, to: s.to, shifts: s.shifts, now: s.generatedAt }, kpis.scorecardColumns(hospitals))
  const rows = sheet(report.buildCommandCenterWorkbook(data, s), 'KPI Scorecard')
  assert.deepEqual(rows[0].slice(2), expected.flatMap((c) => [c.label, `${c.label} detail`]))
  kpis.KPI_DEFINITIONS.forEach((kpi, i) => {
    assert.equal(rows[i + 1][0], kpi.label)
    expected.forEach((column, c) => {
      assert.equal(rows[i + 1][2 + c * 2], column.results[kpi.key].text, `${kpi.key} ${column.label}`)
      assert.equal(rows[i + 1][3 + c * 2], column.results[kpi.key].detail, `${kpi.key} ${column.label} detail`)
    })
  })
  // and the AMH column is exactly computeKpis for AMH
  const amh = kpis.computeKpis({ ...data, from: s.from, to: s.to, shifts: ALL, businessUnits: [AMH], now: s.generatedAt })
  const amhIndex = rows[0].indexOf('AMH')
  kpis.KPI_DEFINITIONS.forEach((kpi, i) => assert.equal(rows[i + 1][amhIndex], amh[kpi.key].text))
})

test('all four hospitals appear as KPI columns and in the reports', () => {
  const sheets = report.buildCommandCenterWorkbook(fixture(), scope())
  const head = sheet(sheets, 'KPI Scorecard')[0]
  for (const label of ['All hospitals', 'AMH', 'ASH', 'SMH', 'AHJ']) assert.ok(head.includes(label), label)
  assert.deepEqual([...new Set(records(sheets, 'Reports').map((r) => r['Business Unit']))].sort(), ['AHJ', 'AMH', 'ASH', 'SMH'])
})

test('the date range is respected in the KPIs and every detail sheet', () => {
  const sheets = report.buildCommandCenterWorkbook(fixture(), scope())
  assert.ok(!records(sheets, 'Reports').some((r) => r['Report Name'] === 'R-out'))
  assert.ok(!records(sheets, 'Events').some((r) => r.Event === 'Out of range'))
  assert.ok(!records(sheets, 'Patient Flow').some((r) => r['Prolonged ER Admissions'] === 99))
  const prolonged = sheet(sheets, 'KPI Scorecard').find((row) => row[0].startsWith('Prolonged ER'))
  assert.equal(prolonged[2], '3') // 2 (latest AMH Morning) + 1 (ASH); the out-of-range 99 and the superseded 5 are excluded
})

test('the shift filter is respected', () => {
  const s = scope({ shifts: ['Night'] })
  const sheets = report.buildCommandCenterWorkbook(fixture(), s)
  assert.deepEqual(records(sheets, 'Reports').map((r) => r['Report Name']), ['R-a2', 'R-j1'])
  assert.deepEqual(records(sheets, 'Events').map((r) => r['Business Unit']), ['AHJ'])
  const expected = kpis.computeScorecard(fixture(), { from: s.from, to: s.to, shifts: ['Night'], now: s.generatedAt }, kpis.scorecardColumns(hospitals))
  const nightRow = sheet(sheets, 'KPI Scorecard').find((row) => row[0] === 'Night medical meeting compliance')
  assert.equal(nightRow[2], expected[0].results.nightMeeting.text)
  assert.equal(sheet(sheets, 'Executive Summary').find((row) => row[0] === 'Shift')[1], 'Night')
})

test('a business-unit filter limits KPIs and details to that hospital', () => {
  const sheets = report.buildCommandCenterWorkbook(fixture(), scope({ businessUnit: ASH }))
  assert.deepEqual(sheet(sheets, 'KPI Scorecard')[0], ['KPI', 'How it is calculated', 'ASH', 'ASH detail'])
  assert.deepEqual(records(sheets, 'Reports').map((r) => r['Business Unit']), ['ASH'])
  assert.deepEqual(records(sheets, 'Admin & Operations Issues').map((r) => r.Issue), ['Delayed lab'])
  assert.deepEqual(sheet(sheets, 'Events').slice(1), [['No hospital events for the selected reports.']])
  assert.equal(sheet(sheets, 'Executive Summary').find((row) => row[0] === 'Business units')[1], 'ASH')
  assert.equal(report.exportFileName(scope({ businessUnit: ASH })), 'duty-manager-command-center-2026-11-01-to-2026-11-03-all-shifts-ash.xlsx')
})

test('a duplicate submission is listed but only the latest report counts', () => {
  const sheets = report.buildCommandCenterWorkbook(fixture(), scope())
  const amhMorning = records(sheets, 'Reports').filter((r) => r['Business Unit'] === 'AMH' && r.Shift === 'Morning')
  assert.deepEqual(amhMorning.map((r) => [r['Report Name'], r['Counted in KPIs']]), [['R-a1', 'No (later submission for this shift counts)'], ['R-a1dup', 'Yes']])
  const kpiRows = sheet(sheets, 'KPI Scorecard')
  const amhIndex = kpiRows[0].indexOf('AMH')
  assert.equal(kpiRows.find((row) => row[0].startsWith('Prolonged ER'))[amhIndex], '2')
  assert.equal(kpiRows.find((row) => row[0] === 'Handover report submission compliance')[amhIndex + 1], '2 of 9 shifts')
  const amhSummary = sheet(sheets, 'Executive Summary').find((row) => row[0] === 'AMH')
  assert.deepEqual([amhSummary[4], amhSummary[5]], [2, 1]) // 2 counted, 1 superseded
})

test('detail sheets carry the records behind the KPIs, with the rule each one meets', () => {
  const sheets = report.buildCommandCenterWorkbook(fixture(), scope())
  const events = records(sheets, 'Events')
  const stemi = events.find((r) => r.Event === 'STEMI case')
  assert.equal(stemi['Medical / Non-medical'], 'Medical')
  assert.equal(stemi['Major With Immediate Actions'], 'Yes')
  assert.equal(events.find((r) => r['Event Code'] === 'Red')['Medical / Non-medical'], 'Non-medical')
  const issues = records(sheets, 'Admin & Operations Issues')
  assert.deepEqual(issues.map((r) => [r.Source, r.Issue, r.Resolved, r['Counts as Action']]), [
    ['Administrative', 'Delayed lab', 'Yes', 'Yes'], ['Administrative', 'Bed shortage', 'No', 'No'], ['Operations', 'Lab outage', 'Yes', 'No']])
  const experience = records(sheets, 'Patient Experience')
  assert.equal(experience.find((r) => r['Business Unit'] === 'AHJ')['Governmental / Regulatory Visit'], 'Yes')
  assert.equal(experience.find((r) => r['Report Name'] === 'R-a1dup')['Escalated OVRs'], 2)
  const flow = records(sheets, 'Patient Flow').find((r) => r['Report Name'] === 'R-a2')
  assert.equal(flow['ER Utilization %'], 50)
  // the earlier Command Center export columns are still on the Reports sheet
  const head = sheet(sheets, 'Reports')[0]
  for (const column of ['Report ID', 'Report Name', 'Report Date/Time', 'Business Unit', 'Shift', 'Duty Manager', 'Report Status', 'Acknowledged Date/Time', 'Hot Issues',
    'Staff Coverage', 'Admissions', 'Discharges', 'Major Incidents', 'Unresolved Issues', 'ER DAMA', 'ER DAMA Retained', 'INP DAMA', 'Peak Utilization']) assert.ok(head.includes(column), column)
  const a2 = records(sheets, 'Reports').find((r) => r['Report Name'] === 'R-a2')
  assert.equal(a2['Report Status'], 'Acknowledged')
  assert.equal(a2['Minutes to Acknowledge (from shift end, used in KPI)'], 30)
  assert.equal(a2['Peak Utilization'], 'Ward 80%')
})

test('an empty range exports without errors and says there are no reports', () => {
  const empty = { reports: [], reportRows: {}, flows: {}, experiences: {}, events: {}, adminEntries: {}, operations: {}, capacities: {} }
  const sheets = report.buildCommandCenterWorkbook(empty, scope({ generatedAt: new Date(2026, 10, 1, 7) }))
  const kpiRows = sheet(sheets, 'KPI Scorecard')
  assert.ok(kpiRows.slice(1).every((row) => ['–', '0'].includes(row[2])))
  assert.equal(sheet(sheets, 'Reports')[1][0], 'No submitted reports for the selected period.')
  assert.equal(sheet(sheets, 'Events')[1][0], 'No hospital events for the selected reports.')
  assert.ok(sheet(sheets, 'Executive Summary').some((row) => row[0] === 'No submitted reports were found for the selected period.'))
  assert.ok(xlsx.buildXlsx(sheets).length > 0)
})

// Reads a store-only zip back (enough to check the files our writer produced).
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  assert.equal(view.getUint32(end, true), 0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const files = {}
  for (let i = 0; i < count; i += 1) {
    assert.equal(view.getUint32(at, true), 0x02014b50)
    const crc = view.getUint32(at + 16, true), size = view.getUint32(at + 24, true), nameLength = view.getUint16(at + 28, true), offset = view.getUint32(at + 42, true)
    const name = Buffer.from(bytes.subarray(at + 46, at + 46 + nameLength)).toString('utf8')
    const dataStart = offset + 30 + view.getUint16(offset + 26, true)
    const data = bytes.subarray(dataStart, dataStart + size)
    files[name] = { crc, text: Buffer.from(data).toString('utf8'), data }
    at += 46 + nameLength
  }
  return files
}

test('the .xlsx package is a valid zip with escaped text and no formulas', () => {
  const files = unzip(xlsx.buildXlsx(report.buildCommandCenterWorkbook(fixture(), scope())))
  assert.ok(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml'].every((name) => files[name]))
  assert.equal(Object.keys(files).filter((name) => name.startsWith('xl/worksheets/')).length, 7)
  if (zlib.crc32) for (const file of Object.values(files)) assert.equal(file.crc, zlib.crc32(file.data))
  assert.ok(files['xl/workbook.xml'].text.includes('name="Admin &amp; Operations Issues"'))
  const reportsXml = files['xl/worksheets/sheet3.xml'].text
  assert.ok(reportsXml.includes('<t xml:space="preserve">=SUM(A1) &lt;b&gt;&amp;</t>'))
  assert.ok(!reportsXml.includes('<f>'))
  assert.deepEqual(xlsx.sheetNames(['A/B', 'a/b', 'x'.repeat(40)]), ['A B', 'a b 2', 'x'.repeat(31)])
})

test('the on-screen scorecard and the export use the same KPI function', () => {
  const app = fs.readFileSync(new URL('../src/duty/DutyManager.tsx', import.meta.url), 'utf8')
  const exporter = fs.readFileSync(new URL('../src/duty/commandCenterReport.ts', import.meta.url), 'utf8')
  const scorecard = app.slice(app.indexOf('function KpiScorecard('), app.indexOf('function Dashboard('))
  assert.ok(scorecard.includes('computeScorecard(data,'))
  assert.ok(scorecard.includes('buildCommandCenterWorkbook(data, scope)'))
  assert.ok(exporter.includes('computeScorecard(data,'))
  assert.ok(!/computeKpis\(/.test(app) && !/computeKpis\(/.test(exporter), 'nothing calls computeKpis directly outside kpis.ts')
  assert.ok(!app.includes('Export CSV') && !app.includes('Export KPIs'), 'one export action')
})
