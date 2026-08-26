import { appState, setCurrentHandoverId } from './state/app-state.js';
import { generalController } from './controllers/general-controller.js';
import { hospitalEventsController } from './controllers/hospital-events-controller.js';
import { administrativeIssuesController } from './controllers/administrative-issues-controller.js';
import { operationsController } from './controllers/operations-controller.js';
import { patientFlowController } from './controllers/patient-flow-controller.js';
import { experienceController } from './controllers/experience-controller.js';
import { summaryController } from './controllers/summary-controller.js';

const by = id => document.getElementById(id);
const text = node => (node?.textContent || '').trim();
const value = id => by(id)?.value?.trim?.() || by(id)?.value || '';
const num = id => Number(value(id) || 0);
const currentId = () => new URLSearchParams(location.search).get('handoverId') || appState.handoverId;
let activeEventRow = null;
let activeAdminRow = null;
let activeOpsRow = null;
let activeExperienceRow = null;
let activeRetentionArea = '';

function usableId(id) { return id && !String(id).startsWith('mock-'); }
function recordId(result, fallbackKey) { return result?.id || result?.[fallbackKey] || result?.data?.id || result?.data?.[fallbackKey] || result?.record?.id || ''; }
function headerValue(label) { const items = Array.from(document.querySelectorAll('.ctx span, .context span')); const found = items.find(item => text(item.querySelector('small')).toLowerCase() === label.toLowerCase()); return text(found?.querySelector('b')); }
function parseShift(v) { return /night/i.test(v) ? 'Night' : /evening/i.test(v) ? 'Evening' : 'Morning'; }
function annotateCreated(selector, id, matcher = () => true) { if (!id) return; setTimeout(() => { const row = Array.from(document.querySelectorAll(selector)).reverse().find(item => !item.dataset.recordId && matcher(item)); if (row) row.dataset.recordId = id; }, 0); }
function markSaving(target, message = 'Saved to Duty Manager data source') { if (!target) return; setTimeout(() => { const fb = document.createElement('div'); fb.className = 'prototype-feedback'; fb.textContent = message; target.insertAdjacentElement?.('afterend', fb); setTimeout(() => fb.remove(), 3500); }, 0); }
function safe(action, target) { Promise.resolve().then(action).then(() => markSaving(target)).catch(error => { console.error('[DutyManagerBridge]', error); markSaving(target, `Data save failed: ${error.message || error}`); }); }
async function ensureHandoverId() { if (usableId(currentId())) return currentId(); const saved = await generalController.save(handoverPayload()); const id = recordId(saved, 'dma_handoverreportid') || saved?.id; if (id) setCurrentHandoverId(id); return id || currentId(); }

function eventPayload(prefix) { return { handoverId: currentId(), title: value(`${prefix}-title`) || value('ev-title-in'), eventTime: value(`${prefix}-time`), time: value(`${prefix}-time`), severity: value(`${prefix}-sev`), operationalState: value(`${prefix}-state`), state: value(`${prefix}-state`), department: value(`${prefix}-loc`), location: value(`${prefix}-loc`), description: value(`${prefix}-desc`), desc: value(`${prefix}-desc`), owner: value(`${prefix}-owner`) || 'Unassigned', patientMrn: value(`${prefix}-patient`), patient: value(`${prefix}-patient`) }; }
function adminPayload(update = false) { return update ? { handoverId: currentId(), title: text(activeAdminRow?.querySelector('.issue-story h3')), operationalState: value('update-state'), dueTime: value('update-due'), description: value('update-desc') } : { handoverId: currentId(), title: value('ai-title'), owner: value('ai-owner') || 'Owner required', operationalState: value('ai-state'), dueTime: value('ai-due'), description: value('ai-desc') }; }
function opsPayload() { return { handoverId: currentId(), functionality: value('ops_func'), funcId: value('ops_func'), serviceAffected: value('ops_affected'), affectedId: value('ops_affected'), issueType: value('ops_issue'), issueId: value('ops_issue'), status: value('ops_status'), statusId: value('ops_status'), faultDescription: value('ops_desc'), description: value('ops_desc'), desc: value('ops_desc'), pendingDetails: value('ops_pending') }; }
function flowPayload() { return { handoverId: currentId(), staffCoverage: value('flow-staff') || value('dma_StaffAdequacy'), staffAdequacy: value('flow-staff') || value('dma_StaffAdequacy'), erAdmissions: num('flow-er-admissions') || num('dma_ERAdmissions'), opdAdmissions: num('flow-opd-admissions') || num('dma_OPDAdmissions'), totalErVolume: num('flow-er-volume') || num('dma_ERVolume'), plannedDischarges: num('flow-planned') || num('dma_PlannedDischarges'), unplannedDischarges: num('flow-unplanned') || num('dma_UnplannedDischarges'), totalCases: num('flow-or-total') || num('dma_TotalORCases'), preOp: num('flow-pre') || num('dma_Preoperative'), postOp: num('flow-post') || num('dma_Postoperative'), postponed: num('flow-postponed') || num('dma_PostponedORCases'), cancelled: num('flow-cancelled') || num('dma_CancelledORCases'), erDama: num('dma_ERDAMA'), erDamaRetention: num('dma_ERDAMARetention'), inpDama: num('dma_INPDAMA'), inpDamaRetention: num('dma_INPDAMARetention'), closedDama: num('dma_ClosedDAMA'), closedDamaRetention: num('dma_ClosedDAMARetention') }; }
function experiencePayload() { return { handoverId: currentId(), type: value('exp_type'), workflowState: value('exp_state'), summary: value('exp_summary'), followUpDetail: value('exp_followup') }; }
function handoverPayload() { return { id: usableId(currentId()) ? currentId() : '', dmName: value('gm-dm') || headerValue('Duty manager'), dutyManager: value('gm-dm') || headerValue('Duty manager'), businessUnit: value('gm-bu') || headerValue('Business unit'), reportDate: value('gm-date') || new Date().toISOString(), shift: value('gm-shift') || parseShift(headerValue('Shift + date')) }; }

if (typeof window !== 'undefined') window.addEventListener('click', event => {
  const rowButton = event.target.closest?.('.event .open, .issue-open, #service-list .action, #experience-list .action');
  if (rowButton?.closest('.event')) activeEventRow = rowButton.closest('.event');
  if (rowButton?.classList.contains('issue-open')) activeAdminRow = rowButton.closest('.issue-row');
  if (rowButton?.closest('#service-list')) activeOpsRow = rowButton.closest('.row');
  if (rowButton?.closest('#experience-list')) activeExperienceRow = rowButton.closest('.experience-row');
  const retentionButton = event.target.closest?.('.retention-action');
  if (retentionButton) activeRetentionArea = retentionButton.dataset.area || '';
}, true);

if (typeof window !== 'undefined') window.addEventListener('click', event => {
  const target = event.target.closest?.('button');
  if (!target) return;
  const id = target.id;
  const adminAction = target.dataset.adminAction;
  if (id === 'gm-save' && value('gm-dm')) safe(async () => { const saved = await generalController.save(handoverPayload()); const savedId = recordId(saved, 'dma_handoverreportid'); if (savedId) setCurrentHandoverId(savedId); }, target);
  if (id === 'ev-save' && value('ev-title-in') && value('ev-time') && value('ev-desc')) safe(async () => { await ensureHandoverId(); const created = await hospitalEventsController.create(eventPayload('ev')); annotateCreated('.event', recordId(created, 'dma_hospitaleventid'), row => text(row.querySelector('.story h3')) === value('ev-title-in')); }, target);
  if (!id && target.textContent.includes('Update event') && activeEventRow?.dataset.recordId && value('upd-title') && value('upd-time') && value('upd-desc')) safe(async () => { await ensureHandoverId(); return hospitalEventsController.update(activeEventRow.dataset.recordId, eventPayload('upd')); }, target);
  if (adminAction === 'save-issue' && value('ai-title') && value('ai-desc')) safe(async () => { await ensureHandoverId(); const created = await administrativeIssuesController.create(adminPayload(false)); annotateCreated('.issue-row', recordId(created, 'dma_administrativeissueentryid'), row => text(row.querySelector('.issue-story h3')) === value('ai-title')); }, target);
  if (adminAction === 'save-update' && activeAdminRow?.dataset.recordId && value('update-desc')) safe(async () => { await ensureHandoverId(); return administrativeIssuesController.update(activeAdminRow.dataset.recordId, adminPayload(true)); }, target);
  if (adminAction === 'save-owner' && activeAdminRow?.dataset.recordId && value('assign-owner')) safe(() => administrativeIssuesController.assign(activeAdminRow.dataset.recordId, value('assign-owner')), target);
  if (id === 'ops-save' && value('ops_affected') && value('ops_issue') && value('ops_desc')) safe(async () => { await ensureHandoverId(); if (activeOpsRow?.dataset.recordId && by('ops-modal')?.dataset.edit !== '') return operationsController.update(activeOpsRow.dataset.recordId, opsPayload()); const created = await operationsController.create(opsPayload()); annotateCreated('#service-list .row', recordId(created, 'dma_opeartionid')); }, target);
  if (id === 'flow-save') safe(async () => patientFlowController.save(await ensureHandoverId(), flowPayload()), target);
  if (id === 'retention-save' && value('retention-patient') && value('retention-reason')) safe(async () => { const reportId = await ensureHandoverId(); const flow = await patientFlowController.save(reportId, flowPayload()); const flowId = recordId(flow, 'dma_patientflowsummaryid') || flow?.id; return patientFlowController.createRetention({ handoverId: reportId, flowId, area: activeRetentionArea, damaType: activeRetentionArea === 'ER' ? 'ER' : 'INP', patientName: value('retention-patient'), reason: value('retention-reason'), actionTaken: value('retention-reason'), retained: true }); }, target);
  if (id === 'experience-save' && value('exp_summary')) safe(async () => { await ensureHandoverId(); if (activeExperienceRow?.dataset.recordId && by('experience-modal')?.dataset.edit !== '') return experienceController.update(activeExperienceRow.dataset.recordId, experiencePayload()); const created = await experienceController.create(experiencePayload()); annotateCreated('#experience-list .experience-row', recordId(created, 'dma_patientexperienceid')); }, target);
  if (id === 'save-review' && value('dma_HotIssues')) safe(async () => summaryController.saveReview(await ensureHandoverId(), value('dma_HotIssues')), target);
  if (id === 'prototype-submit-continue' && value('dma_HotIssues')) safe(async () => summaryController.submit(await ensureHandoverId()), target);
}, true);
