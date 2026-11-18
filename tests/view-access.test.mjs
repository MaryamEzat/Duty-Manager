import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

const load = async (file, replace = (s) => s) => {
  const source = replace(fs.readFileSync(new URL(`../src/duty/${file}`, import.meta.url), 'utf8'))
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

// roles.ts only needs its Dataverse imports for loadUserRoles, which these tests don't call.
const roles = await load('roles.ts', (s) => s
  .replace("import { Services } from './data'", 'const Services = {}')
  .replace("import { cleanId, list } from './utils'", 'const cleanId = (x) => x; const list = (x) => x'))

// dataverse.ts with a fake connector that records every call that reaches it.
globalThis.__calls = []
const fake = `const MicrosoftDataverseService = new Proxy({}, { get: (_t, name) => async (...args) => { globalThis.__calls.push(String(name)); return { success: true, data: [] } } })`
const dataverse = await load('dataverse.ts', (s) => s.replace("import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'", fake))

const as = (...names) => names.map((name, i) => ({ id: String(i), name }))
const VIEW = 'Duty Manager-View Access'
const DM = 'Duty Managers-Duty Managers'
const ADMIN = 'Duty Managers-Admin'
const CUSTOMIZER = 'Duty Manager - System Customizer'

test('View Access only: app opens read-only with the Command Center', () => {
  assert.equal(roles.accessLevelFor(as(VIEW)), 'view')
  assert.equal(roles.canSeeCommandCenter(as(VIEW)), true)
  // Role names are matched like the existing roles: case and surrounding spaces don't matter.
  assert.equal(roles.accessLevelFor(as(' duty manager-view access ')), 'view')
})

test('existing roles keep their access', () => {
  assert.equal(roles.accessLevelFor(as(DM)), 'reports')
  assert.equal(roles.canSeeCommandCenter(as(DM)), false)
  assert.equal(roles.accessLevelFor(as(ADMIN)), 'full')
  assert.equal(roles.canSeeCommandCenter(as(ADMIN)), true)
  assert.equal(roles.accessLevelFor(as(CUSTOMIZER)), 'full')
  assert.equal(roles.canSeeCommandCenter(as(CUSTOMIZER)), true)
  assert.equal(roles.accessLevelFor(as('Duty Manager', 'Basic User')), 'none')
  assert.equal(roles.accessLevelFor([]), 'none')
})

test('View Access never takes edit rights away from a higher role', () => {
  assert.equal(roles.accessLevelFor(as(DM, VIEW)), 'reports')
  assert.equal(roles.accessLevelFor(as(VIEW, DM)), 'reports')
  assert.equal(roles.accessLevelFor(as(ADMIN, VIEW)), 'full')
  assert.equal(roles.accessLevelFor(as(CUSTOMIZER, VIEW)), 'full')
  // A duty manager who also has View Access can open the Command Center as well.
  assert.equal(roles.canSeeCommandCenter(as(DM, VIEW)), true)
  assert.equal(roles.canSeeCommandCenter(as(ADMIN, VIEW)), true)
})

test('Dataverse writes are blocked until access allows them; reads always work', async () => {
  const table = dataverse.crossEnvTable('dma_handoverreports')
  globalThis.__calls = []
  // Default before the roles are loaded: blocked.
  await assert.rejects(table.create({ dma_name: 'x' }), /view-only access/)
  dataverse.allowDataverseWrites(false)
  await assert.rejects(table.create({ dma_name: 'x' }), /create on dma_handoverreports blocked/)
  await assert.rejects(table.update('1', { dma_reportstatus: 778000002 }), /update on dma_handoverreports blocked/)
  await assert.rejects(table.delete('1'), /delete on dma_handoverreports blocked/)
  assert.deepEqual(globalThis.__calls, [], 'no blocked call reached the connector')
  await table.getAll({ select: ['dma_name'] })
  await table.get('1')
  assert.deepEqual(globalThis.__calls, ['ListRecordsWithOrganization', 'GetItemWithOrganization'])

  dataverse.allowDataverseWrites(true)
  globalThis.__calls = []
  await table.create({ dma_name: 'x' })
  await table.update('1', { dma_name: 'y' })
  await table.delete('1')
  assert.deepEqual(globalThis.__calls, ['CreateRecordWithOrganization', 'UpdateRecordWithOrganization', 'DeleteRecordWithOrganization'])
  dataverse.allowDataverseWrites(false)
})

test('the app wires view-only access through the UI and the data layer', () => {
  const app = fs.readFileSync(new URL('../src/duty/DutyManager.tsx', import.meta.url), 'utf8')
  // Writes are only allowed for the existing edit roles, and are blocked again whenever access is re-checked.
  assert.match(app, /allowDataverseWrites\(level === 'full' \|\| level === 'reports'\)/)
  assert.match(app, /setAccess\(\{ level: 'checking' \}\)\n\s*allowDataverseWrites\(false\)/)
  assert.match(app, /access\.level !== 'view'\) return <AccessGate/)
  // Every mutating entry point checks view-only access first.
  for (const fn of ['startShift', 'openDraft', 'saveGeneral', 'deleteSectionRow', 'deleteDraft', 'submitReport', 'acknowledgeReport']) {
    const body = app.slice(app.indexOf(`async function ${fn}(`), app.indexOf(`async function ${fn}(`) + 600)
    assert.match(body, /blockedReadOnly\(\)/, `${fn} checks view-only access`)
  }
  assert.match(app, /async function acknowledgeHandover\(id: string\) \{\n\s*if \(readOnly\) throw/)
  // The report editor is never rendered and the report viewer gets no Acknowledge action.
  assert.match(app, /view === 'report' && !readOnly && <Editor/)
  assert.match(app, /acknowledge=\{readOnly \? undefined : acknowledgeReport\}/)
  assert.match(app, /\{acknowledge && <button className="btn primary" onClick=\{acknowledge\}/)
  // Start new report and the draft panels are hidden; alert Done/Open is not written back.
  assert.match(app, /\{!readOnly && <button type="button" className="btn primary hero-start"/)
  assert.match(app, /if \(!readOnly\) Services\.alerts\.update\(cleanId\(id\), \{ dma_isread: true \}/)
  assert.match(app, /if \(!readOnly\) Services\.alerts\.update\(cleanId\(id\), \{ dma_isread: false \}/)
})
