const STORAGE_KEY = 'dm_data_ready_mock_state_v2';
const fallbackRandom = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const makeId = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || fallbackRandom()}`;

const initialState = {
  handovers: [{ id: 'mock-handover-current', businessUnit: 'AMH', shift: 'Morning', reportDate: '2026-08-17', dutyManager: 'Dr. Sara Ahmed', status: 'In progress', hotIssues: '' }],
  previous: { id: 'mock-handover-previous', dutyManager: 'M. Khalid', acknowledgedOn: '07:08', status: 'Acknowledged', carriedResponsibilities: 2 },
  carryOverResponsibilities: [
    { id: 'carry-1', handoverId: 'mock-handover-current', title: 'Radiology CT readiness follow-up', owner: 'Radiology lead', state: 'Open', carriedFor: '1 shift', lastUpdate: 'Awaiting final confirmation' },
    { id: 'carry-2', handoverId: 'mock-handover-current', title: 'Delayed discharge escalation', owner: 'Bed manager', state: 'In progress', carriedFor: '2 shifts', lastUpdate: 'Family meeting scheduled' }
  ],
  hospitalEvents: [
    { id: 'event-seed-1', handoverId: 'mock-handover-current', title: 'Code Stroke - CT readiness delay', eventTime: '08:14', severity: 'Major', operationalState: 'Active monitoring', department: 'ER / Imaging', description: 'Imaging handover extended by 11 minutes.', owner: 'Radiology lead', patientMrn: '541822' },
    { id: 'event-seed-2', handoverId: 'mock-handover-current', title: 'ER surge - paediatric triage', eventTime: '07:46', severity: 'Moderate', operationalState: 'Stabilised', department: 'ER', description: 'Four arrivals within 20 minutes.', owner: 'ER charge nurse', patientMrn: 'Patient group event' },
    { id: 'event-seed-3', handoverId: 'mock-handover-current', title: 'VIP transfer coordination', eventTime: '07:18', severity: 'Low', operationalState: 'Closed', department: 'IPD', description: 'Transfer completed to ward.', owner: 'Patient affairs', patientMrn: '223740' }
  ],
  administrativeIssues: [], operationalExceptions: [], experienceItems: [],
  patientFlow: { id: 'mock-flow-current', handoverId: 'mock-handover-current', staffCoverage: 'Adequate', erAdmissions: 0, opdAdmissions: 0, totalErVolume: 0, plannedDischarges: 0, unplannedDischarges: 0, totalCases: 0, preOp: 0, postOp: 0, postponed: 0, cancelled: 0 },
  retentionPatients: [], reviews: []
};

let state = loadState();
function storage() { try { return globalThis.localStorage || null; } catch { return null; } }
function loadState() { try { const raw = storage()?.getItem(STORAGE_KEY); if (raw) return { ...clone(initialState), ...JSON.parse(raw) }; } catch {} return clone(initialState); }
function persist() { try { storage()?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }
function collectionCrud(collectionName, prefix) {
  const collection = () => state[collectionName];
  return {
    list(handoverId) { return clone(collection().filter(item => !handoverId || item.handoverId === handoverId)); },
    get(recordId) { const item = collection().find(row => row.id === recordId); return item ? clone(item) : null; },
    create(payload) { const item = { ...clone(payload), id: makeId(prefix), createdOn: new Date().toISOString() }; collection().push(item); persist(); return clone(item); },
    update(recordId, payload) { const item = collection().find(row => row.id === recordId); if (!item) throw new Error(`${prefix} not found: ${recordId}`); Object.assign(item, clone(payload), { updatedOn: new Date().toISOString() }); persist(); return clone(item); }
  };
}
function currentHandover(id) { return state.handovers.find(item => item.id === id) || state.handovers[0]; }
function readinessFor(handoverId) {
  const handover = currentHandover(handoverId);
  const blockingAdmin = state.administrativeIssues.filter(item => item.handoverId === handover.id && ['Action due', 'Escalated', 'Pending'].includes(item.operationalState));
  const blockingOps = state.operationalExceptions.filter(item => item.handoverId === handover.id && item.status !== 'Resolved');
  return {
    general: { complete: Boolean(handover?.dutyManager && handover?.businessUnit && handover?.reportDate && handover?.shift), label: 'Shift identity', blockingReasons: [] },
    hospitalEvents: { complete: true, label: `${state.hospitalEvents.filter(x => x.handoverId === handover.id).length} events`, blockingReasons: [] },
    administrativeIssues: { complete: blockingAdmin.length === 0, label: blockingAdmin.length ? `${blockingAdmin.length} open issues` : 'No blocking issues', blockingReasons: blockingAdmin.map(x => x.title) },
    patientFlow: { complete: Boolean(state.patientFlow), label: 'Snapshot saved', blockingReasons: [] },
    operations: { complete: blockingOps.length === 0, label: blockingOps.length ? `${blockingOps.length} unresolved` : 'No unresolved exceptions', blockingReasons: blockingOps.map(x => x.title || x.serviceAffected || 'Operational exception') },
    experience: { complete: true, label: `${state.experienceItems.filter(x => x.handoverId === handover.id).length} items`, blockingReasons: [] }
  };
}

export const mockRepository = {
  async getHandover(id) { return clone(currentHandover(id)); },
  async saveHandover(payload) { const item = currentHandover(payload.id || payload.reportId || payload.handoverId); Object.assign(item, clone(payload), { updatedOn: new Date().toISOString() }); persist(); return clone(item); },
  async getPreviousHandover() { return clone(state.previous); },
  async getHospitalEvents(handoverId) { return collectionCrud('hospitalEvents', 'event').list(handoverId); },
  async getHospitalEvent(id) { return collectionCrud('hospitalEvents', 'event').get(id); },
  async createHospitalEvent(payload) { return collectionCrud('hospitalEvents', 'event').create(payload); },
  async updateHospitalEvent(id, payload) { return collectionCrud('hospitalEvents', 'event').update(id, payload); },
  async getAdministrativeIssues(handoverId) { return collectionCrud('administrativeIssues', 'issue').list(handoverId); },
  async getAdministrativeIssue(id) { return collectionCrud('administrativeIssues', 'issue').get(id); },
  async createAdministrativeIssue(payload) { return collectionCrud('administrativeIssues', 'issue').create(payload); },
  async updateAdministrativeIssue(id, payload) { return collectionCrud('administrativeIssues', 'issue').update(id, payload); },
  async assignAdministrativeIssue(id, owner) { return collectionCrud('administrativeIssues', 'issue').update(id, { owner }); },
  async getPatientFlow(handoverId) { return clone({ ...state.patientFlow, handoverId }); },
  async savePatientFlow(handoverId, payload) { state.patientFlow = { ...state.patientFlow, ...clone(payload), handoverId, updatedOn: new Date().toISOString() }; persist(); return clone(state.patientFlow); },
  async getRetentionPatients(handoverId) { return collectionCrud('retentionPatients', 'retention').list(handoverId); },
  async createRetentionPatient(payload) { return collectionCrud('retentionPatients', 'retention').create(payload); },
  async updateRetentionPatient(id, payload) { return collectionCrud('retentionPatients', 'retention').update(id, payload); },
  async getOperationalExceptions(handoverId) { return collectionCrud('operationalExceptions', 'operations').list(handoverId); },
  async getOperationalException(id) { return collectionCrud('operationalExceptions', 'operations').get(id); },
  async createOperationalException(payload) { return collectionCrud('operationalExceptions', 'operations').create(payload); },
  async updateOperationalException(id, payload) { return collectionCrud('operationalExceptions', 'operations').update(id, payload); },
  async getExperienceItems(handoverId) { return collectionCrud('experienceItems', 'experience').list(handoverId); },
  async getExperienceItem(id) { return collectionCrud('experienceItems', 'experience').get(id); },
  async createExperienceItem(payload) { return collectionCrud('experienceItems', 'experience').create(payload); },
  async updateExperienceItem(id, payload) { return collectionCrud('experienceItems', 'experience').update(id, payload); },
  async getCommandCenterSnapshot(filters = {}) {
    const handover = state.handovers[0];
    const openOps = state.operationalExceptions.filter(item => item.status !== 'Resolved');
    const openAdmin = state.administrativeIssues.filter(item => item.operationalState !== 'Resolved');
    return { filters, updated: new Date().toISOString(), handovers: clone(state.handovers), businessUnits: clone(state.handovers), executiveIssues: clone([...openOps.map(item => ({ id: `exec-${item.id}`, module: 'operations', recordId: item.id, title: item.title || item.serviceAffected || 'Operational exception', status: item.status, category: 'Operations', businessUnit: handover.businessUnit })), ...openAdmin.map(item => ({ id: `exec-${item.id}`, module: 'administrativeIssues', recordId: item.id, title: item.title, status: item.operationalState, category: 'Administrative', businessUnit: handover.businessUnit }))]) };
  },
  async getHandoverReadiness(handoverId) { return readinessFor(handoverId); },
  async saveFinalReview(handoverId, note) { const item = { id: makeId('review'), handoverId, note, updatedOn: new Date().toISOString() }; state.reviews.push(item); persist(); return clone(item); },
  async submitHandover(handoverId) { const blocking = Object.values(readinessFor(handoverId)).flatMap(section => section.blockingReasons || []); if (blocking.length) throw new Error(`Handover is not ready: ${blocking.join(', ')}`); const item = currentHandover(handoverId); item.status = 'Submitted'; item.submittedOn = new Date().toISOString(); persist(); return clone(item); },
  async getCarryOverResponsibilities(handoverId) { return clone(state.carryOverResponsibilities.filter(item => !handoverId || item.handoverId === handoverId)); }
};


