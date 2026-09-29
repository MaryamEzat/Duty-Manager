import type { AdminIssue, DamaEntry, DraftRecord, EarlyDischarge, EventItem, FormState, OpsIssue, Shift, TabKey } from './data'
import { businessUnits } from './data'

export function toLocalInput(date: Date) {
  const clone = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return clone.toISOString().slice(0, 16)
}

export function initialForm(): FormState {
  const date = new Date()
  let shift: Shift = 'Morning'
  if (date.getHours() >= 15 && date.getHours() < 23) shift = 'Evening'
  if (date.getHours() >= 23 || date.getHours() < 7) shift = 'Night'
  return {
    dmName: '', dmUserId: '', businessUnit: businessUnits[0]?.[0] || '', reportDate: toLocalInput(date), shift,
    hotIssues: '', staffAdequacy: '778000001', shortageTypes: [], shortfallSummary: '',
    erVolume: 0, erAdmissions: 0, opdAdmissions: 0, admissions: 0, plannedDischarges: 0, unplannedDischarges: 0, discharges: 0, delayedDischargesCount: 0, prolongedERAdmissionsCount: 0,
    totalORCases: 0, preoperative: 0, postoperative: 0, postponedORCases: 0, cancelledORCases: 0,
    erDama: 0, erDamaRetention: 0, inpDama: 0, inpDamaRetention: 0, closedDama: 0, closedDamaRetention: 0,
    inpUtilization: 0, icuUtilization: 0, ccuUtilization: 0, picuUtilization: 0, nicuUtilization: 0, cxUtilization: 0, strokeUtilization: 0,
    delayedDischargesNarrative: '', prolongedERNarrative: '', complaintsCount: 0, complaintsSummary: '', ovrsCount: 0, ovrsSummary: '',
    govVisit: 'No', govSummary: '', nightMedicalMeeting: '778000000', nightSummary: '',
  }
}

export function cleanId(id?: string) {
  return id ? String(id).replace(/[{}]/g, '') : ''
}

export function compact<T extends Record<string, unknown>>(payload: T) {
  Object.keys(payload).forEach((key) => {
    const value = payload[key]
    if (value === '' || value === null || value === undefined || Number.isNaN(value)) delete payload[key]
  })
  return payload
}

export function unwrap<T = any>(result: any): T {
  return result?.data ?? result?.value ?? result?.record ?? result?.entity ?? result
}

export function list<T = any>(result: any): T[] {
  const rows = result?.data ?? result?.value ?? result?.records ?? result?.entities ?? result
  return Array.isArray(rows) ? rows : []
}

export function formatDate(value?: string) {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function reportCode(form: FormState) {
  const bu = businessUnits.find(([value]) => String(value) === String(form.businessUnit))?.[1] || 'BU'
  const date = form.reportDate ? new Date(form.reportDate) : new Date()
  const shiftCode = form.shift === 'Morning' ? 'M' : form.shift === 'Evening' ? 'E' : 'N'
  return `${shiftCode}-${bu}-${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

type HandoverKey = Pick<FormState, 'dmName' | 'dmUserId' | 'businessUnit' | 'shift' | 'reportDate'>

// Two drafts are the same handover when the duty manager, business unit, shift and calendar day all match.
export function sameHandover(a: HandoverKey, b: HandoverKey) {
  const sameManager = a.dmUserId && b.dmUserId
    ? cleanId(a.dmUserId) === cleanId(b.dmUserId)
    : (a.dmName || '').trim().toLowerCase() === (b.dmName || '').trim().toLowerCase()
  return sameManager
    && String(a.businessUnit) === String(b.businessUnit)
    && a.shift === b.shift
    && String(a.reportDate || '').slice(0, 10) === String(b.reportDate || '').slice(0, 10)
}

export function getDrafts() {
  migrateLegacyDraft()
  const drafts: DraftRecord[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key?.startsWith('dm_handover_draft_')) continue
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        drafts.push(normalizeDraft(parsed))
      }
    } catch {}
  }
  return drafts.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
}

export function validate(form: FormState, events: EventItem[], adminIssues: AdminIssue[], opsIssues: OpsIssue[], damaEntries: DamaEntry[], earlyDischarges: EarlyDischarge[] = []) {
  const missing: string[] = []
  if (!form.dmName.trim()) missing.push('Duty Manager')
  if (!form.businessUnit) missing.push('Business Unit')
  if (!form.reportDate) missing.push('Report Date')
  if (!form.shift) missing.push('Shift')
  if (!form.staffAdequacy) missing.push('Staff Coverage')
  if (form.staffAdequacy === '778000000' && !form.shortageTypes.length) missing.push('Coverage Shortage')
  if (form.staffAdequacy === '778000000' && !form.shortfallSummary.trim()) missing.push('Shortfall Summary')
  if (form.hotIssues.trim().length < 15) missing.push('Hot Issues Summary')
  if (form.complaintsCount > 0 && !form.complaintsSummary.trim()) missing.push('Summary of Complaints')
  if (form.ovrsCount > 0 && !form.ovrsSummary.trim()) missing.push('Summary of OVRs')
  if (form.govVisit === 'Yes' && !form.govSummary.trim()) missing.push('Authority Name & Findings Summary')
  if (form.shift === 'Night' && form.nightMedicalMeeting === '778000000' && form.nightSummary.trim().length < 10) missing.push('Night Meeting Summary')
  if (form.shift === 'Night' && form.plannedDischarges > 0 && earlyDischarges.length === 0) missing.push('Tomorrow Discharge Plan')
  events.forEach((event, index) => {
    const label = `Event ${index + 1}`
    if (!event.typeId) missing.push(`${label} Type`)
    if (!event.codeId) missing.push(`${label} Code`)
    if (!event.area) missing.push(`${label} Context Area`)
    if (!event.pName?.trim() && !event.pCode?.trim()) missing.push(`${label} Patient`)
    if (!event.desc.trim()) missing.push(`${label} Incident Description`)
    if (!event.actions.trim()) missing.push(`${label} Immediate Actions Taken`)
  })
  adminIssues.forEach((issue, index) => {
    const label = `Admin Issue ${index + 1}`
    if (!issue.catId && !issue.catLabel.trim()) missing.push(`${label} Category`)
    if (!issue.status) missing.push(`${label} Resolution Status`)
    if (issue.status !== '778000001' && !issue.pendingDetails.trim()) missing.push(`${label} Pending Details`)
  })
  opsIssues.forEach((issue, index) => {
    const label = `Ops Issue ${index + 1}`
    if (!issue.funcId) missing.push(`${label} Service Functionality`)
    if (!issue.affectedId) missing.push(`${label} Service Affected`)
    if (!issue.issueId) missing.push(`${label} Type of Issue`)
    if (!issue.statusId) missing.push(`${label} Resolution Status`)
    if (!issue.desc.trim()) missing.push(`${label} Description of Issue`)
    if (issue.statusId !== '778000001' && !issue.pendingDetails.trim()) missing.push(`${label} Pending Details`)
  })
  damaEntries.forEach((entry, index) => {
    const label = `DAMA Entry ${index + 1}`
    if (!entry.patientName.trim() && !entry.patientCode.trim()) missing.push(`${label} Patient`)
    if (!entry.reason.trim()) missing.push(`${label} Reason`)
    if (!entry.actionTaken.trim()) missing.push(`${label} Action Taken`)
  })
  earlyDischarges.forEach((entry, index) => {
    const label = `Discharge Patient ${index + 1}`
    if (!entry.type) missing.push(`${label} Type`)
    if (!entry.name.trim() && !entry.code.trim()) missing.push(`${label} Patient`)
    if (!entry.reason.trim()) missing.push(`${label} Reason`)
  })
  const uniqueMissing = Array.from(new Set(missing))
  return { ok: uniqueMissing.length === 0, missing: uniqueMissing }
}

// Maps a validate() field label to the report page where it is entered.
export function missingFieldTab(field: string): TabKey {
  if (['Duty Manager', 'Business Unit', 'Report Date', 'Shift'].includes(field)) return 'general'
  if (field.startsWith('Event ')) return 'events'
  if (field.startsWith('Admin Issue ')) return 'admin'
  if (field.startsWith('Ops Issue ')) return 'ops'
  if (['Summary of Complaints', 'Summary of OVRs', 'Authority Name & Findings Summary'].includes(field)) return 'experience'
  if (['Hot Issues Summary', 'Night Meeting Summary'].includes(field)) return 'summary'
  return 'flow'
}

export function fallbackAlerts() {
  return [
    { id: 'local-alert-1', title: 'Alert feed is ready', description: 'Connected alerts will appear here when available.', severity: 'info', isRead: false, createdOn: new Date().toISOString() },
    { id: 'local-alert-2', title: 'Pending acknowledgments', description: 'Review recent reports and acknowledge them from the report viewer.', severity: 'warning', isRead: false, createdOn: new Date().toISOString() },
  ]
}

function normalizeDraft(data: any): DraftRecord {
  const base = initialForm()
  const planned = toNumber(data.plannedDischarges ?? data.planned ?? base.plannedDischarges)
  const unplanned = toNumber(data.unplannedDischarges ?? data.unplanneddis ?? base.unplannedDischarges)
  const erAdmissions = toNumber(data.erAdmissions ?? data.erAdm ?? base.erAdmissions)
  const opdAdmissions = toNumber(data.opdAdmissions ?? data.opdAdm ?? base.opdAdmissions)
  return {
    ...base,
    ...data,
    draftId: String(data.draftId || data.bu || data.businessUnit || Date.now()),
    reportId: data.reportId || '',
    flowSummaryId: data.flowSummaryId || '',
    dmName: data.dmName || data.dutyManager || base.dmName,
    dmUserId: data.dmUserId || data.currentDMUserId || base.dmUserId,
    businessUnit: String(data.businessUnit || data.bu || base.businessUnit || ''),
    reportDate: normalizeDateInput(data.reportDate || data.date || base.reportDate),
    shift: data.shift || base.shift,
    hotIssues: data.hotIssues || data.hot || base.hotIssues,
    staffAdequacy: String(data.staffAdequacy || data.staff || base.staffAdequacy),
    shortageTypes: data.shortageTypes || base.shortageTypes,
    shortfallSummary: data.shortfallSummary || data.shortfallSumm || base.shortfallSummary,
    erVolume: toNumber(data.erVolume ?? data.erVol ?? base.erVolume),
    erAdmissions,
    opdAdmissions,
    admissions: toNumber(data.admissions ?? data.adm ?? erAdmissions + opdAdmissions),
    plannedDischarges: planned,
    unplannedDischarges: unplanned,
    discharges: toNumber(data.discharges ?? data.totalDischarges ?? data.dis ?? base.discharges),
    delayedDischargesCount: toNumber(data.delayedDischargesCount ?? base.delayedDischargesCount),
    prolongedERAdmissionsCount: toNumber(data.prolongedERAdmissionsCount ?? base.prolongedERAdmissionsCount),
    totalORCases: toNumber(data.totalORCases ?? data.totalorcases ?? base.totalORCases),
    preoperative: toNumber(data.preoperative ?? base.preoperative),
    postoperative: toNumber(data.postoperative ?? base.postoperative),
    postponedORCases: toNumber(data.postponedORCases ?? data.postponedorcases ?? base.postponedORCases),
    cancelledORCases: toNumber(data.cancelledORCases ?? data.cancelledorcases ?? base.cancelledORCases),
    inpUtilization: toNumber(data.inpUtilization ?? data.inpUtil ?? base.inpUtilization),
    icuUtilization: toNumber(data.icuUtilization ?? data.icuUtil ?? base.icuUtilization),
    ccuUtilization: toNumber(data.ccuUtilization ?? data.ccuUtil ?? base.ccuUtilization),
    picuUtilization: toNumber(data.picuUtilization ?? data.picuUtil ?? base.picuUtilization),
    nicuUtilization: toNumber(data.nicuUtilization ?? data.nicuUtil ?? base.nicuUtilization),
    cxUtilization: toNumber(data.cxUtilization ?? data.cxUtil ?? base.cxUtilization),
    strokeUtilization: toNumber(data.strokeUtilization ?? data.strokeUtil ?? base.strokeUtilization),
    events: data.events || [],
    adminIssues: data.adminIssues || [],
    opsIssues: data.opsIssues || [],
    damaEntries: data.damaEntries || data.patientFlowEntries || [],
    timestamp: data.timestamp || 'Unknown',
  }
}

function toNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizeDateInput(value?: string) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return toLocalInput(date)
}

export function shortDate(value?: string) {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB')
}

export function shortTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function displayName(row: any) {
  // No fallback to dma_name: that is the report code (e.g. E-AMH-0910), not a person.
  return row?.['_dma_dutymanager_value@OData.Community.Display.V1.FormattedValue'] || row?.dma_DutyManager?.fullname || row?.dma_dutymanagername || row?.createdbyname || row?.owneridname || 'Not recorded'
}

function migrateLegacyDraft() {
  const oldRaw = localStorage.getItem('dm_handover_draft')
  if (!oldRaw) return
  try {
    const oldData = JSON.parse(oldRaw)
    const suffix = oldData?.draftId || oldData?.bu || oldData?.businessUnit
    if (suffix) {
      localStorage.setItem(`dm_handover_draft_${suffix}`, oldRaw)
      localStorage.removeItem('dm_handover_draft')
    }
  } catch {}
}



