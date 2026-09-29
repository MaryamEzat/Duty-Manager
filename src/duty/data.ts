import {
  Dma_administrativeissuesModel,
  Dma_handoverreportsModel,
  Dma_hospitaleventsModel,
  Dma_opeartionsModel,
  Dma_patientflowsummariesModel,
} from '../generated'
import { crossEnvTable } from './dataverse'

export type Shift = 'Morning' | 'Evening' | 'Night'
export type TabKey = 'general' | 'events' | 'admin' | 'flow' | 'ops' | 'experience' | 'summary'
export type MainView = 'home' | 'dashboard' | 'alerts' | 'report' | 'submitted'
export type Severity = '778000000' | '778000001' | '778000002'
export type Resolution = '778000000' | '778000002' | '778000001'

export type FormState = {
  dmName: string
  dmUserId: string
  businessUnit: string
  reportDate: string
  shift: Shift
  hotIssues: string
  staffAdequacy: string
  shortageTypes: string[]
  shortfallSummary: string
  erVolume: number
  erAdmissions: number
  opdAdmissions: number
  admissions: number
  plannedDischarges: number
  unplannedDischarges: number
  discharges: number
  delayedDischargesCount: number
  prolongedERAdmissionsCount: number
  totalORCases: number
  preoperative: number
  postoperative: number
  postponedORCases: number
  cancelledORCases: number
  erDama: number
  erDamaRetention: number
  inpDama: number
  inpDamaRetention: number
  closedDama: number
  closedDamaRetention: number
  inpUtilization: number
  icuUtilization: number
  ccuUtilization: number
  picuUtilization: number
  nicuUtilization: number
  cxUtilization: number
  strokeUtilization: number
  delayedDischargesNarrative: string
  prolongedERNarrative: string
  complaintsCount: number
  complaintsSummary: string
  ovrsCount: number
  ovrsSummary: string
  govVisit: 'Yes' | 'No'
  govSummary: string
  nightMedicalMeeting: string
  nightSummary: string
}

export type PatientArea = 'ER' | 'IPD' | 'IPD_KSA' | 'OPD_EG' | 'OPD_KSA'
export type EventItem = { id: string; typeId: string; typeText: string; codeId: string; codeText: string; severity: Severity; desc: string; actions: string; area?: PatientArea; pName?: string; pCode?: string; pId?: string; dataverseId?: string }
export type AdminIssue = { id: string; catId: string; catLabel: string; status: Resolution; desc: string; action: string; pendingDetails: string; area?: PatientArea; pName?: string; pCode?: string; pId?: string; carrySource?: string; dataverseId?: string }
export type OpsIssue = { id: string; funcId: string; affectedId: string; issueId: string; statusId: Resolution; desc: string; pendingDetails: string; carrySource?: string; dataverseId?: string }
export type DamaEntry = { id: string; damaType: 'ER' | 'INP' | 'Closed'; patientName: string; patientCode: string; reason: string; actionTaken: string; retained: boolean; area?: PatientArea; pId?: string; dataverseId?: string }
export type EarlyDischarge = { id: string; area: PatientArea; name: string; code: string; patientId: string; type: 'Planned' | 'Early'; reason: string }
export type DraftRecord = FormState & { draftId: string; reportId: string; flowSummaryId: string; experienceId?: string; events: EventItem[]; adminIssues: AdminIssue[]; opsIssues: OpsIssue[]; damaEntries: DamaEntry[]; earlyDischarges?: EarlyDischarge[]; timestamp: string }

// All tables live in the DT New environment (see dataverse.ts), not the app's home environment.
export const Services = {
  reports: crossEnvTable('dma_handoverreports'),
  flow: crossEnvTable('dma_patientflowsummaries'),
  experience: crossEnvTable('dma_patientexperiences'),
  ops: crossEnvTable('dma_opeartions'),
  events: crossEnvTable('dma_hospitalevents'),
  adminEntries: crossEnvTable('dma_administrativeissueentries'),
  flowEntries: crossEnvTable('dma_patientflowentries'),
  alerts: crossEnvTable('dma_alerts'),
  coverageShortages: crossEnvTable('dma_coverageshortages'),
  eventTypes: crossEnvTable('dma_eventtypes'),
  eventCodes: crossEnvTable('dma_eventcodes'),
  adminIssues: crossEnvTable('dma_administrativeissues'),
  users: crossEnvTable('systemusers'),
  erVisits: crossEnvTable('cr301_ervisitses'),
  ipdPatients: crossEnvTable('ipd_patients'),
  opdPatients: crossEnvTable('opd_patients'),
  ksaPatients: crossEnvTable('opd_ksapatientses'),
  earlyDischargeMasters: crossEnvTable('and_earlydischarges'),
  earlyDischargePatients: crossEnvTable('and_earlydischarge_ipdvisitses'),
  inpatientList: crossEnvTable('and_inpatientlists'),
  patientDischarges: crossEnvTable('crad2_patientdischarges'),
}

export const Models = {
  reports: Dma_handoverreportsModel,
  flow: Dma_patientflowsummariesModel,
  ops: Dma_opeartionsModel,
  events: Dma_hospitaleventsModel,
  adminIssues: Dma_administrativeissuesModel,
}

const allowedBusinessUnitLabels = new Set(['AMH', 'ASH', 'SMH', 'AHJ'])
export const businessUnits = Object.entries(Dma_handoverreportsModel.Dma_handoverreportsdma_businessunit).filter(([, label]) => allowedBusinessUnitLabels.has(label))
export const severityOptions = Object.entries(Dma_hospitaleventsModel.Dma_hospitaleventsdma_severitylevel)
export const resolutionOptions = Object.entries(Dma_opeartionsModel.Dma_opeartionsdma_resolutionstatus)
export const serviceFunctionalityOptions = Object.entries(Dma_opeartionsModel.Dma_opeartionsdma_servicefunctionality)
export const serviceAffectedOptions = Object.entries(Dma_opeartionsModel.Dma_opeartionsdma_serviceaffected)
export const opsIssueOptions = Object.entries(Dma_opeartionsModel.Dma_opeartionsdma_typeofissue)
export const staffOptions = Object.entries(Dma_patientflowsummariesModel.Dma_patientflowsummariesdma_staffadequacy)
export const shortageOptions = Object.entries(Dma_patientflowsummariesModel.Dma_patientflowsummariesdma_shortagetype)
export const adminFallbackOptions = Object.entries(Dma_administrativeissuesModel.Dma_administrativeissuesdma_issuetype)
export const shiftMap: Record<Shift, number> = { Morning: 989230000, Evening: 989230001, Night: 989230002 }

export function shiftFromValue(value?: number): Shift {
  if (value === 989230001) return 'Evening'
  if (value === 989230002) return 'Night'
  return 'Morning'
}

export function labelFor(entries: [string, string][], value: string | number) {
  return entries.find(([key]) => String(key) === String(value))?.[1] || String(value || '')
}
