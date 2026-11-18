// Command Center KPIs, calculated from the submitted handover reports in a shift-date range and the
// records linked to them. Pure functions over plain Dataverse rows, so the formulas can be tested.

export type KpiShift = 'Morning' | 'Evening' | 'Night'

export type KpiReport = {
  id: string
  businessUnit: string
  shift: KpiShift
  shiftDate: string // YYYY-MM-DD business date of the shift
  createdOn?: string
  acknowledgedAt?: string
  nightMeeting?: number | null
}

export type KpiCapacity = { er?: number; ward?: number; critical: Partial<Record<CriticalUnit, number>> }
type CriticalUnit = 'icu' | 'ccu' | 'picu' | 'nicu' | 'cpu' | 'stroke'

export type KpiInput = {
  reports: KpiReport[]
  // Child rows keyed by lower-case report id.
  flows: Record<string, any>
  experiences: Record<string, any>
  events: Record<string, any[]>
  adminEntries: Record<string, any[]>
  operations: Record<string, any[]>
  capacities: Record<string, KpiCapacity> // by business-unit value
  from: string
  to: string
  shifts: KpiShift[]
  businessUnits: string[]
  now: Date
}

// The loaded records, before a date range, shifts and hospitals are applied.
export type KpiData = Omit<KpiInput, 'from' | 'to' | 'shifts' | 'businessUnits' | 'now'>
export type KpiValue = { value: number | null; text: string; detail: string }
export type KpiDefinition = { key: string; label: string; formula: string }

export const NIGHT_MEETING_DONE = 778000000
export const SEVERITY_MAJOR = 778000002
export const RESOLUTION_RESOLVED = 778000001
export const GOV_VISIT_YES = 999740000

const criticalUnits: [CriticalUnit, string][] = [['icu', 'dma_icuutilization'], ['ccu', 'dma_ccuutilization'], ['picu', 'dma_picuutilization'], ['nicu', 'dma_nicuutilization'], ['cpu', 'dma_cxutilization'], ['stroke', 'dma_strokeutilization']]

// Event codes split into medical and non-medical. Event types and codes in Dataverse carry no such flag,
// so the split is kept here: every Patient Safety Incident, every ER Code except Crowd, and the Hospital
// Codes Blue and RRT are medical; the other Hospital Codes and ER Code Crowd are non-medical.
const NON_MEDICAL_CODES: Record<string, string[]> = {
  'hospital code': ['red', 'pink', 'brown', 'black', 'yellow', 'green'],
  'er code': ['crowd'],
}
const MEDICAL_CODES: Record<string, string[] | 'all'> = {
  'patient safety incident': 'all',
  'er code': 'all',
  'hospital code': ['blue', 'rrt'],
}
const FORMATTED = '@OData.Community.Display.V1.FormattedValue'
const norm = (value: unknown) => String(value ?? '').trim().toLowerCase()

export function eventCategory(event: any): 'medical' | 'non-medical' | 'unclassified' {
  const type = norm(event?.[`_dma_eventtype_value${FORMATTED}`])
  const code = norm(event?.[`_dma_eventcode_value${FORMATTED}`])
  if (NON_MEDICAL_CODES[type]?.includes(code)) return 'non-medical'
  const medical = MEDICAL_CODES[type]
  if (medical === 'all' || medical?.includes(code)) return 'medical'
  return 'unclassified'
}

export const KPI_DEFINITIONS: KpiDefinition[] = [
  { key: 'submission', label: 'Handover report submission compliance', formula: 'Shifts with a submitted report ÷ shifts that have ended in the range' },
  { key: 'ackTime', label: 'Handover acknowledgment time (avg min)', formula: 'Average minutes from the end of the shift to acknowledgment' },
  { key: 'nightMeeting', label: 'Night medical meeting compliance', formula: 'Night reports with the meeting Done ÷ Night reports' },
  { key: 'criticalCare', label: 'Critical care utilization (avg of units)', formula: 'Average of ICU, CCU, PICU, NICU, CPU and Stroke % on Night reports (units the hospital has)' },
  { key: 'inpatient', label: 'Inpatient utilization (avg)', formula: 'Average ward % on Night reports' },
  { key: 'erUtilization', label: 'ER utilization', formula: 'Average ER % (occupied ER beds ÷ ER capacity) on Night reports' },
  { key: 'prolongedEr', label: 'Prolonged ER admissions (more than 24 hrs)', formula: 'Sum of prolonged ER admissions' },
  { key: 'damaRate', label: 'DAMA rate', formula: 'DAMA cases ÷ (ER volume + discharges); ER = ER DAMA ÷ ER volume, inpatient = inpatient and closed-area DAMA ÷ discharges' },
  { key: 'damaRetention', label: 'DAMA retention rate', formula: 'Retained DAMA cases ÷ DAMA cases' },
  { key: 'delayedDischarge', label: 'Delayed discharge rate', formula: 'Delayed discharges ÷ total discharges' },
  { key: 'orCancelPostpone', label: 'OR cancellations & postponements (No.)', formula: 'Cancelled + postponed OR cases' },
  { key: 'majorMedical', label: 'Major medical events with immediate actions', formula: 'Major-severity medical events that have immediate actions recorded' },
  { key: 'majorNonMedical', label: 'Major non-medical events with immediate actions', formula: 'Major-severity non-medical events that have immediate actions recorded' },
  { key: 'vipVisits', label: 'Significant visits or VIP patients', formula: 'Reports with a governmental / regulatory visit' },
  { key: 'escalatedOvrs', label: 'Escalated OVRs', formula: 'Sum of escalated OVRs' },
  { key: 'escalatedComplaints', label: 'Escalated complaints', formula: 'Sum of escalated complaints' },
  { key: 'issueResolution', label: 'Issue resolution rate', formula: 'Resolved administrative and operations issues ÷ all logged' },
  { key: 'actions', label: 'No. of actions from the reports', formula: 'Events with immediate actions + administrative issues with an action taken' },
]

const num = (value: unknown) => (value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null)
const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)
const average = (values: number[]) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : null)
const filled = (value: unknown) => String(value ?? '').trim().length > 0
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function percent(numerator: number, denominator: number, detail: string): KpiValue {
  if (!denominator) return { value: null, text: '–', detail: 'No data' }
  const value = (numerator / denominator) * 100
  return { value, text: `${value.toFixed(1)}%`, detail }
}
function averagePercent(values: number[], detail: string): KpiValue {
  const value = average(values)
  return value == null ? { value: null, text: '–', detail: 'No data' } : { value, text: `${value.toFixed(1)}%`, detail }
}
const count = (value: number, detail: string): KpiValue => ({ value, text: String(value), detail })
const ratio = (numerator: number, denominator: number) => (denominator ? `${((numerator / denominator) * 100).toFixed(1)}%` : '–')

// Local date + hour, e.g. the end of a Night shift on 2026-11-01 is 2026-11-02 08:00.
export function shiftEnd(shiftDate: string, shift: KpiShift) {
  const [year, month, day] = shiftDate.split('-').map(Number)
  if (shift === 'Morning') return new Date(year, month - 1, day, 14)
  if (shift === 'Evening') return new Date(year, month - 1, day, 20)
  return new Date(year, month - 1, day + 1, 8)
}

export function datesInRange(from: string, to: string) {
  const dates: string[] = []
  const [year, month, day] = from.split('-').map(Number)
  const cursor = new Date(year, month - 1, day)
  for (let guard = 0; guard < 400; guard += 1) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (key > to) break
    dates.push(key)
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

const slotKey = (report: Pick<KpiReport, 'businessUnit' | 'shift' | 'shiftDate'>) => `${report.businessUnit}|${report.shift}|${report.shiftDate}`

// One report per hospital/shift/date: when a slot was submitted twice, the latest report counts.
export function latestPerSlot(reports: KpiReport[]) {
  const latest = new Map<string, KpiReport>()
  for (const report of reports) {
    const current = latest.get(slotKey(report))
    if (!current || String(report.createdOn || '') > String(current.createdOn || '')) latest.set(slotKey(report), report)
  }
  return Array.from(latest.values())
}

// Per-record rules used by the KPIs below, exported so the Command Center export can show which records count.
export const isMajorWithActions = (event: any) => Number(event?.dma_severitylevel) === SEVERITY_MAJOR && filled(event?.dma_immediateactionstaken)
export const isEventAction = (event: any) => filled(event?.dma_immediateactionstaken)
export const isAdminAction = (entry: any) => filled(entry?.dma_actiontaken)
export const isResolved = (issue: any) => Number(issue?.dma_resolutionstatus) === RESOLUTION_RESOLVED
// Minutes from the end of the shift to acknowledgment (0 when acknowledged before the shift ended).
export function ackMinutes(report: KpiReport) {
  if (!report.acknowledgedAt) return null
  const minutes = Math.max(0, (new Date(report.acknowledgedAt).getTime() - shiftEnd(report.shiftDate, report.shift).getTime()) / 60000)
  return Number.isFinite(minutes) ? minutes : null
}

export function computeKpis(input: KpiInput): Record<string, KpiValue> {
  const reports = latestPerSlot(input.reports.filter((report) =>
    input.businessUnits.includes(report.businessUnit) && input.shifts.includes(report.shift) && report.shiftDate >= input.from && report.shiftDate <= input.to))
  const flow = (report: KpiReport) => input.flows[report.id]
  const experience = (report: KpiReport) => input.experiences[report.id]
  const rowsOf = (source: Record<string, any[]>) => reports.flatMap((report) => source[report.id] || [])

  // Submission: every shift that has ended is expected; a report submitted before its shift ended also counts.
  const submitted = new Set(reports.map(slotKey))
  const expected = new Set(submitted)
  for (const date of datesInRange(input.from, input.to))
    for (const shift of input.shifts)
      for (const businessUnit of input.businessUnits)
        if (shiftEnd(date, shift) <= input.now) expected.add(slotKey({ businessUnit, shift, shiftDate: date }))

  const acknowledged = reports.filter((report) => report.acknowledgedAt)
  const ackAverage = average(acknowledged.map(ackMinutes).filter((minutes): minutes is number => minutes != null))

  const nights = reports.filter((report) => report.shift === 'Night')
  const meetingsDone = nights.filter((report) => Number(report.nightMeeting) === NIGHT_MEETING_DONE).length

  const criticalValues: number[] = []
  const wardValues: number[] = []
  const erValues: number[] = []
  for (const report of nights) {
    const row = flow(report)
    const capacity = input.capacities[report.businessUnit]
    if (!row || !capacity) continue
    const units = criticalUnits.filter(([unit, field]) => capacity.critical[unit] && num(row[field]) != null).map(([, field]) => num(row[field])!)
    const reportAverage = average(units)
    if (reportAverage != null) criticalValues.push(reportAverage)
    if (capacity.ward && num(row.dma_inputilization) != null) wardValues.push(num(row.dma_inputilization)!)
    if (capacity.er) erValues.push(num(row.dma_erutilization) ?? 0) // nothing entered = no ER beds occupied
  }

  const flows = reports.map(flow).filter(Boolean)
  const erVolume = sum(flows.map((row) => num(row.dma_ervolume)))
  const discharges = sum(flows.map((row) => num(row.dma_discharges) ?? sum([num(row.dma_planneddischarges), num(row.dma_unplanneddischarges)])))
  const erDama = sum(flows.map((row) => num(row.dma_erdama)))
  const inpDama = sum(flows.map((row) => sum([num(row.dma_inpdama), num(row.dma_closeddama)])))
  const retained = sum(flows.map((row) => sum([num(row.dma_erdamaretention), num(row.dma_inpdamaretention), num(row.dma_closeddamaretention)])))
  const damaCases = erDama + inpDama
  const delayed = sum(flows.map((row) => num(row.dma_delayeddischargescount)))
  const cancelled = sum(flows.map((row) => num(row.dma_cancelledorcases)))
  const postponed = sum(flows.map((row) => num(row.dma_postponedorcases)))
  const orCases = sum(flows.map((row) => num(row.dma_totalorcases)))

  const events = rowsOf(input.events)
  const majorWithActions = events.filter(isMajorWithActions)
  const majorMedical = majorWithActions.filter((event) => eventCategory(event) === 'medical').length
  const majorNonMedical = majorWithActions.filter((event) => eventCategory(event) === 'non-medical').length
  const unclassified = majorWithActions.length - majorMedical - majorNonMedical

  const experiences = reports.map(experience).filter(Boolean)
  const issues = [...rowsOf(input.adminEntries), ...rowsOf(input.operations)]
  const resolved = issues.filter(isResolved).length
  const adminActions = rowsOf(input.adminEntries).filter(isAdminAction).length
  const eventActions = events.filter(isEventAction).length

  return {
    submission: percent(submitted.size, expected.size, `${submitted.size} of ${plural(expected.size, 'shift')}`),
    ackTime: ackAverage == null ? { value: null, text: '–', detail: 'No acknowledged reports' } : { value: ackAverage, text: `${Math.round(ackAverage)} min`, detail: `${acknowledged.length} of ${plural(reports.length, 'report')} acknowledged` },
    nightMeeting: percent(meetingsDone, nights.length, `${meetingsDone} of ${plural(nights.length, 'night report')}`),
    criticalCare: averagePercent(criticalValues, plural(criticalValues.length, 'night report')),
    inpatient: averagePercent(wardValues, plural(wardValues.length, 'night report')),
    erUtilization: averagePercent(erValues, plural(erValues.length, 'night report')),
    prolongedEr: count(sum(flows.map((row) => num(row.dma_prolongederadmissionscount))), plural(flows.length, 'report')),
    damaRate: percent(damaCases, erVolume + discharges, `${plural(damaCases, 'case')} · ER ${ratio(erDama, erVolume)} · Inpatient ${ratio(inpDama, discharges)}`),
    damaRetention: percent(retained, damaCases, `${retained} of ${plural(damaCases, 'case')} retained`),
    delayedDischarge: percent(delayed, discharges, `${delayed} of ${plural(discharges, 'discharge')}`),
    orCancelPostpone: count(cancelled + postponed, `${cancelled} cancelled · ${postponed} postponed · ${orCases} OR cases`),
    majorMedical: count(majorMedical, plural(majorWithActions.length, 'major event') + ' with actions'),
    majorNonMedical: count(majorNonMedical, unclassified ? `${unclassified} without an event code` : plural(majorWithActions.length, 'major event') + ' with actions'),
    vipVisits: count(experiences.filter((row) => Number(row.dma_governmentalregulatoryvisits) === GOV_VISIT_YES).length, `of ${plural(experiences.length, 'report')}`),
    escalatedOvrs: count(sum(experiences.map((row) => num(row.dma_escalatedovrs))), plural(experiences.length, 'report')),
    escalatedComplaints: count(sum(experiences.map((row) => num(row.dma_escalatedcomplaints))), plural(experiences.length, 'report')),
    issueResolution: percent(resolved, issues.length, `${resolved} of ${plural(issues.length, 'issue')} resolved`),
    actions: count(eventActions + adminActions, `${eventActions} event · ${adminActions} administrative`),
  }
}

// Scorecard columns: "All hospitals" plus one per hospital, or only the chosen hospital.
export type ScorecardColumn = { value: string; label: string; units: string[] }
export function scorecardColumns(hospitals: [string, string][], selected = 'all'): ScorecardColumn[] {
  if (selected !== 'all') return hospitals.filter(([value]) => value === selected).map(([value, label]) => ({ value, label, units: [value] }))
  return [{ value: 'all', label: 'All hospitals', units: hospitals.map(([value]) => value) }, ...hospitals.map(([value, label]) => ({ value, label, units: [value] }))]
}

// The one place KPI results are produced, for the on-screen scorecard and for the export alike.
export function computeScorecard(data: KpiData, scope: { from: string; to: string; shifts: KpiShift[]; now: Date }, columns: ScorecardColumn[]) {
  return columns.map((column) => ({ ...column, results: computeKpis({ ...data, ...scope, businessUnits: column.units }) }))
}
