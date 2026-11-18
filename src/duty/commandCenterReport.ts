// Command Center export: one workbook with the KPI scorecard and the submitted reports and records behind it.
// KPI values come from computeScorecard (the same function as the on-screen scorecard); the detail sheets
// only list records and mark which ones count, using the per-record rules exported by kpis.ts.
import { ackMinutes, computeScorecard, eventCategory, isAdminAction, isEventAction, isMajorWithActions, isResolved, KPI_DEFINITIONS, latestPerSlot, scorecardColumns, SEVERITY_MAJOR, type KpiData, type KpiReport, type KpiShift } from './kpis'
import type { Cell, Sheet } from './xlsx'

// The KPI data plus each report's own row (name, duty manager, hot issues...), keyed by lower-case report id.
export type CommandCenterData = KpiData & { reportRows: Record<string, any> }
export type ExportScope = {
  from: string
  to: string
  shifts: KpiShift[]
  businessUnit: string // 'all' or a business-unit value
  hospitals: [string, string][] // [value, label] for AMH, ASH, SMH, AHJ
  generatedAt: Date
}

const FORMATTED = '@OData.Community.Display.V1.FormattedValue'
const SHIFT_ORDER: KpiShift[] = ['Morning', 'Evening', 'Night']
const PATIENT_LOOKUPS = ['_dma_erpatient_value', '_dma_ipdpatients_value', '_dma_ipdpatientsksa_value', '_dma_opdpatienteg_value', '_dma_opdpatientksa_value']

// ── Figures shared with the Command Center hospital table ──
export const PEAK_UNITS: [string, string][] = [['Ward', 'dma_inputilization'], ['ICU', 'dma_icuutilization'], ['CCU', 'dma_ccuutilization'], ['PICU', 'dma_picuutilization'], ['NICU', 'dma_nicuutilization'], ['CPU', 'dma_cxutilization'], ['Stroke', 'dma_strokeutilization'], ['ER', 'dma_erutilization']]
export const sumOrNull = (...values: unknown[]) => values.some((value) => value != null) ? values.reduce<number>((sum, value) => sum + (Number(value) || 0), 0) : null
export const isMajorEvent = (event: any) => Number(event?.dma_severitylevel) === SEVERITY_MAJOR
export function peakUtilization(flow: any) {
  if (!flow) return null
  const peak = PEAK_UNITS.map(([label, field]) => ({ label, value: Number(flow[field]) || 0 })).sort((a, b) => b.value - a.value)[0]
  return peak && peak.value > 0 ? peak : null
}

// "YYYY-MM-DD HH:mm" in local time.
export function localStamp(value?: string | Date) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const text = (row: any, field: string) => String(row?.[`${field}${FORMATTED}`] ?? row?.[field] ?? '')
const number = (value: unknown) => (value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value))
const yesNo = (value: boolean) => (value ? 'Yes' : 'No')
const header = (labels: string[]): Cell[] => labels.map((value) => ({ value, style: 'header' as const }))
const patientOf = (row: any) => PATIENT_LOOKUPS.map((field) => row?.[`${field}${FORMATTED}`]).find(Boolean) || ''

export function exportFileName(scope: ExportScope) {
  const shift = scope.shifts.length === SHIFT_ORDER.length ? 'all-shifts' : scope.shifts.join('-').toLowerCase()
  const hospital = scope.businessUnit === 'all' ? 'all-hospitals' : (scope.hospitals.find(([value]) => value === scope.businessUnit)?.[1] || scope.businessUnit).toLowerCase()
  return `duty-manager-command-center-${scope.from}-to-${scope.to}-${shift}-${hospital}.xlsx`
}

export function buildCommandCenterWorkbook(data: CommandCenterData, scope: ExportScope): Sheet[] {
  const columns = scorecardColumns(scope.hospitals, scope.businessUnit)
  const units = columns.flatMap((column) => column.units)
  const scorecard = computeScorecard(data, { from: scope.from, to: scope.to, shifts: scope.shifts, now: scope.generatedAt }, columns)
  const hospitalLabel = (value: string) => scope.hospitals.find(([key]) => key === value)?.[1] || value
  const hospitalOrder = (value: string) => scope.hospitals.findIndex(([key]) => key === value)

  // Same report set as computeKpis: hospital, shift and shift date in scope; duplicates kept but marked.
  const reports = data.reports
    .filter((report) => units.includes(report.businessUnit) && scope.shifts.includes(report.shift) && report.shiftDate >= scope.from && report.shiftDate <= scope.to)
    .sort((a, b) => a.shiftDate.localeCompare(b.shiftDate) || hospitalOrder(a.businessUnit) - hospitalOrder(b.businessUnit)
      || SHIFT_ORDER.indexOf(a.shift) - SHIFT_ORDER.indexOf(b.shift) || String(a.createdOn || '').localeCompare(String(b.createdOn || '')))
  const counted = new Set(latestPerSlot(reports).map((report) => report.id))
  const row = (report: KpiReport) => data.reportRows[report.id] || {}
  const dutyManager = (report: KpiReport) => text(row(report), '_dma_dutymanager_value') || 'Not recorded'
  const countedText = (report: KpiReport) => (counted.has(report.id) ? 'Yes' : 'No (later submission for this shift counts)')
  const reportLabels = ['Shift Date', 'Business Unit', 'Shift', 'Report Name', 'Duty Manager', 'Counted in KPIs']
  const reportCells = (report: KpiReport): Cell[] => [report.shiftDate, hospitalLabel(report.businessUnit), report.shift, row(report).dma_name || '', dutyManager(report), countedText(report)]
  const empty = (message: string): Cell[][] => [[message]]
  const childRows = (source: Record<string, any[]>) => reports.flatMap((report) => (source[report.id] || []).map((record) => ({ report, record })))

  // Sheet 1: context and overview.
  const scopeText = scope.businessUnit === 'all' ? `All hospitals (${scope.hospitals.map(([, label]) => label).join(', ')})` : hospitalLabel(scope.businessUnit)
  const overview: Cell[][] = columns.map((column) => {
    const inColumn = reports.filter((report) => column.units.includes(report.businessUnit))
    const countedReports = inColumn.filter((report) => counted.has(report.id))
    const records = (source: Record<string, any[]>) => countedReports.flatMap((report) => source[report.id] || [])
    const issues = [...records(data.adminEntries), ...records(data.operations)]
    const results = scorecard.find((entry) => entry.value === column.value)!.results
    return [column.label, results.submission.text, results.submission.detail, results.ackTime.text, countedReports.length, inColumn.length - countedReports.length,
      records(data.events).length, records(data.events).filter(isMajorEvent).length, issues.length, issues.filter((issue) => !isResolved(issue)).length]
  })
  const summary: Sheet = {
    name: 'Executive Summary',
    widths: [26, 22, 22, 18, 16, 18, 10, 12, 18, 18],
    rows: [
      [{ value: 'Duty Manager Command Center report', style: 'title' }],
      [],
      [{ value: 'Generated', style: 'bold' }, localStamp(scope.generatedAt)],
      [{ value: 'From (shift date)', style: 'bold' }, scope.from],
      [{ value: 'To (shift date)', style: 'bold' }, scope.to],
      [{ value: 'Shift', style: 'bold' }, scope.shifts.length === SHIFT_ORDER.length ? 'All shifts' : scope.shifts.join(', ')],
      [{ value: 'Business units', style: 'bold' }, scopeText],
      [{ value: 'Reports included', style: 'bold' }, 'Submitted and acknowledged reports only; drafts are not included.'],
      [{ value: 'Duplicate submissions', style: 'bold' }, 'When a shift was submitted more than once, only the latest report counts in the KPIs. Earlier ones are listed with "Counted in KPIs" = No.'],
      [],
      header(['Business unit', 'Submission compliance', 'Submitted / expected shifts', 'Avg acknowledgment', 'Reports counted in KPIs', 'Superseded duplicates',
        'Events (counted reports)', 'Major events (counted reports)', 'Admin & ops issues (counted reports)', 'Unresolved issues (counted reports)']),
      ...overview,
      ...(reports.length ? [] : [[], ['No submitted reports were found for the selected period.']]),
    ],
  }

  // Sheet 2: KPI scorecard, value and calculation detail per column.
  const kpiSheet: Sheet = {
    name: 'KPI Scorecard',
    freezeRows: 1,
    widths: [46, 60, ...columns.flatMap(() => [14, 34])],
    rows: [
      header(['KPI', 'How it is calculated', ...columns.flatMap((column) => [column.label, `${column.label} detail`])]),
      ...KPI_DEFINITIONS.map((kpi): Cell[] => [kpi.label, kpi.formula, ...scorecard.flatMap((column) => [column.results[kpi.key].text, column.results[kpi.key].detail])]),
    ],
  }

  // Sheet 3: one row per submitted report (the fields of the earlier Command Center export, plus shift date and KPI link).
  const reportSheet: Sheet = {
    name: 'Reports',
    freezeRows: 1,
    widths: [12, 10, 10, 18, 26, 22, 14, 18, 18, 18, 16, 16, 14, 40, 40, 16, 12, 12, 10, 10, 10, 10, 10, 16, 10, 10, 10, 38],
    rows: [
      header([...reportLabels, 'Report Status', 'Report Date/Time', 'Report Created Date/Time', 'Acknowledged Date/Time', 'Minutes to Acknowledge (from report creation)', 'Minutes to Acknowledge (from shift end, used in KPI)',
        'Night Medical Meeting', 'Night Meeting Summary', 'Hot Issues', 'Staff Coverage', 'Admissions', 'Discharges', 'Major Incidents', 'Unresolved Issues', 'ER DAMA', 'ER DAMA Retained', 'INP DAMA', 'Peak Utilization',
        'Events', 'Admin Issues', 'Operations Issues', 'Report ID']),
      ...(reports.length ? reports.map((report): Cell[] => {
        const raw = row(report)
        const flow = data.flows[report.id]
        const created = new Date(report.createdOn || '').getTime()
        const acknowledged = new Date(report.acknowledgedAt || '').getTime()
        const issues = [...(data.adminEntries[report.id] || []), ...(data.operations[report.id] || [])]
        const peak = peakUtilization(flow)
        const minutes = ackMinutes(report)
        return [...reportCells(report), report.acknowledgedAt ? 'Acknowledged' : 'Submitted', localStamp(raw.dma_reportdate), localStamp(report.createdOn), localStamp(report.acknowledgedAt),
          Number.isFinite(created) && Number.isFinite(acknowledged) ? Math.max(0, Math.round((acknowledged - created) / 60000)) : null,
          minutes == null ? null : Math.round(minutes),
          report.shift === 'Night' ? text(raw, 'dma_nightmedicalmeeting') || 'Not recorded' : '', raw.dma_nightmedicalmeetingsummary || '', raw.dma_hotissues || '',
          flow ? text(flow, 'dma_staffadequacy') || 'Not recorded' : '',
          flow ? sumOrNull(flow.dma_eradmissions, flow.dma_opdadmissions) : null, flow ? sumOrNull(flow.dma_planneddischarges, flow.dma_unplanneddischarges) : null,
          (data.events[report.id] || []).filter(isMajorEvent).length, issues.filter((issue) => !isResolved(issue)).length,
          number(flow?.dma_erdama) ?? 0, number(flow?.dma_erdamaretention) ?? 0, number(flow?.dma_inpdama) ?? 0, peak ? `${peak.label} ${peak.value}%` : '',
          (data.events[report.id] || []).length, (data.adminEntries[report.id] || []).length, (data.operations[report.id] || []).length, raw.dma_handoverreportid || report.id]
      }) : empty('No submitted reports for the selected period.')),
    ],
  }

  // Sheet 4: patient flow summary of each report.
  const flowFields: [string, string][] = [
    ['ER Volume', 'dma_ervolume'], ['ER Admissions', 'dma_eradmissions'], ['OPD Admissions', 'dma_opdadmissions'], ['Total Admissions', 'dma_admissions'],
    ['Total Discharges', 'dma_discharges'], ['Planned Discharges', 'dma_planneddischarges'], ['Unplanned Discharges', 'dma_unplanneddischarges'],
    ['Delayed Discharges', 'dma_delayeddischargescount'], ['Prolonged ER Admissions', 'dma_prolongederadmissionscount'],
    ['Total OR Cases', 'dma_totalorcases'], ['Pre-operative', 'dma_preoperative'], ['Post-operative', 'dma_postoperative'], ['Postponed OR Cases', 'dma_postponedorcases'], ['Cancelled OR Cases', 'dma_cancelledorcases'],
    ['ER DAMA', 'dma_erdama'], ['ER DAMA Retained', 'dma_erdamaretention'], ['INP DAMA', 'dma_inpdama'], ['INP DAMA Retained', 'dma_inpdamaretention'], ['Closed DAMA', 'dma_closeddama'], ['Closed DAMA Retained', 'dma_closeddamaretention'],
    ['Ward Utilization %', 'dma_inputilization'], ['ICU Utilization %', 'dma_icuutilization'], ['CCU Utilization %', 'dma_ccuutilization'], ['PICU Utilization %', 'dma_picuutilization'],
    ['NICU Utilization %', 'dma_nicuutilization'], ['CPU Utilization %', 'dma_cxutilization'], ['Stroke Utilization %', 'dma_strokeutilization'], ['ER Utilization %', 'dma_erutilization'],
  ]
  const flowReports = reports.filter((report) => data.flows[report.id])
  const flowSheet: Sheet = {
    name: 'Patient Flow',
    freezeRows: 1,
    widths: [12, 10, 10, 18, 26, 22, 16, 24, 36, ...flowFields.map(() => 12), 40, 40],
    rows: [
      header([...reportLabels, 'Staff Adequacy', 'Shortage Types', 'Shortfall Summary', ...flowFields.map(([label]) => label), 'Delayed Discharge Narrative', 'Prolonged ER Narrative']),
      ...(flowReports.length ? flowReports.map((report): Cell[] => {
        const flow = data.flows[report.id]
        return [...reportCells(report), text(flow, 'dma_staffadequacy'), text(flow, 'dma_shortagetype'), flow.dma_shortfallsummary || '',
          ...flowFields.map(([, field]) => number(flow[field])), flow.dma_delayeddischargesnarrative || '', flow.dma_prolongedernarrative || '']
      }) : empty('No patient flow records for the selected reports.')),
    ],
  }

  // Sheet 5: hospital events, with the KPI rules each one meets.
  const eventRows = childRows(data.events)
  const categoryLabel = { medical: 'Medical', 'non-medical': 'Non-medical', unclassified: 'Unclassified (no event type/code)' }
  const eventSheet: Sheet = {
    name: 'Events',
    freezeRows: 1,
    widths: [12, 10, 10, 18, 26, 22, 22, 16, 16, 18, 18, 22, 12, 44, 44, 18, 14, 26],
    rows: [
      header([...reportLabels, 'Event', 'Event Time', 'Logged At', 'Event Type', 'Event Code', 'Medical / Non-medical', 'Severity', 'Description', 'Immediate Actions Taken',
        'Major With Immediate Actions', 'Counts as Action', 'Patient']),
      ...(eventRows.length ? eventRows.map(({ report, record }): Cell[] => [...reportCells(report), record.dma_name || '', localStamp(record.dma_eventtime), localStamp(record.dma_eventlogtimestamp),
        text(record, '_dma_eventtype_value'), text(record, '_dma_eventcode_value'), categoryLabel[eventCategory(record)], text(record, 'dma_severitylevel'),
        record.dma_incidentdescription || '', record.dma_immediateactionstaken || '', yesNo(isMajorWithActions(record)), yesNo(isEventAction(record)), patientOf(record)])
        : empty('No hospital events for the selected reports.')),
    ],
  }

  // Sheet 6: administrative issues and operations outages.
  const issueRows: Cell[][] = [
    ...childRows(data.adminEntries).map(({ report, record }): Cell[] => [...reportCells(report), 'Administrative', text(record, '_dma_issueid_value'), record.dma_name || '', record.dma_description || '',
      text(record, 'dma_resolutionstatus'), yesNo(isResolved(record)), record.dma_actiontaken || '', yesNo(isAdminAction(record)), record.dma_pendingissues || '', '', '', patientOf(record)]),
    ...childRows(data.operations).map(({ report, record }): Cell[] => [...reportCells(report), 'Operations', text(record, 'dma_typeofissue'), record.dma_name || '', record.dma_descriptionofissue || '',
      text(record, 'dma_resolutionstatus'), yesNo(isResolved(record)), '', 'No', record.dma_pendingissues || '', text(record, 'dma_servicefunctionality'), text(record, 'dma_serviceaffected'), '']),
  ]
  const issueSheet: Sheet = {
    name: 'Admin & Operations Issues',
    freezeRows: 1,
    widths: [12, 10, 10, 18, 26, 22, 16, 26, 26, 44, 14, 10, 40, 14, 40, 18, 18, 26],
    rows: [
      header([...reportLabels, 'Source', 'Issue Category / Type', 'Issue', 'Description', 'Resolution Status', 'Resolved', 'Action Taken', 'Counts as Action', 'Pending Details',
        'Service Functionality', 'Service Affected', 'Patient']),
      ...(issueRows.length ? issueRows : empty('No administrative or operations issues for the selected reports.')),
    ],
  }

  // Sheet 7: patient experience.
  const experienceReports = reports.filter((report) => data.experiences[report.id])
  const experienceSheet: Sheet = {
    name: 'Patient Experience',
    freezeRows: 1,
    widths: [12, 10, 10, 18, 26, 22, 14, 44, 14, 44, 18, 44],
    rows: [
      header([...reportLabels, 'Escalated Complaints', 'New / Ongoing Complaints Summary', 'Escalated OVRs', 'New OVRs Summary', 'Governmental / Regulatory Visit', 'Authority Name / Findings Summary']),
      ...(experienceReports.length ? experienceReports.map((report): Cell[] => {
        const experience = data.experiences[report.id]
        return [...reportCells(report), number(experience.dma_escalatedcomplaints), experience.dma_summaryofnewongoingcomplaints || '', number(experience.dma_escalatedovrs),
          experience.dma_summaryofnewovrs || '', text(experience, 'dma_governmentalregulatoryvisits'), experience.dma_authoritynamefindingssummary || '']
      }) : empty('No patient experience records for the selected reports.')),
    ],
  }

  return [summary, kpiSheet, reportSheet, flowSheet, eventSheet, issueSheet, experienceSheet]
}
