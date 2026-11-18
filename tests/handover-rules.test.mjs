import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

// utils.ts imports the generated Dataverse models through data.ts; only the business-unit list is needed here.
const utilsSource = fs.readFileSync(new URL('../src/duty/utils.ts', import.meta.url), 'utf8')
  .replace(/^import type .*$/m, '')
  .replace("import { businessUnits } from './data'", "const businessUnits = [['983080000', 'AMH'], ['983080003', 'AHJ']]")
const utilsJs = ts.transpileModule(utilsSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const utils = await import(`data:text/javascript;base64,${Buffer.from(utilsJs).toString('base64')}`)

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

test('shift windows follow the business shifts (08-14, 14-20, 20-08)', () => {
  const at = (h, m = 0) => new Date(2026, 9, 27, h, m)
  assert.equal(utils.shiftForDate(at(7, 59)), 'Night')
  assert.equal(utils.shiftForDate(at(8)), 'Morning')
  assert.equal(utils.shiftForDate(at(13, 59)), 'Morning')
  assert.equal(utils.shiftForDate(at(14)), 'Evening')
  assert.equal(utils.shiftForDate(at(19, 59)), 'Evening')
  assert.equal(utils.shiftForDate(at(20)), 'Night')
  assert.equal(utils.shiftForDate(at(23, 30)), 'Night')
})

test('a Night shift after midnight belongs to the night that started the day before', () => {
  assert.equal(utils.shiftBusinessDate('2026-10-28T02:00', 'Night'), '2026-10-27')
  assert.equal(utils.shiftBusinessDate('2026-10-27T22:00', 'Night'), '2026-10-27')
  assert.equal(utils.shiftBusinessDate('2026-10-28T02:00', 'Morning'), '2026-10-28')
  const night = { dmName: 'A', dmUserId: 'u1', businessUnit: '983080000', shift: 'Night' }
  assert.ok(utils.sameHandover({ ...night, reportDate: '2026-10-27T22:00' }, { ...night, reportDate: '2026-10-28T03:00' }))
})

test('drafts list newest first across timestamp formats, and only the signed-in user\'s drafts', () => {
  const store = new Map()
  globalThis.localStorage = {
    get length() { return store.size }, key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  }
  const put = (id, draft) => store.set(`dm_handover_draft_${id}`, JSON.stringify({ draftId: id, ...draft }))
  put('old-iso', { dmUserId: 'me', timestamp: '2026-10-20T07:10:50Z', reportDate: '2026-10-20T10:00' })
  put('new-local', { dmUserId: 'me', timestamp: new Date(2026, 9, 27, 17, 2).toISOString(), reportDate: '2026-10-27T17:00' })
  put('legacy-locale', { dmUserId: 'me', timestamp: '10/25/2026, 5:02:19 PM', reportDate: '2026-10-25T17:00' })
  put('dataverse-colleague', { dmUserId: 'someone-else', timestamp: '2026-10-27T18:00:00Z', reportDate: '2026-10-27T17:00' })
  put('dataverse-unowned', { dmUserId: '', timestamp: '2026-10-27T18:00:00Z', reportDate: '2026-10-27T17:00' })
  utils.setDraftOwner('ME')
  assert.deepEqual(utils.getDrafts().map((d) => d.draftId), ['new-local', 'legacy-locale', 'old-iso'])
  assert.equal(store.has('dm_handover_draft_dataverse-colleague'), false)
})

test('autosave writes a record only when its payload changed', async () => {
  const updates = [], creates = []
  const savedPayloads = new Map()
  const payloadKey = (set, id) => `${set}:${id}`
  const rememberPayload = loadFunction('rememberPayload', { savedPayloads, payloadKey })
  const saveRow = loadFunction('saveRow', { savedPayloads, payloadKey, rememberPayload, cleanId: (x) => x, resultId: (r) => r.id })
  const service = { create: async (r) => { creates.push(r); return { id: 'new-1' } }, update: async (id, r) => updates.push([id, r]) }
  const id = await saveRow(service, 'events', 'eventid', undefined, { a: 1 }, { create: { stamp: 'now' } })
  assert.equal(id, 'new-1')
  assert.deepEqual(creates, [{ a: 1, stamp: 'now' }])
  await saveRow(service, 'events', 'eventid', 'new-1', { a: 1 }, { update: { other: null } })
  assert.equal(updates.length, 0)
  await saveRow(service, 'events', 'eventid', 'new-1', { a: 2 }, { update: { other: null } })
  assert.deepEqual(updates, [['new-1', { a: 2, other: null }]])
})

test('changing the patient area clears the other patient lookups', () => {
  const patientLookupBinds = {
    ER: ['dma_ERPatient@odata.bind', 'cr301_ervisitses'], IPD: ['dma_IPDPatients@odata.bind', 'ipd_patients'],
    IPD_KSA: ['dma_IPDPatientsKSA@odata.bind', 'and_inpatientlists'], OPD_EG: ['dma_OPDPatientEG@odata.bind', 'opd_patients'],
    OPD_KSA: ['dma_OPDPatientKSA@odata.bind', 'opd_ksapatientses'],
  }
  const patientBinds = loadFunction('patientBinds', { patientLookupBinds, cleanId: (x) => x })
  const clearedPatientBinds = loadFunction('clearedPatientBinds', { patientLookupBinds })
  assert.deepEqual(patientBinds('OPD_KSA', 'p1'), { 'dma_OPDPatientKSA@odata.bind': '/opd_ksapatientses(p1)' })
  const cleared = clearedPatientBinds('OPD_KSA')
  assert.equal('dma_OPDPatientKSA@odata.bind' in cleared, false)
  assert.equal(Object.keys(cleared).length, 4)
  assert.ok(Object.values(cleared).every((value) => value === null))
})

test('tomorrow\'s discharge plan is the day after the night started', () => {
  const targetDischargeDate = loadFunction('targetDischargeDate', { shiftBusinessDate: utils.shiftBusinessDate })
  assert.equal(targetDischargeDate('2026-10-27T22:00'), '2026-10-28')
  assert.equal(targetDischargeDate('2026-10-28T02:00'), '2026-10-28')
  assert.equal(targetDischargeDate('2026-10-31T23:00'), '2026-11-01')
})

test('a carried administrative issue keeps its category and patient', async () => {
  const sourceRow = {
    dma_administrativeissueentryid: 'issue-1', dma_name: 'Delayed Medical Reports', dma_resolutionstatus: 778000002,
    dma_description: 'desc', dma_actiontaken: 'act', dma_pendingissues: 'pending',
    _dma_issueid_value: 'cat-1', '_dma_issueid_value@OData.Community.Display.V1.FormattedValue': 'Delayed Medical Reports',
    _dma_opdpatientksa_value: 'patient-1', '_dma_opdpatientksa_value@OData.Community.Display.V1.FormattedValue': 'Some Name',
  }
  const patientLookupColumns = [['ER', '_dma_erpatient_value'], ['IPD', '_dma_ipdpatients_value'], ['IPD_KSA', '_dma_ipdpatientsksa_value'], ['OPD_EG', '_dma_opdpatienteg_value'], ['OPD_KSA', '_dma_opdpatientksa_value']]
  const cleanId = (x) => String(x || '')
  const patientOfRow = loadFunction('patientOfRow', { patientLookupColumns, cleanId })
  const retrieve = loadFunction('retrieveCarryForwardItems', {
    cleanId, list: (x) => x, bundleColumns: { admin: [], ops: [] }, patientOfRow,
    describePatient: async (area, id) => ({ name: `name of ${area} ${id}`, code: 'CODE-9' }),
    labelFor: () => '', serviceAffectedOptions: [], opsIssueOptions: [],
    Services: { adminEntries: { getAll: async () => [sourceRow] }, ops: { getAll: async () => [] } },
  })
  const [item] = await retrieve('report-1')
  assert.equal(item.catId, 'cat-1')
  assert.equal(item.title, 'Delayed Medical Reports')
  assert.deepEqual([item.area, item.pId, item.pName, item.pCode], ['OPD_KSA', 'patient-1', 'name of OPD_KSA patient-1', 'CODE-9'])
})

test('an issue saved without a category finds it again by name', () => {
  const catalogIdFor = loadFunction('catalogIdFor', {})
  const catalog = [['cat-1', 'Delayed Consultations'], ['cat-2', 'Delayed Medical Reports']]
  assert.equal(catalogIdFor(catalog, '', 'Delayed Medical Reports'), 'cat-2')
  assert.equal(catalogIdFor(catalog, 'cat-1', 'Delayed Medical Reports'), 'cat-1')
  assert.equal(catalogIdFor(catalog, '', 'Unknown'), '')
})

test('security roles decide what a user can open', async () => {
  const rolesSource = fs.readFileSync(new URL('../src/duty/roles.ts', import.meta.url), 'utf8')
    .replace("import { Services } from './data'", 'const Services = {}')
    .replace("import { cleanId, list } from './utils'", "const cleanId = (x) => String(x || ''); const list = (x) => x")
  const js = ts.transpileModule(rolesSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const { accessLevelFor } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
  const role = (name) => ({ id: name, name })
  assert.equal(accessLevelFor([role('Duty Managers-Duty Managers')]), 'reports')
  assert.equal(accessLevelFor([role('Duty Managers-Admin')]), 'full')
  assert.equal(accessLevelFor([role('duty managers-admin ')]), 'full')
  assert.equal(accessLevelFor([role('Duty Manager - System Customizer')]), 'full')
  assert.equal(accessLevelFor([role('Duty Managers-Duty Managers'), role('Duty Managers-Admin')]), 'full')
  assert.equal(accessLevelFor([role('System Administrator'), role('Pulse Admin')]), 'none')
  assert.equal(accessLevelFor([role('Duty Manager - Duty Managers')]), 'none')
  assert.equal(accessLevelFor([role('Duty Manager - System Administrator')]), 'none')
})
