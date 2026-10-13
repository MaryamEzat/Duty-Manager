import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

const source = fs.readFileSync(new URL('../src/duty/drafts.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { isRecoverableDraft, isSubmittedReport, restoreDraft } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

test('only final submission permits review and acknowledgment', () => {
  for (const status of [778000001, '778000001']) {
    const row = { dma_reportstatus: status, statecode: 0 }
    assert.equal(isRecoverableDraft(row), true)
    assert.equal(isSubmittedReport(row), false)
  }
  for (const status of [778000000, 778000002]) {
    assert.equal(isSubmittedReport({ dma_reportstatus: status, dma_hotissues: 'Completed shift summary' }), true)
  }
  assert.equal(isSubmittedReport({}), false)
  assert.equal(isRecoverableDraft({ dma_reportstatus: 778000001, statecode: 1 }), false)
})

test('the legacy initiated acknowledgment is recoverable, but completed reports stay submitted', () => {
  const row = { dma_reportstatus: 778000000, dma_hotissues: 'Draft Report initiated', dma_dmacknowledgmenttimestamp: '2026-09-28T13:00:00Z' }
  assert.equal(isRecoverableDraft(row), true)
  assert.equal(isSubmittedReport(row), false)
  assert.equal(isRecoverableDraft({ ...row, dma_reportstatus: 778000002 }), false)
  assert.equal(isSubmittedReport({ ...row, dma_reportstatus: 778000002 }), true)
})

test('recovery retains saved content and all linked IDs across repeated closing and reopening', () => {
  const bundle = {
    report: { dma_handoverreportid: 'report-1', dma_reportstatus: 778000001, dma_businessunit: 983080000, dma_shifttype: 989230002, dma_reportdate: '2026-09-28T10:47:00Z', dma_hotissues: 'Draft Report initiated', _dma_dutymanager_value: 'user-1' },
    flow: [{ dma_patientflowsummaryid: 'flow-1', dma_totalorcases: 8, dma_ervolume: 20, dma_staffadequacy: 778000000, dma_shortfallsummary: 'Two nurses short' }],
    experience: [{ dma_patientexperienceid: 'exp-1', dma_escalatedcomplaints: 2, dma_summaryofnewongoingcomplaints: 'Follow up' }],
    events: [{ dma_hospitaleventid: 'event-1', _dma_eventtype_value: 'type-1', dma_incidentdescription: 'Saved event', _dma_erpatient_value: 'patient-1', '_dma_erpatient_value@OData.Community.Display.V1.FormattedValue': 'Test patient' }],
    admin: [{ dma_administrativeissueentryid: 'admin-1', dma_pendingissues: 'Follow up' }],
    ops: [{ dma_opeartionid: 'ops-1', dma_descriptionofissue: 'Saved outage' }],
    flowEntries: [{ dma_patientflowentryid: 'dama-1', dma_erdama: 1, dma_reason: 'Saved reason' }],
  }
  const restored = restoreDraft(bundle, { totalORCases: 0, erVolume: 0, nightMedicalMeeting: '778000000' }, [{ dma_shortagetype: 778000001 }])
  let reopened = restored
  for (let i = 0; i < 3; i++) reopened = JSON.parse(JSON.stringify(reopened))
  assert.deepEqual(reopened, restored)
  assert.equal(restored.reportId, 'report-1')
  assert.equal(restored.flowSummaryId, 'flow-1')
  assert.equal(restored.experienceId, 'exp-1')
  assert.equal(restored.hotIssues, '')
  assert.equal(restored.totalORCases, 8)
  assert.equal(restored.erVolume, 20)
  assert.equal(restored.complaintsCount, 2)
  assert.equal(restored.shift, 'Night')
  assert.deepEqual(restored.shortageTypes, ['778000001'])
  assert.equal(restored.events[0].dataverseId, 'event-1')
  assert.equal(restored.events[0].pId, 'patient-1')
  assert.equal(restored.adminIssues[0].dataverseId, 'admin-1')
  assert.equal(restored.opsIssues[0].dataverseId, 'ops-1')
  assert.equal(restored.damaEntries[0].dataverseId, 'dama-1')
  assert.equal(restored.damaEntries[0].reason, 'Saved reason')
})

const appSource = fs.readFileSync(new URL('../src/duty/DutyManager.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('DutyManager.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function loadFunction(name, dependencies) {
  let target
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) target = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(target, `${name} exists`)
  const code = ts.transpileModule(target, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(dependencies), `${code}; return ${name}`)(...Object.values(dependencies))
}

test('acknowledgment refuses drafts before any status write', async () => {
  let row = { dma_reportstatus: 778000001 }
  const writes = []
  const acknowledge = loadFunction('acknowledgeHandoverReport', {
    Services: { reports: { get: async () => row, update: async (...args) => writes.push(args) } },
    unwrap: (x) => x, cleanId: (x) => x, isSubmittedReport, getXrmWebApi: () => null,
  })
  await assert.rejects(acknowledge('report-1', 'now'), /draft cannot be acknowledged/)
  assert.equal(writes.length, 0)
  row = { dma_reportstatus: 778000002 }
  await acknowledge('report-1', 'now')
  assert.equal(writes[0][1].dma_reportstatus, 778000000)
})

test('repeated draft reopening stays editable; submitted stale copies open review', async () => {
  let row = { dma_reportstatus: 778000001 }
  const views = [], writes = [], reviews = [], removed = []
  const noop = () => {}
  const dependencies = {
    Services: { reports: { get: async () => row, update: async (...args) => writes.push(args) } },
    unwrap: (x) => x, cleanId: (x) => x, isRecoverableDraft, isSubmittedReport,
    localStorage: { removeItem: (key) => removed.push(key) }, getDrafts: () => [],
    initialForm: () => ({}), openReport: async (id) => reviews.push(id), errorMessage: String,
    setDrafts: noop, setMessage: noop, setForm: noop, setDraftId: noop, setReportId: noop,
    setFlowSummaryId: noop, setExperienceId: noop, setEvents: noop, setAdminIssues: noop,
    setOpsIssues: noop, setDamaEntries: noop, setEarlyDischarges: noop, setTab: noop,
    setView: (view) => views.push(view),
  }
  const open = loadFunction('openDraft', dependencies)
  const draft = { reportId: 'report-1', draftId: 'draft-1' }
  for (let i = 0; i < 3; i++) await open(draft)
  assert.deepEqual(views, ['report', 'report', 'report'])
  assert.equal(writes.length, 0)
  row = { dma_reportstatus: 778000000, dma_hotissues: 'Draft Report initiated' }
  await open(draft)
  assert.deepEqual(writes[0][1], { dma_reportstatus: 778000001, dma_dmacknowledgmenttimestamp: null })
  row = { dma_reportstatus: 778000002 }
  await open(draft)
  assert.equal(views.length, 4)
  assert.deepEqual(reviews, ['report-1'])
  assert.deepEqual(removed, ['dm_handover_draft_draft-1'])
})

test('late autosave cannot recreate a submitted local draft', () => {
  let writes = 0
  const save = loadFunction('writeDraft', {
    submittedReportIds: { current: new Set(['report-1']) }, cleanId: (x) => x,
    localStorage: { setItem: () => writes++ }, setDrafts: () => {}, getDrafts: () => [],
  })
  save({ reportId: 'report-1' })
  assert.equal(writes, 0)
})
