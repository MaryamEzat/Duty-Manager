import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

const source = fs.readFileSync(new URL('../src/duty/kpis.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const kpis = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

const F = '@OData.Community.Display.V1.FormattedValue'
const AMH = '983080000'
const AHJ = '983080003'
const base = {
  reports: [], flows: {}, experiences: {}, events: {}, adminEntries: {}, operations: {},
  capacities: {
    [AMH]: { er: 12, ward: 43, critical: { icu: 18, ccu: 9 } },
    [AHJ]: { critical: {} },
  },
  from: '2026-11-01', to: '2026-11-01', shifts: ['Morning', 'Evening', 'Night'], businessUnits: [AMH, AHJ],
  now: new Date(2026, 10, 2, 12),
}
const report = (id, businessUnit, shift, extra = {}) => ({ id, businessUnit, shift, shiftDate: '2026-11-01', createdOn: '2026-11-01T10:00:00Z', ...extra })

test('events split into medical and non-medical by type and code', () => {
  const event = (type, code) => ({ [`_dma_eventtype_value${F}`]: type, [`_dma_eventcode_value${F}`]: code })
  assert.equal(kpis.eventCategory(event('Patient Safety Incident', 'Patient Fall')), 'medical')
  assert.equal(kpis.eventCategory(event('ER Code', 'STEMI')), 'medical')
  assert.equal(kpis.eventCategory(event('ER Code', 'Crowd')), 'non-medical')
  assert.equal(kpis.eventCategory(event('Hospital Code', 'Blue')), 'medical')
  assert.equal(kpis.eventCategory(event('Hospital Code', 'RRT')), 'medical')
  assert.equal(kpis.eventCategory(event('Hospital Code', 'Red')), 'non-medical')
  assert.equal(kpis.eventCategory(event(undefined, undefined)), 'unclassified')
})

test('submission compliance counts only shifts that have ended', () => {
  // Noon on 2 Nov: all three 1 Nov shifts have ended for both hospitals -> 6 expected.
  const result = kpis.computeKpis({ ...base, reports: [report('a', AMH, 'Morning'), report('b', AMH, 'Night'), report('c', AHJ, 'Morning')] })
  assert.equal(result.submission.text, '50.0%')
  assert.equal(result.submission.detail, '3 of 6 shifts')
  // At 15:00 on 1 Nov only the Morning shifts have ended.
  const early = kpis.computeKpis({ ...base, now: new Date(2026, 10, 1, 15), reports: [report('a', AMH, 'Morning')] })
  assert.equal(early.submission.detail, '1 of 2 shifts')
})

test('a shift submitted twice counts once, using the latest report', () => {
  const reports = [report('old', AMH, 'Morning', { createdOn: '2026-11-01T09:00:00Z' }), report('new', AMH, 'Morning', { createdOn: '2026-11-01T11:00:00Z' })]
  const result = kpis.computeKpis({ ...base, businessUnits: [AMH], shifts: ['Morning'], reports, flows: { old: { dma_prolongederadmissionscount: 5 }, new: { dma_prolongederadmissionscount: 2 } } })
  assert.equal(result.submission.detail, '1 of 1 shift')
  assert.equal(result.prolongedEr.value, 2)
})

test('acknowledgment time is measured from the end of the shift', () => {
  // Night 1 Nov ends 2 Nov 08:00 local; acknowledged 08:30 -> 30 min. Morning acknowledged before 14:00 -> 0.
  const reports = [
    report('n', AMH, 'Night', { acknowledgedAt: new Date(2026, 10, 2, 8, 30).toISOString() }),
    report('m', AMH, 'Morning', { acknowledgedAt: new Date(2026, 10, 1, 13, 50).toISOString() }),
  ]
  assert.equal(kpis.computeKpis({ ...base, reports }).ackTime.text, '15 min')
})

test('night meeting compliance and utilization use Night reports and units the hospital has', () => {
  const reports = [report('n1', AMH, 'Night', { nightMeeting: 778000000 }), report('n2', AHJ, 'Night', { nightMeeting: null }), report('m', AMH, 'Morning')]
  const flows = {
    n1: { dma_inputilization: 80, dma_icuutilization: 50, dma_ccuutilization: 70, dma_picuutilization: 0, dma_erutilization: 75 },
    n2: { dma_inputilization: 0, dma_icuutilization: 0, dma_erutilization: 40 },
    m: { dma_inputilization: 10, dma_erutilization: 10 },
  }
  const result = kpis.computeKpis({ ...base, reports, flows })
  assert.equal(result.nightMeeting.text, '50.0%')
  assert.equal(result.criticalCare.text, '60.0%') // ICU 50 + CCU 70; PICU has no capacity at AMH
  assert.equal(result.inpatient.text, '80.0%') // AHJ has no ward capacity; Morning reports ignored
  assert.equal(result.erUtilization.text, '75.0%') // Night only; AHJ has no ER capacity, Morning is ignored
})

test('DAMA, delayed discharge and OR figures add up across reports', () => {
  const reports = [report('a', AMH, 'Morning'), report('b', AMH, 'Evening')]
  const flows = {
    a: { dma_ervolume: 50, dma_discharges: 20, dma_erdama: 2, dma_erdamaretention: 1, dma_inpdama: 1, dma_delayeddischargescount: 4, dma_cancelledorcases: 1, dma_postponedorcases: 2, dma_totalorcases: 10 },
    b: { dma_ervolume: 50, dma_planneddischarges: 15, dma_unplanneddischarges: 5, dma_closeddama: 1, dma_closeddamaretention: 1 },
  }
  const result = kpis.computeKpis({ ...base, reports, flows })
  assert.equal(result.damaRate.text, '2.9%') // 4 cases / (100 ER + 40 discharges)
  assert.equal(result.damaRate.detail, '4 cases · ER 2.0% · Inpatient 5.0%')
  assert.equal(result.damaRetention.text, '50.0%')
  assert.equal(result.delayedDischarge.text, '10.0%')
  assert.equal(result.orCancelPostpone.value, 3)
})

test('major events with actions, issue resolution and action count', () => {
  const event = (type, code, severity, action) => ({ [`_dma_eventtype_value${F}`]: type, [`_dma_eventcode_value${F}`]: code, dma_severitylevel: severity, dma_immediateactionstaken: action })
  const reports = [report('a', AMH, 'Morning')]
  const result = kpis.computeKpis({
    ...base, reports,
    events: { a: [event('ER Code', 'STEMI', 778000002, 'Cath lab'), event('Hospital Code', 'Red', 778000002, 'Evacuated'), event('Hospital Code', 'Red', 778000002, ''), event('ER Code', 'Trauma', 778000001, 'Seen')] },
    adminEntries: { a: [{ dma_resolutionstatus: 778000001, dma_actiontaken: 'Called' }, { dma_resolutionstatus: 778000000, dma_actiontaken: '' }] },
    operations: { a: [{ dma_resolutionstatus: 778000001 }] },
    experiences: { a: { dma_governmentalregulatoryvisits: 999740000, dma_escalatedovrs: 2, dma_escalatedcomplaints: 1 } },
  })
  assert.equal(result.majorMedical.value, 1)
  assert.equal(result.majorNonMedical.value, 1)
  assert.equal(result.issueResolution.text, '66.7%')
  assert.equal(result.actions.value, 4) // 3 events with immediate actions + 1 admin action
  assert.equal(result.vipVisits.value, 1)
  assert.equal(result.escalatedOvrs.value, 2)
  assert.equal(result.escalatedComplaints.value, 1)
})

test('no data shows a dash instead of 0%', () => {
  const result = kpis.computeKpis({ ...base, now: new Date(2026, 10, 1, 9) })
  assert.equal(result.submission.text, '–')
  assert.equal(result.damaRate.text, '–')
})
