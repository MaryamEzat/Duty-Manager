import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  adminFallbackOptions, businessUnits, labelFor, resolutionOptions, serviceAffectedOptions, serviceFunctionalityOptions,
  opsIssueOptions, Services, severityOptions, shiftFromValue, shiftMap, shortageOptions, staffOptions,
  type AdminIssue, type DamaEntry, type DraftRecord, type EarlyDischarge, type EventItem, type FormState, type MainView, type OpsIssue, type PatientArea, type Resolution, type Severity, type Shift, type TabKey,
} from './data'
import { cleanId, compact, displayName, fallbackAlerts, formatDate, getDrafts, initialForm, list, reportCode, shortDate, shortTime, toLocalInput, unwrap, validate } from './utils'

type AlertRow = { id: string; title: string; description: string; severity: string; isRead: boolean; createdOn?: string; reportId?: string }

type ReportBundle = { report: any; flow: any[]; flowEntries: any[]; events: any[]; admin: any[]; ops: any[]; experience: any[]; loading?: boolean }
const governmentVisitOptions: [string, string][] = [['999740000', 'Yes'], ['999740001', 'No']]

export function DutyManager() {
  const [view, setView] = useState<MainView>('home')
  const [tab, setTab] = useState<TabKey>('general')
  const [form, setForm] = useState<FormState>(initialForm)
  const [draftId, setDraftId] = useState('')
  const [reportId, setReportId] = useState('')
  const [flowSummaryId, setFlowSummaryId] = useState('')
  const [experienceId, setExperienceId] = useState('')
  const [events, setEvents] = useState<EventItem[]>([])
  const [adminIssues, setAdminIssues] = useState<AdminIssue[]>([])
  const [opsIssues, setOpsIssues] = useState<OpsIssue[]>([])
  const [damaEntries, setDamaEntries] = useState<DamaEntry[]>([])
  const [earlyDischarges, setEarlyDischarges] = useState<EarlyDischarge[]>([])
  const [drafts, setDrafts] = useState<DraftRecord[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [reportFilter, setReportFilter] = useState('all')
  const [reportPage, setReportPage] = useState(1)
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [eventTypes, setEventTypes] = useState<any[]>([])
  const [eventCodes, setEventCodes] = useState<any[]>([])
  const [adminCatalog, setAdminCatalog] = useState<[string, string][]>([])
  const [userMatches, setUserMatches] = useState<any[]>([])
  const [selectedReport, setSelectedReport] = useState<ReportBundle | null>(null)
  const [dashboard, setDashboard] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const discharges = form.discharges
  const filteredReports = useMemo(() => reportFilter === 'all' ? reports : reports.filter((r) => String(r.dma_businessunit) === reportFilter), [reports, reportFilter])
  const pagedReports = useMemo(() => filteredReports.slice((reportPage - 1) * 5, reportPage * 5), [filteredReports, reportPage])
  const totalReportPages = Math.max(1, Math.ceil(filteredReports.length / 5))
  const pendingItems = useMemo(() => [...adminIssues.filter((x) => x.status !== '778000001'), ...opsIssues.filter((x) => x.statusId !== '778000001')], [adminIssues, opsIssues])
  const completion = useMemo(() => validate(form, events, adminIssues, opsIssues, damaEntries, earlyDischarges), [form, events, adminIssues, opsIssues, damaEntries, earlyDischarges])

  useEffect(() => {
    loadStartup()
  }, [])

  useEffect(() => {
    if (view === 'home') loadHomeReports()
  }, [reportFilter])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 4000)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    if (view === 'report' && !busy) saveDraft(false)
  }, [form, events, adminIssues, opsIssues, damaEntries, earlyDischarges, view])

  useEffect(() => {
    if (view !== 'report' || busy || !reportId) return
    const timer = window.setTimeout(async () => {
      try {
        await persistGeneral(form, reportId)
        const id = await persistFlow(form, adminIssues, reportId, flowSummaryId)
        if (id !== flowSummaryId) setFlowSummaryId(id)
      } catch (error) {
        setMessage(`Draft database save failed: ${errorMessage(error)}`)
      }
    }, 800)
    return () => window.clearTimeout(timer)
  }, [form, adminIssues, view, busy, reportId, flowSummaryId])

  useEffect(() => {
    const saveBeforeLeave = () => { if (view === 'report') saveDraft(false) }
    window.addEventListener('beforeunload', saveBeforeLeave)
    return () => window.removeEventListener('beforeunload', saveBeforeLeave)
  }, [view, form, events, adminIssues, opsIssues, damaEntries, earlyDischarges, draftId, reportId, flowSummaryId])

  async function loadStartup() {
    setDrafts(getDrafts())
    await Promise.all([loadCurrentUser(), loadReferences(), loadHomeReports(), loadAlerts()])
  }

  async function loadCurrentUser() {
    const hostUser = await getLoggedInUser()

    try {
      const resolved = await resolveSystemUser(hostUser)
      if (resolved) {
        setForm((prev) => ({ ...prev, dmName: resolved.fullname || hostUser.name || 'Current User', dmUserId: resolved.systemuserid || hostUser.id || '' }))
        return
      }
    } catch (error) {
      console.warn('Could not resolve logged-in systemuser', error)
    }

    if (hostUser.name && !isAppPrincipalName(hostUser.name)) {
      setForm((prev) => ({ ...prev, dmName: hostUser.name, dmUserId: hostUser.id || '' }))
      return
    }

    setForm((prev) => ({ ...prev, dmName: 'Current User', dmUserId: hostUser.id || '' }))
  }

  async function loadReferences() {
    try {
      const [types, admin] = await Promise.all([
        Services.eventTypes.getAll({ select: ['dma_eventtypeid', 'dma_name'], orderBy: ['dma_name asc'] }),
        Services.adminIssues.getAll({ select: ['dma_administrativeissueid', 'dma_name'], orderBy: ['dma_name asc'] }),
      ])
      setEventTypes(list(types))
      const adminRows = list(admin)
      setAdminCatalog(adminRows.length ? adminRows.map((x) => [x.dma_administrativeissueid, x.dma_name]) : adminFallbackOptions)
    } catch {
      setEventTypes([])
      setAdminCatalog(adminFallbackOptions)
    }
  }

  async function loadHomeReports() {
    setDrafts(getDrafts())
    const filter = reportFilter !== 'all' ? `dma_businessunit eq ${reportFilter}` : undefined

    try {
      const webRows = await retrieveHandoverReportsViaXrm(reportFilter).catch((error) => {
        console.warn('Xrm handover report lookup failed', error)
        return []
      })
      if (webRows.length) {
        setReports(webRows)
        setReportPage(1)
        return
      }

      const result = await Services.reports.getAll({
        select: ['dma_handoverreportid', 'dma_name', 'dma_reportdate', 'dma_businessunit', 'dma_shifttype', 'dma_dmacknowledgmenttimestamp', 'createdon', '_dma_dutymanager_value'],
        filter,
        orderBy: ['createdon desc'],
        top: 100,
      } as any)
      const rows = list(result)
      if (!rows.length) {
        const broadResult = await Services.reports.getAll({ filter, orderBy: ['createdon desc'], top: 100 } as any)
        setReports(list(broadResult))
      } else {
        setReports(rows)
      }
      setReportPage(1)
    } catch (error) {
      console.error('Error fetching recent reports', error)
      setReports([])
      setMessage('Could not fetch recent reports from Dataverse.')
    }
  }
  async function loadAlerts() {
    try {
      const result = await Services.alerts.getAll({ orderBy: ['createdon desc'], top: 50 })
      const readIds = JSON.parse(localStorage.getItem('dma_read_alerts') || '[]') as string[]
      setAlerts(list(result).map((a) => ({
        id: a.dma_alertid,
        title: a.dma_name,
        description: a.dma_alertdescription || '',
        severity: a.dma_severity === 778000002 ? 'critical' : a.dma_severity === 778000001 ? 'warning' : 'info',
        isRead: Boolean(a.dma_isread) || readIds.includes(a.dma_alertid),
        createdOn: a.createdon,
        reportId: a._dma_handoverreport_value,
      })))
    } catch {
      setAlerts(fallbackAlerts())
    }
  }

  function updateForm(patch: Partial<FormState>) {
    setForm((prev) => {
      const next = { ...prev, ...patch }
      next.admissions = next.erAdmissions + next.opdAdmissions
      return next
    })
  }

  async function startShift() {
    if (busy) return
    const baseForm = initialForm()
    const businessUnit = form.businessUnit || baseForm.businessUnit
    const latestBuReport = latestReportForBusinessUnit(reports, businessUnit)
    const nextShift = latestBuReport ? nextShiftAfter(shiftFromValue(latestBuReport.dma_shifttype)) : baseForm.shift
    const nextReportDate = latestBuReport ? nextReportDateFromPrevious(latestBuReport.dma_reportdate, nextShift) : baseForm.reportDate
    const nextForm = { ...baseForm, dmName: form.dmName, dmUserId: form.dmUserId, businessUnit, shift: nextShift, reportDate: nextReportDate }
    const nextDraftId = String(Date.now())
    setBusy(true)
    try {
      const nextReportId = await persistGeneral(nextForm, '')
      let nextFlowId = ''
      let flowError = ''
      try {
        nextFlowId = await persistFlow(nextForm, [], nextReportId, '')
      } catch (error) {
        flowError = errorMessage(error)
      }
      setForm(nextForm)
      setEvents([])
      setAdminIssues([])
      setOpsIssues([])
      setDamaEntries([])
      setEarlyDischarges([])
      setReportId(nextReportId)
      setFlowSummaryId(nextFlowId)
      setExperienceId('')
      setDraftId(nextDraftId)
      writeDraft({ form: nextForm, draftId: nextDraftId, reportId: nextReportId, flowSummaryId: nextFlowId, experienceId: '', events: [], adminIssues: [], opsIssues: [], damaEntries: [], earlyDischarges: [] }, true)
      setView('report')
      setTab('general')
      setMessage(flowError ? `Shift report created, but patient flow initialization failed: ${flowError}` : 'Shift report initiated successfully.')
    } catch (error) {
      setMessage(`Could not initiate shift report: ${errorMessage(error)}`)
    } finally {
      setBusy(false)
    }
  }

  function latestReportForBusinessUnit(rows: any[], businessUnit: string) {
    return rows
      .filter((row) => String(row.dma_businessunit) === String(businessUnit))
      .sort((a, b) => new Date(b.dma_reportdate || b.createdon || 0).getTime() - new Date(a.dma_reportdate || a.createdon || 0).getTime())[0]
  }

  function nextShiftAfter(shift: Shift): Shift {
    if (shift === 'Morning') return 'Evening'
    if (shift === 'Evening') return 'Night'
    return 'Morning'
  }

  function nextReportDateFromPrevious(previousDate: string, nextShift: Shift) {
    const date = previousDate ? new Date(previousDate) : new Date()
    if (Number.isNaN(date.getTime())) return initialForm().reportDate
    if (nextShift === 'Morning') date.setDate(date.getDate() + 1)
    if (nextShift === 'Morning') date.setHours(7, 0, 0, 0)
    if (nextShift === 'Evening') date.setHours(15, 0, 0, 0)
    if (nextShift === 'Night') date.setHours(23, 0, 0, 0)
    return toLocalInput(date)
  }

  function writeDraft(snapshot: { form: FormState; draftId: string; reportId: string; flowSummaryId: string; experienceId?: string; events: EventItem[]; adminIssues: AdminIssue[]; opsIssues: OpsIssue[]; damaEntries: DamaEntry[]; earlyDischarges: EarlyDischarge[] }, refresh = true) {
    const draft: DraftRecord = { ...snapshot.form, draftId: snapshot.draftId, reportId: snapshot.reportId, flowSummaryId: snapshot.flowSummaryId, experienceId: snapshot.experienceId, events: snapshot.events, adminIssues: snapshot.adminIssues, opsIssues: snapshot.opsIssues, damaEntries: snapshot.damaEntries, earlyDischarges: snapshot.earlyDischarges, timestamp: new Date().toLocaleString() }
    localStorage.setItem(`dm_handover_draft_${snapshot.draftId}`, JSON.stringify(draft))
    if (refresh) setDrafts(getDrafts())
  }

  function saveDraft(refresh = true) {
    if (view !== 'report') return
    const id = draftId || String(Date.now())
    if (!draftId) setDraftId(id)
    writeDraft({ form, draftId: id, reportId, flowSummaryId, experienceId, events, adminIssues, opsIssues, damaEntries, earlyDischarges }, refresh)
  }

  function leaveReport(nextView: MainView) {
    if (view === 'report') saveDraft(true)
    setView(nextView)
    if (nextView === 'home') loadHomeReports()
  }
  function openDraft(draft: DraftRecord) {
    setForm({ ...initialForm(), ...draft })
    setDraftId(draft.draftId)
    setReportId(draft.reportId || '')
    setFlowSummaryId(draft.flowSummaryId || '')
    setExperienceId(draft.experienceId || '')
    setEvents(draft.events || [])
    setAdminIssues(draft.adminIssues || [])
    setOpsIssues(draft.opsIssues || [])
    setDamaEntries(draft.damaEntries || [])
    setEarlyDischarges(draft.earlyDischarges || [])
    setView('report')
    setTab('general')
  }

  async function searchUsers(value: string) {
    updateForm({ dmName: value })
    if (value.trim().length < 2) return setUserMatches([])
    try {
      const result = await Services.users.getAll({ select: ['fullname', 'systemuserid'], filter: `contains(fullname,'${value.replace(/'/g, "''")}')`, top: 10 })
      setUserMatches(list(result))
    } catch {
      setUserMatches([])
    }
  }

  async function loadEventCodes(typeId: string) {
    if (!typeId) return setEventCodes([])
    try {
      const result = await Services.eventCodes.getAll({ select: ['dma_eventcodeid', 'dma_name'], filter: `_dma_eventtype_value eq ${cleanId(typeId)}`, orderBy: ['dma_name asc'] })
      setEventCodes(list(result))
    } catch {
      setEventCodes([])
    }
  }

  function showDashboard() {
    if (view === 'report') saveDraft(true)
    const activeShift = form.shift
    const submittedCount = reports.length
    const bus = businessUnits.map(([value, label]) => {
      const report = reports.find((r) => String(r.dma_businessunit) === String(value) && shiftFromValue(r.dma_shifttype) === activeShift)
      const acknowledged = Boolean(report?.dma_dmacknowledgmenttimestamp)
      return {
        value,
        label,
        report,
        status: report ? (acknowledged ? 'acknowledged' : 'submitted') : 'unsubmitted',
        dm: report ? displayName(report) : '-',
        statusLabel: report ? (acknowledged ? 'Acknowledged' : 'Submitted') : 'Pending',
        sla: report ? 'Submitted On Time' : 'Pending',
        escalation: report ? 'Not required' : 'Submission overdue',
      }
    })
    const totalDama = form.erDama + form.inpDama + form.closedDama
    const retained = form.erDamaRetention + form.inpDamaRetention + form.closedDamaRetention
    const maxUtil = Math.max(form.inpUtilization, form.icuUtilization, form.ccuUtilization, form.picuUtilization, form.nicuUtilization, form.cxUtilization, form.strokeUtilization)
    const majorIncidents = events.filter((x) => x.severity === '778000002').length
    const acknowledgedCount = bus.filter((x) => x.status === 'acknowledged').length
    const pendingCount = bus.filter((x) => x.status === 'unsubmitted').length
    setDashboard({
      updated: new Date().toLocaleTimeString('en-GB'),
      date: form.reportDate,
      shift: activeShift,
      bus,
      reports,
      metrics: [
        { key: 'major-incidents', label: 'Major incidents', value: majorIncidents, desc: majorIncidents ? 'Major event escalation active' : 'No major incidents', alert: majorIncidents > 0 },
        { key: 'submitted', label: 'Reports submitted', value: `${bus.filter((x) => x.report).length}/${bus.length}`, desc: pendingCount ? `${pendingCount} BUs pending` : 'All BUs submitted', alert: pendingCount > 0 },
        { key: 'acknowledged', label: 'Reports acknowledged', value: `${acknowledgedCount}/${bus.length}`, desc: acknowledgedCount === bus.length ? 'All reports acknowledged' : `${bus.length - acknowledgedCount} pending ack`, warn: acknowledgedCount < bus.length },
        { key: 'active-issues', label: 'Active pending issues', value: pendingItems.length, desc: 'Active monitoring', alert: pendingItems.length > 0 },
        { key: 'total-dama', label: 'Total DAMA (all BUs)', value: totalDama, desc: `Retention: ${totalDama ? Math.round((retained / totalDama) * 100) : 100}%`, warn: totalDama > retained },
        { key: 'peak-utilization', label: 'Peak INP utilization', value: `${maxUtil}%`, desc: maxUtil > 90 ? 'Bed pressure' : 'Stable utilization', alert: maxUtil > 90 },
      ],
      aging: pendingItems.map((item: any, index) => ({
        id: item.id || `age-${index}`,
        issue: item.catLabel || item.desc || labelFor(serviceAffectedOptions, item.affectedId) || 'Pending issue',
        bu: labelFor(businessUnits, form.businessUnit),
        category: item.catLabel ? 'Administrative' : 'Operations',
        owner: form.dmName || 'Duty Manager',
        age: 'Current shift',
      })),
      submittedCount,
    })
    setView('dashboard')
  }
  async function saveGeneral() {
    setBusy(true)
    try {
      const nextId = await persistGeneral(form, reportId)
      setReportId(nextId)
      const nextFlowId = await persistFlow(form, adminIssues, nextId, flowSummaryId)
      setFlowSummaryId(nextFlowId)
      const id = draftId || String(Date.now())
      if (!draftId) setDraftId(id)
      writeDraft({ form, draftId: id, reportId: nextId, flowSummaryId: nextFlowId, experienceId, events, adminIssues, opsIssues, damaEntries, earlyDischarges }, true)
      setMessage('General information saved.')
      return nextId
    } catch (error) {
      setMessage(`Database save failed: ${errorMessage(error)}`)
      return ''
    } finally {
      setBusy(false)
    }
  }

  async function saveFlow(currentReportId = reportId) {
    const id = await persistFlow(form, adminIssues, currentReportId, flowSummaryId)
    setFlowSummaryId(id)
    return id
  }

  async function submitReport() {
    if (!completion.ok) {
      setMessage(`Please complete: ${completion.missing.join(', ')}`)
      return
    }
    setBusy(true)
    try {
      const id = await persistGeneral(form, reportId)
      setReportId(id)
      const flowId = await persistFlow(form, adminIssues, id, flowSummaryId)
      setFlowSummaryId(flowId)
      let nextExperienceId = experienceId
      const nextEvents = events.map((row) => ({ ...row }))
      const nextAdmin = adminIssues.map((row) => ({ ...row }))
      const nextOps = opsIssues.map((row) => ({ ...row }))
      const nextDama = damaEntries.map((row) => ({ ...row }))
      const checkpoint = () => {
        setExperienceId(nextExperienceId)
        setEvents([...nextEvents])
        setAdminIssues([...nextAdmin])
        setOpsIssues([...nextOps])
        setDamaEntries([...nextDama])
        if (draftId) writeDraft({ form, draftId, reportId: id, flowSummaryId: flowId, experienceId: nextExperienceId, events: nextEvents, adminIssues: nextAdmin, opsIssues: nextOps, damaEntries: nextDama, earlyDischarges }, false)
      }

      const experiencePayload: any = compact({ dma_name: `${reportCode(form)} Experience`, dma_escalatedcomplaints: form.complaintsCount, dma_summaryofnewongoingcomplaints: form.complaintsSummary, dma_escalatedovrs: form.ovrsCount, dma_summaryofnewovrs: form.ovrsSummary, dma_governmentalregulatoryvisits: form.govVisit === 'Yes' ? 999740000 : 999740001, dma_authoritynamefindingssummary: form.govSummary, 'dma_ReportID@odata.bind': `/dma_handoverreports(${cleanId(id)})` })
      if (nextExperienceId) await Services.experience.update(cleanId(nextExperienceId), experiencePayload)
      else {
        nextExperienceId = resultId(await Services.experience.create(experiencePayload), 'dma_patientexperienceid')
        checkpoint()
      }

      for (const event of nextEvents) {
        const payload = compact(applyPatientBind({ dma_name: `${event.typeText} - ${event.codeText}`, dma_severitylevel: Number(event.severity), dma_incidentdescription: event.desc, dma_immediateactionstaken: event.actions, dma_eventlogtimestamp: new Date().toISOString(), 'dma_ReportID@odata.bind': `/dma_handoverreports(${cleanId(id)})`, 'dma_EventType@odata.bind': event.typeId ? `/dma_eventtypes(${cleanId(event.typeId)})` : undefined, 'dma_EventCode@odata.bind': event.codeId ? `/dma_eventcodes(${cleanId(event.codeId)})` : undefined }, event.area, event.pId)) as any
        if (event.dataverseId) await Services.events.update(cleanId(event.dataverseId), payload)
        else {
          event.dataverseId = resultId(await Services.events.create(payload), 'dma_hospitaleventid')
          checkpoint()
        }
      }
      for (const issue of nextAdmin) {
        const payload: any = compact({ dma_name: issue.catLabel, dma_description: issue.desc, dma_actiontaken: issue.action, dma_pendingissues: issue.pendingDetails, dma_count: 1, dma_resolutionstatus: Number(issue.status), 'dma_IssueID@odata.bind': issue.catId ? `/dma_administrativeissues(${cleanId(issue.catId)})` : undefined, 'dma_ReportID@odata.bind': `/dma_handoverreports(${cleanId(id)})` })
        if (issue.dataverseId) await Services.adminEntries.update(cleanId(issue.dataverseId), payload)
        else {
          issue.dataverseId = resultId(await Services.adminEntries.create(payload), 'dma_administrativeissueentryid')
          checkpoint()
        }
      }
      for (const issue of nextOps) {
        const payload: any = compact({ dma_name: `${labelFor(serviceAffectedOptions, issue.affectedId)} - ${labelFor(opsIssueOptions, issue.issueId)}`, dma_servicefunctionality: Number(issue.funcId), dma_serviceaffected: Number(issue.affectedId), dma_typeofissue: Number(issue.issueId), dma_descriptionofissue: issue.desc, dma_resolutionstatus: Number(issue.statusId), dma_pendingissues: issue.pendingDetails, 'dma_ReportID@odata.bind': `/dma_handoverreports(${cleanId(id)})` })
        if (issue.dataverseId) await Services.ops.update(cleanId(issue.dataverseId), payload)
        else {
          issue.dataverseId = resultId(await Services.ops.create(payload), 'dma_opeartionid')
          checkpoint()
        }
      }
      for (const entry of nextDama) {
        const payload = compact(applyPatientBind({ dma_name: entry.patientName || 'DAMA Patient', dma_erdama: entry.damaType === 'ER' ? 1 : 0, dma_inpdama: entry.damaType === 'INP' ? 1 : 0, dma_reason: entry.reason, dma_actiontaken: entry.actionTaken, 'dma_PatientFlow@odata.bind': `/dma_patientflowsummaries(${cleanId(flowId)})` }, entry.area || (entry.damaType === 'ER' ? 'ER' : 'IPD'), entry.pId)) as any
        if (entry.dataverseId) await Services.flowEntries.update(cleanId(entry.dataverseId), payload)
        else {
          entry.dataverseId = resultId(await Services.flowEntries.create(payload), 'dma_patientflowentryid')
          checkpoint()
        }
      }
      await Services.reports.update(cleanId(id), { dma_reportstatus: 778000002, statecode: 1, statuscode: 2 } as any)
      if (draftId) {
        localStorage.removeItem(`dm_handover_draft_${draftId}`)
        setDrafts(getDrafts())
      }
      setView('submitted')
      setMessage('Shift report submitted successfully.')
      await loadHomeReports()
    } catch (error) {
      setMessage(`Submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  async function openReport(id: string) {
    const clean = cleanId(id)
    const local = reports.find((x) => cleanId(x.dma_handoverreportid) === clean)
    setSelectedReport({ report: local || { dma_handoverreportid: clean, dma_name: 'Shift Report' }, flow: [], flowEntries: [], events: [], admin: [], ops: [], experience: [], loading: true })
    try {
      const xrmBundle = await retrieveReportBundleViaXrm(clean).catch((error) => {
        console.warn('Xrm report bundle lookup failed', error)
        return null
      })
      if (xrmBundle?.report) {
        setSelectedReport(xrmBundle)
        return
      }

      const [report, flow, eventRows, admin, ops, experience] = await Promise.all([
        Services.reports.get(clean), Services.flow.getAll({ filter: `_dma_reportid_value eq ${clean}` }), Services.events.getAll({ filter: `_dma_reportid_value eq ${clean}` }),
        Services.adminEntries.getAll({ filter: `_dma_reportid_value eq ${clean}` }), Services.ops.getAll({ filter: `_dma_reportid_value eq ${clean}` }), Services.experience.getAll({ filter: `_dma_reportid_value eq ${clean}` }),
      ])
      const flowRows = list(flow)
      const flowId = cleanId(flowRows[0]?.dma_patientflowsummaryid || flowRows[0]?.id || '')
      const flowEntries = flowId ? list(await Services.flowEntries.getAll({ filter: `_dma_patientflow_value eq ${flowId}` } as any).catch(() => [])) : []
      setSelectedReport({ report: unwrap(report), flow: flowRows, flowEntries, events: list(eventRows), admin: list(admin), ops: list(ops), experience: list(experience) })
    } catch {
      setSelectedReport({ report: local || { dma_handoverreportid: clean, dma_name: 'Shift Report' }, flow: [], flowEntries: [], events: [], admin: [], ops: [], experience: [] })
    }
  }

  async function acknowledgeReport() {
    const id = selectedReport?.report?.dma_handoverreportid
    if (!id) return
    try {
      const api = getXrmWebApi()
      const payload = { dma_dmacknowledgmenttimestamp: new Date().toISOString(), statecode: 1, statuscode: 2 } as any
      if (api) {
        await api.updateRecord('dma_handoverreport', cleanId(id), payload)
      } else {
        await Services.reports.update(cleanId(id), payload)
      }
      setSelectedReport(null)
      setMessage('Report acknowledged.')
      await loadHomeReports()
    } catch {
      setMessage('Could not acknowledge the report.')
    }
  }

  function markAlertRead(id: string) {
    const stored = JSON.parse(localStorage.getItem('dma_read_alerts') || '[]') as string[]
    localStorage.setItem('dma_read_alerts', JSON.stringify(Array.from(new Set([...stored, id]))))
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, isRead: true } : a))
    Services.alerts.update(cleanId(id), { dma_isread: true } as any).catch(() => undefined)
  }

  const openModule = (nextTab: TabKey) => {
    if (view !== 'report') {
      setMessage('Start or continue a handover before opening report sections.')
      return
    }
    setTab(nextTab)
    setView('report')
  }
  const completionPercent = completion.ok ? 100 : Math.max(0, Math.round(((8 - completion.missing.length) / 8) * 100))
  const isWorkflow = view === 'report' || view === 'submitted'
  const showReportNav = view === 'report'
  const homeDraft = view === 'home' ? drafts[0] : null
  const headerContext = homeDraft || form
  const headerCompletion = homeDraft ? draftCompletionPercent(homeDraft) : completionPercent

  return <div className="dm-app">
    <nav className={`app-rail ${showReportNav ? 'report-open' : 'entry-only'}`} aria-label="Duty Manager primary navigation">
      <div className="dm-mark">DM</div>
      <button className={view === 'home' ? 'active' : ''} onClick={() => leaveReport('home')} aria-label="Home / Shift Command" title="Home / Shift Command"><NavIcon name="home" /><span>Home</span></button>
      <button className={view === 'dashboard' ? 'active' : ''} onClick={showDashboard} aria-label="Command Center" title="Command Center"><NavIcon name="dashboard" /><span>Dashboard</span></button>
      <button className={view === 'report' && tab === 'general' ? 'active' : ''} onClick={() => openModule('general')} aria-label="General / Shift Identity" title="General / Shift Identity"><NavIcon name="identity" /><span>General</span></button>
      <button className={view === 'report' && tab === 'events' ? 'active' : ''} onClick={() => openModule('events')} aria-label="Hospital Events" title="Hospital Events"><NavIcon name="events" /><span>Events</span></button>
      <button className={view === 'report' && tab === 'admin' ? 'active' : ''} onClick={() => openModule('admin')} aria-label="Administrative Issues" title="Administrative Issues"><NavIcon name="admin" /><span>Admin</span></button>
      <button className={view === 'report' && tab === 'flow' ? 'active' : ''} onClick={() => openModule('flow')} aria-label="Patient Flow" title="Patient Flow"><NavIcon name="flow" /><span>Patient flow</span></button>
      <button className={view === 'report' && tab === 'ops' ? 'active' : ''} onClick={() => openModule('ops')} aria-label="Operations" title="Operations"><NavIcon name="operations" /><span>Operations</span></button>
      <button className={view === 'report' && tab === 'experience' ? 'active' : ''} onClick={() => openModule('experience')} aria-label="Experience" title="Experience"><NavIcon name="experience" /><span>Experience</span></button>
      <button className={view === 'report' && tab === 'summary' ? 'active' : ''} onClick={() => openModule('summary')} aria-label="Summary / Handover Review" title="Summary / Handover Review"><NavIcon name="summary" /><span>Summary</span></button>
    </nav>
    <header className={`top ${isWorkflow ? 'workflow-top' : ''}`}>
      <button className="brand" onClick={() => leaveReport('home')}><span>DM</span><strong>Duty Manager</strong><small>Operations Handover</small></button>
      <div className="top-context">
        <span><small>Business unit</small><b>{labelFor(businessUnits, headerContext.businessUnit)}</b></span>
        <span><small>{homeDraft ? 'Active draft' : 'Shift + date'}</small><b>{headerContext.shift} - {shortDate(headerContext.reportDate)}</b></span>
        <span><small>Duty manager</small><b>{headerContext.dmName || form.dmName || 'Loading User...'}</b></span>
        {!isWorkflow && <span><small>{homeDraft ? 'Draft completion' : 'Completion'}</small><b>{headerCompletion}%</b></span>}
      </div>
      {!isWorkflow && <button className="attention-chip" onClick={() => drafts[0] ? openDraft(drafts[0]) : setMessage('Start or continue a handover to review attention items.')}>{pendingItems.length || alerts.filter((a) => !a.isRead).length} items need attention</button>}
      {!isWorkflow && <button className="alert-button" onClick={() => setAlertsOpen(true)}>Alerts <b>{alerts.filter((a) => !a.isRead).length}</b></button>}
    </header>
    {message && <div className="toast" onClick={() => setMessage('')}>{message}</div>}
    {view === 'home' && <Home form={form} completion={completion} completionPercent={completionPercent} pendingItems={pendingItems} drafts={drafts} reports={pagedReports} reportFilter={reportFilter} setReportFilter={(value: string) => { setReportFilter(value); setReportPage(1) }} reportPage={reportPage} totalReportPages={totalReportPages} nextPage={() => setReportPage((p) => Math.min(totalReportPages, p + 1))} prevPage={() => setReportPage((p) => Math.max(1, p - 1))} startShift={startShift} openDraft={openDraft} deleteDraft={(id: string) => { localStorage.removeItem(`dm_handover_draft_${id}`); setDrafts(getDrafts()) }} openReport={openReport} openModule={openModule} />}
    {view === 'dashboard' && <Dashboard data={dashboard} refresh={showDashboard} />}
    {view === 'report' && <Editor state={{ form, updateForm, tab, setTab, busy, reportId, saveGeneral, submitReport, completion, discharges, events, setEvents, adminIssues, setAdminIssues, opsIssues, setOpsIssues, damaEntries, setDamaEntries, earlyDischarges, setEarlyDischarges, searchUsers, userMatches, setUserMatches, eventTypes, eventCodes, loadEventCodes, adminCatalog, pendingItems, openReport }} />}
    {view === 'submitted' && <Submitted form={form} events={events} opsIssues={opsIssues} pendingItems={pendingItems} openReport={() => reportId && openReport(reportId)} goHome={() => setView('home')} />}
    {alertsOpen && <AlertDrawer alerts={alerts} markAlertRead={markAlertRead} openReport={(id: string) => { openReport(id); setAlertsOpen(false) }} close={() => setAlertsOpen(false)} />}
    {selectedReport && <ReportModal bundle={selectedReport} close={() => setSelectedReport(null)} acknowledge={acknowledgeReport} />}
  </div>
}

type NavIconName = 'home' | 'dashboard' | 'identity' | 'events' | 'admin' | 'flow' | 'operations' | 'experience' | 'summary'

function NavIcon({ name }: { name: NavIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const icons: Record<NavIconName, ReactNode> = {
    home: <><path {...common} d="M3 11.5 12 4l9 7.5" /><path {...common} d="M5.5 10.5V20h13v-9.5" /><path {...common} d="M9.5 20v-6h5v6" /></>,
    dashboard: <><path {...common} d="M4 19V5" /><path {...common} d="M4 19h16" /><path {...common} d="m7 15 3.5-4 3 2 4.5-6" /></>,
    identity: <><rect {...common} x="4" y="5" width="16" height="14" rx="2" /><path {...common} d="M8 10h5" /><path {...common} d="M8 14h8" /><path {...common} d="M16 9h1" /></>,
    events: <><path {...common} d="M12 4 3.5 19h17L12 4Z" /><path {...common} d="M12 9v4" /><path {...common} d="M12 16h.01" /></>,
    admin: <><path {...common} d="M8 6h13" /><path {...common} d="M8 12h13" /><path {...common} d="M8 18h13" /><path {...common} d="m3 6 1 1 2-2" /><path {...common} d="m3 12 1 1 2-2" /><path {...common} d="m3 18 1 1 2-2" /></>,
    flow: <><path {...common} d="M4 15h4l2-6 4 10 2-6h4" /><path {...common} d="M5 7h4" /><path {...common} d="M15 7h4" /></>,
    operations: <><path {...common} d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6" /><path {...common} d="M7 12V8a5 5 0 0 1 10 0v4" /><path {...common} d="M3 12h18" /></>,
    experience: <><path {...common} d="M16 11a4 4 0 1 0-8 0" /><path {...common} d="M5 20a7 7 0 0 1 14 0" /><path {...common} d="M18 8a3 3 0 0 1 2 5" /><path {...common} d="M4 13a3 3 0 0 1 2-5" /></>,
    summary: <><rect {...common} x="5" y="4" width="14" height="17" rx="2" /><path {...common} d="m8.5 13 2.3 2.3 4.7-5" /><path {...common} d="M9 8h6" /></>,
  }
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{icons[name]}</svg>
}

function Home({ form, completion, completionPercent, pendingItems, drafts, reports, reportFilter, setReportFilter, reportPage, totalReportPages, nextPage, prevPage, startShift, openDraft, deleteDraft, openReport, openModule }: any) {
  const activeDraft = drafts[0]
  const currentManager = activeDraft?.dmName || form.dmName || 'Duty Manager'
  const greeting = timeGreeting()
  const activeDraftCompletion = activeDraft ? draftCompletionPercent(activeDraft) : completionPercent
  const activeDraftLabel = activeDraft ? `${labelFor(businessUnits, activeDraft.businessUnit)} - ${activeDraft.shift || 'Morning'} - ${formatDate(activeDraft.reportDate)}` : ''
  const attentionCount = activeDraft ? draftMissingCount(activeDraft) : completion.missing.length
  const readyItems = [
    ['Shift identity', form.dmName && form.businessUnit && form.reportDate ? 'Complete' : 'Attention', form.dmName && form.businessUnit && form.reportDate ? 'ok' : 'warn'],
    ['Hospital events', 'Clear', 'ok'],
    ['Administrative issues', pendingItems.some((x: any) => 'catLabel' in x) ? 'Attention' : 'Clear', pendingItems.some((x: any) => 'catLabel' in x) ? 'attention' : 'ok'],
    ['Patient flow', completion.missing?.some((x: string) => x.toLowerCase().includes('flow')) ? 'Action required' : 'Complete', completion.missing?.some((x: string) => x.toLowerCase().includes('flow')) ? 'attention' : 'ok'],
  ]
  return <main className="home-modern">
    <section className="home-hero">
      <div>
        <div className="eyebrow">Shift Command</div>
        <h1>{greeting}, {currentManager}.</h1>
        <p>{activeDraft ? `Active draft: ${activeDraftLabel}. ${attentionCount} items need attention before responsibility can transfer.` : 'No handover draft is currently in progress. Start a shift to begin a new Duty Manager handover.'}</p>
      </div>
      <button className="btn hero-action" onClick={() => activeDraft ? openDraft(activeDraft) : startShift()}>{activeDraft ? 'Continue this draft' : 'Start handover'}</button>
    </section>

    <div className="home-section-head">
      <div>
        <h2>Current shift</h2>
        <p>Priority exceptions and named ownership for this handover.</p>
      </div>
      <button className="btn primary" onClick={startShift}>Start Shift</button>
    </div>

    <section className="home-current-grid">
      <div className="current-register">
        {activeDraft ? <article className="current-row lead">
          <div>
            <h3>{activeDraftLabel}</h3>
            <p>{activeDraft.dmName || currentManager} - draft saved {formatDate(activeDraft.timestamp)} - draft completion {activeDraftCompletion}%</p>
            <p>{attentionCount} draft readiness items require ownership before handover.</p>
          </div>
          <button className="btn" onClick={() => openModule('summary')}>Review handover</button>
        </article> : <article className="current-row lead">
          <div>
            <h3>No current draft selected</h3>
            <p>Start a shift to create a real handover record with the existing Duty Manager data contract.</p>
          </div>
          <button className="btn" onClick={startShift}>Start handover</button>
        </article>}

        {(pendingItems.length ? pendingItems.slice(0, 2) : completion.missing.slice(0, 2).map((label: string) => ({ label }))).map((item: any, index: number) => (
          <article className="current-row" key={item.id || item.label || index}>
            <div>
              <h3>{item.catLabel || item.desc || item.label || 'Review required'}</h3>
              <p>{item.catLabel ? 'Administrative issues' : item.affectedId ? 'Operations' : 'Handover readiness'} - owner: {currentManager}</p>
            </div>
            <span className={`status-token ${index === 0 ? 'warning' : 'critical'}`}>{index === 0 ? 'Action required' : 'Escalated'}</span>
            <div className="current-metric"><strong>{item.statusId || item.status || 'Open'}</strong><small>Next update due</small></div>
            <button className="btn" onClick={() => openModule(item.affectedId ? 'ops' : item.catLabel ? 'admin' : 'summary')}>View issue</button>
          </article>
        ))}
      </div>

      <aside className="readiness-panel">
        <div className="eyebrow">Handover readiness</div>
        <small>{activeDraft ? 'Active draft completion' : 'Report completion'}</small>
        <strong>{activeDraftCompletion}%</strong>
        <div className="readiness-bar"><i style={{ width: `${activeDraftCompletion}%` }} /></div>
        <p>{activeDraft ? activeDraftLabel : `${completion.missing.length} readiness areas require action before transfer.`}</p>
        <div className="readiness-list">
          {readyItems.map(([label, state, tone]) => <div className={`ready-row ${tone}`} key={label}><span>{label}</span><b>{state}</b></div>)}
        </div>
      </aside>
    </section>

    {drafts.length > 0 && <section className="draft-strip">
      <div className="eyebrow">Unfinished drafts</div>
      {drafts.slice(0, 5).map((d: DraftRecord) => <div className="draft-row" key={d.draftId}>
        <span>{labelFor(businessUnits, d.businessUnit)} - {d.shift || 'Morning'} - {formatDate(d.reportDate)}</span>
        <div className="row-actions">
          <button className="btn danger small" onClick={() => deleteDraft(d.draftId)}>Delete</button>
          <button className="btn primary small" onClick={() => openDraft(d)}>Continue</button>
        </div>
      </div>)}
    </section>}

    <div className="home-section-head">
      <div>
        <h2>Recent handovers</h2>
        <p>Submitted handovers available for operational review.</p>
      </div>
      <div className="home-filter modern-filter">
        <strong>Business unit</strong>
        <select value={reportFilter} onChange={(event) => setReportFilter(event.target.value)}>
          <option value="all">All business units</option>
          {businessUnits.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </div>

    {reports.length === 0 ? <Empty title="No reports found." text="No handover reports were returned from Dataverse for this filter." /> : <section className="handover-ledger">
      <div className="ledger-head"><span>Shift</span><span>Duty manager</span><span>Transfer state</span><span>Carry-over / exceptions</span><span>Submitted</span><span>Action</span></div>
      {reports.map((r: any) => {
        const acknowledged = Boolean(r.dma_dmacknowledgmenttimestamp)
        return <div className="ledger-row" key={r.dma_handoverreportid}>
          <b>{labelFor(businessUnits, r.dma_businessunit)} - {shiftFromValue(r.dma_shifttype)} - {shortDate(r.dma_reportdate)}</b>
          <span>{displayName(r)}</span>
          <span><i className={`status-token ${acknowledged ? 'ok' : 'warning'}`}>{acknowledged ? 'Acknowledged' : 'Submitted'}</i></span>
          <span>{r.dma_hotissues || 'None'}</span>
          <span>{shortTime(r.createdon)}</span>
          <button className="btn" onClick={() => openReport(r.dma_handoverreportid)}>Review</button>
        </div>
      })}
      <div className="pager">
        <button className="btn" disabled={reportPage <= 1} onClick={prevPage}>Previous</button>
        <span>Page {reportPage}</span>
        <button className="btn" disabled={reportPage >= totalReportPages} onClick={nextPage}>Next</button>
      </div>
    </section>}
  </main>
}

function timeGreeting(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 22) return 'Good evening'
  return 'Good night'
}

function draftValidation(draft: DraftRecord) {
  return validate(draft, draft.events || [], draft.adminIssues || [], draft.opsIssues || [], draft.damaEntries || [], draft.earlyDischarges || [])
}

function draftMissingCount(draft: DraftRecord) {
  return draftValidation(draft).missing.length
}

function draftCompletionPercent(draft: DraftRecord) {
  const result = draftValidation(draft)
  return result.ok ? 100 : Math.max(0, Math.round(((8 - result.missing.length) / 8) * 100))
}

function dateKey(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function Dashboard({ data, refresh }: any) {
  const [dateFilter, setDateFilter] = useState(data?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10))
  const [shiftFilter, setShiftFilter] = useState(data?.shift || 'Morning')
  const [buFilter, setBuFilter] = useState('All')
  const parsedDate = dateFilter ? new Date(dateFilter) : new Date()
  const dateText = parsedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const reportPool = data?.reports?.length ? data.reports : (data?.bus || []).map((b: any) => b.report).filter(Boolean)
  const filteredReports = reportPool.filter((report: any) => {
    const reportDate = dateKey(report?.dma_reportdate || report?.createdon)
    return reportDate === dateFilter && shiftFromValue(report?.dma_shifttype) === shiftFilter
  })
  const busRows = businessUnits.map(([value, label]) => {
    const report = filteredReports.find((row: any) => String(row.dma_businessunit) === String(value))
    const fallback = (data?.bus || []).find((row: any) => String(row.value) === String(value))
    const acknowledgedRow = Boolean(report?.dma_dmacknowledgmenttimestamp)
    return {
      value,
      label,
      report,
      status: report ? (acknowledgedRow ? 'acknowledged' : 'submitted') : 'unsubmitted',
      dm: report ? displayName(report) : '-',
      statusLabel: report ? (acknowledgedRow ? 'Acknowledged' : 'Submitted') : 'Pending',
      sla: report ? 'Submitted On Time' : 'Pending',
      escalation: report ? 'Not required' : fallback?.escalation || 'Submission overdue',
    }
  })
  const visibleBus = busRows.filter((b: any) => buFilter === 'All' || b.label === buFilter)
  const expectedCount = visibleBus.length || businessUnits.length
  const pendingBus = visibleBus.filter((b: any) => b.status === 'unsubmitted')
  const acknowledged = visibleBus.filter((b: any) => b.status === 'acknowledged').length
  const submittedCount = visibleBus.filter((b: any) => b.report).length
  const majorCount = visibleBus.reduce((sum: number, b: any) => sum + Number(b.report?.dma_majorincidents || 0), 0)
  const filteredAging = (data?.aging || []).filter((row: any) => buFilter === 'All' || row.bu === buFilter)
  const blockerCount = Math.max(filteredAging.length, visibleBus.reduce((sum: number, b: any) => sum + Number(b.report?.dma_pendingissues || 0), 0))
  const actionRequired = pendingBus.length + blockerCount
  const interventions = [
    ...pendingBus.map((b: any) => ({ id: `bu-${b.value}`, title: `${b.label} handover overdue`, detail: `${b.escalation || 'Submission overdue'}`, cta: 'Review' })),
    ...filteredAging.map((row: any) => ({ id: row.id, title: row.issue, detail: `${row.bu} - ${row.category} - ${row.age}`, cta: 'Open issue' })),
  ].slice(0, 3)
  const unitsLabel = (buFilter === 'All' ? businessUnits.map(([, label]) => label) : [buFilter]).join(' - ')
  return <section className="dashboard command-dashboard">
    <div className="command-head">
      <div>
        <div className="eyebrow">Group Operations Command Center</div>
        <h1>Situational awareness</h1>
        <p>{unitsLabel} - {shiftFilter} shift - {dateText}</p>
      </div>
      <div className="command-controls">
        <label><span>Date</span><input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} /></label>
        <label><span>Shift</span><select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}><option>Morning</option><option>Evening</option><option>Night</option></select></label>
        <label><span>Business units</span><select value={buFilter} onChange={(e) => setBuFilter(e.target.value)}><option>All</option>{businessUnits.map(([value, label]) => <option key={value}>{label}</option>)}</select></label>
        <span className="updated-pill">Updated just now</span>
        <button className="btn sync" onClick={refresh}>Sync now</button>
      </div>
    </div>

    <section className="command-signal-grid">
      <article className="signal-card dark">
        <small>System attention</small>
        <strong>{majorCount} major incidents</strong>
        <p>{majorCount ? 'Major event escalation active' : 'No major incidents'}</p>
        <button>View incidents</button>
      </article>
      <article className="signal-card">
        <small>Active blockers</small>
        <strong>{blockerCount} unresolved issues</strong>
        <p>{blockerCount ? `${blockerCount} issue${blockerCount === 1 ? '' : 's'} require ownership` : 'No active blockers require ownership'}</p>
        <button>View unresolved issues</button>
      </article>
      <article className="signal-card soft">
        <small>Reporting</small>
        <strong>{submittedCount}/{expectedCount} submitted</strong>
        <p>{pendingBus.length ? `${pendingBus.length} BUs pending` : 'All selected BUs submitted'}</p>
      </article>
    </section>

    <div className="command-section-title">
      <h2>Business unit operations network</h2>
      <p>Handover state and supported operational signals.</p>
    </div>
    <div className="command-network">
      <section className="network-table-card">
        <div className="network-head">
          <span>Unit / Duty Manager</span><span>Handover State</span><span>Staff</span><span>Incidents</span><span>Flow</span><span>Peak Capacity</span><span>ER DAMA</span><span>Pending</span>
        </div>
        {visibleBus.map((b: any) => {
          const submittedRow = Boolean(b.report)
          const stateClass = b.status === 'acknowledged' ? 'ok' : b.status === 'submitted' ? 'info' : 'critical'
          return <article className={`network-row ${b.status}`} key={b.value}>
            <div><strong>{b.label}</strong><small>{submittedRow ? b.dm : `${shiftFilter} report not submitted`}</small></div>
            <span className={`status-token ${stateClass}`}>{b.status === 'unsubmitted' ? 'Report overdue' : b.statusLabel}</span>
            <b>{submittedRow ? 'Adequate' : 'Overdue by'}</b>
            <b>{b.report?.dma_majorincidents || 0}</b>
            <b>{submittedRow ? `${b.report?.dma_admissions ?? 0} -> ${b.report?.dma_discharges ?? 0}` : 'Overdue'}</b>
            <b>{b.report?.dma_inputilization ? `ICU ${b.report.dma_inputilization}%` : submittedRow ? 'Stable' : 'Pending report'}</b>
            <b>{b.report?.dma_erdama != null ? `${b.report.dma_erdama}%` : submittedRow ? '0%' : 'Pending report'}</b>
            <b>{b.status === 'unsubmitted' ? '' : Number(b.report?.dma_pendingissues || 0)}</b>
          </article>
        })}
      </section>
      <aside className="command-intervention">
        <div className="eyebrow">Intervention now</div>
        <h2>Priority ownership</h2>
        {interventions.length === 0 ? <div className="intervention-empty"><strong>Clear</strong><p>No active ownership interventions.</p></div> : interventions.map((item: any, index: number) => <div className="intervention-item" key={item.id || index}>
          <strong>{String(index + 1).padStart(2, '0')} - {item.title}</strong>
          <span>{item.detail}</span>
          <button>{item.cta}</button>
        </div>)}
      </aside>
    </div>

    <section className="command-pipeline">
      <div><small>Expected</small><b>{expectedCount}</b></div>
      <span>{'->'}</span>
      <div><small>Submitted</small><b>{submittedCount}</b></div>
      <span>{'->'}</span>
      <div><small>Acknowledged</small><b>{acknowledged}</b></div>
      <span>{'->'}</span>
      <div className="action"><small>Action required</small><b>{actionRequired}</b></div>
    </section>

    <section className="executive-queue">
      <div className="queue-head">
        <div><div className="eyebrow">Aging & escalation</div><h2>Executive issue queue</h2><p>Showing all issues</p></div>
        <button className="btn">View all unresolved issues</button>
      </div>
      <table>
        <thead><tr><th>Issue</th><th>BU</th><th>Owner</th><th>Operational Status</th><th>Age</th><th>Action</th></tr></thead>
        <tbody>{filteredAging.length ? filteredAging.map((row: any) => <tr key={row.id}><td>{row.issue}</td><td>{row.bu}</td><td>{row.owner}</td><td><span className="status-token warning">{row.category}</span></td><td>{row.age}</td><td><button className="btn small">Open issue</button></td></tr>) : <tr><td colSpan={6} className="empty-cell">No active unresolved issues.</td></tr>}</tbody>
      </table>
    </section>
  </section>
}
function AlertDrawer({ alerts, markAlertRead, openReport, close }: any) {
  const unread = alerts.filter((a: AlertRow) => !a.isRead).length
  return <div className="drawer-backdrop" onClick={close}><aside className="alert-drawer" onClick={(event) => event.stopPropagation()}><div className="alert-drawer-head"><div><span>Operations</span><h2>Duty Manager Alerts</h2><small>{unread} unread</small></div><button className="icon-close" onClick={close} aria-label="Close alerts">x</button></div>{alerts.length === 0 ? <Empty title="No alerts" text="Connected alert rows will appear here." /> : <div className="alert-drawer-list">{alerts.map((a: AlertRow) => <div className={`alert-item ${a.isRead ? 'read' : ''}`} key={a.id}><span className={`alert-dot ${a.severity}`}></span><div className="alert-copy"><strong className={`alert-title ${a.severity}`}>{a.title}</strong><p>{a.description}</p><small>{formatDate(a.createdOn)}</small><div className="alert-row-actions">{a.reportId && <button className="alert-cta" onClick={() => openReport(a.reportId)}>Open Report</button>}<button className="alert-done" onClick={() => markAlertRead(a.id)}>{a.isRead ? 'Done' : 'Mark done'}</button></div></div></div>)}</div>}</aside></div>
}
function Editor({ state }: any) {
  const tabs: [TabKey, string][] = [
    ['general', 'General'],
    ['events', 'Events'],
    ['admin', 'Admin'],
    ['flow', 'Patient Flow'],
    ['ops', 'Operations'],
    ['experience', 'Experience'],
    ['summary', 'Summary'],
  ]
  const active = state.tab
  return <div className="editor-shell">
    <nav className="nav-tabs">{tabs.map(([key, label]) => <button key={key} className={active === key ? 'active' : ''} onClick={() => state.setTab(key)}>{label}</button>)}</nav>
    {active === 'general' && <GeneralTab form={state.form} updateForm={state.updateForm} reportId={state.reportId} saveGeneral={state.saveGeneral} searchUsers={state.searchUsers} userMatches={state.userMatches} setUserMatches={state.setUserMatches} openReport={state.openReport} adminIssues={state.adminIssues} setAdminIssues={state.setAdminIssues} opsIssues={state.opsIssues} setOpsIssues={state.setOpsIssues} setTab={state.setTab} />}
    {active === 'events' && <EventsTab events={state.events} setEvents={state.setEvents} eventTypes={state.eventTypes} eventCodes={state.eventCodes} loadEventCodes={state.loadEventCodes} />}
    {active === 'admin' && <AdminTab form={state.form} updateForm={state.updateForm} adminIssues={state.adminIssues} setAdminIssues={state.setAdminIssues} adminCatalog={state.adminCatalog} />}
    {active === 'flow' && <FlowTab form={state.form} updateForm={state.updateForm} reportId={state.reportId} discharges={state.discharges} damaEntries={state.damaEntries} setDamaEntries={state.setDamaEntries} earlyDischarges={state.earlyDischarges} setEarlyDischarges={state.setEarlyDischarges} />}
    {active === 'ops' && <OpsTab opsIssues={state.opsIssues} setOpsIssues={state.setOpsIssues} />}
    {active === 'experience' && <ExperienceTab form={state.form} updateForm={state.updateForm} />}
    {active === 'summary' && <SummaryTab form={state.form} updateForm={state.updateForm} completion={state.completion} pendingItems={state.pendingItems} submitReport={state.submitReport} busy={state.busy} />}
  </div>
}
function GeneralTab({ form, updateForm, reportId, saveGeneral, searchUsers, userMatches, setUserMatches, openReport, adminIssues, setAdminIssues, opsIssues, setOpsIssues, setTab }: any) {
  const [previousReport, setPreviousReport] = useState<any>(null)
  const [carryItems, setCarryItems] = useState<any[]>([])
  const [previousLoading, setPreviousLoading] = useState(false)
  const [previousMessage, setPreviousMessage] = useState('')
  const previousAcknowledged = Boolean(previousReport?.dma_dmacknowledgmenttimestamp)

  useEffect(() => {
    let cancelled = false
    async function loadPrevious() {
      if (!form.businessUnit || !form.reportDate) return
      setPreviousLoading(true)
      setPreviousMessage('')
      try {
        const report = await retrievePreviousSameBuReport(form, reportId)
        const carried = report?.dma_handoverreportid ? await retrieveCarryForwardItems(cleanId(report.dma_handoverreportid)) : []
        if (!cancelled) {
          setPreviousReport(report)
          setCarryItems(carried)
        }
      } catch (error) {
        console.warn('Previous handover lookup failed', error)
        if (!cancelled) {
          setPreviousReport(null)
          setCarryItems([])
          setPreviousMessage('Could not retrieve the previous handover.')
        }
      } finally {
        if (!cancelled) setPreviousLoading(false)
      }
    }
    loadPrevious()
    return () => { cancelled = true }
  }, [form.businessUnit, form.reportDate, reportId])

  async function acknowledgePrevious() {
    if (!previousReport?.dma_handoverreportid) return
    setPreviousMessage('Acknowledging previous handover...')
    try {
      const timestamp = new Date().toISOString()
      await acknowledgeHandoverReport(previousReport.dma_handoverreportid, timestamp)
      setPreviousReport({ ...previousReport, dma_dmacknowledgmenttimestamp: timestamp })
      setPreviousMessage('Previous handover acknowledged.')
    } catch (error) {
      console.warn('Previous handover acknowledgment failed', error)
      setPreviousMessage('Could not acknowledge the previous handover.')
    }
  }

  function carryForward(item: any) {
    const carrySource = previousReport
      ? `${labelFor(businessUnits, previousReport.dma_businessunit)} - ${shiftFromValue(previousReport.dma_shifttype)} - ${formatDate(previousReport.dma_reportdate)}${previousReport.dma_name ? ` (${previousReport.dma_name})` : ''}`
      : 'Previous same-BU handover'
    if (item.kind === 'admin') {
      if (adminIssues.some((issue: AdminIssue) => issue.id === item.targetId)) return
      setAdminIssues([...adminIssues, {
        id: item.targetId,
        catId: '',
        catLabel: item.title,
        status: String(item.status || '778000000') as Resolution,
        desc: item.description,
        action: item.action || '',
        pendingDetails: item.pending || item.description || 'Carried forward from previous shift',
        carrySource,
      }])
      setTab('admin')
      return
    }
    if (opsIssues.some((issue: OpsIssue) => issue.id === item.targetId)) return
    setOpsIssues([...opsIssues, {
      id: item.targetId,
      funcId: String(item.funcId || '778000000'),
      affectedId: String(item.affectedId || '778000000'),
      issueId: String(item.issueId || '778000000'),
      statusId: String(item.status || '778000000') as Resolution,
      desc: item.description,
      pendingDetails: item.pending || item.description || 'Carried forward from previous shift',
      carrySource,
    }])
    setTab('ops')
  }

  function carriedAlready(item: any) {
    return item.kind === 'admin'
      ? adminIssues.some((issue: AdminIssue) => issue.id === item.targetId)
      : opsIssues.some((issue: OpsIssue) => issue.id === item.targetId)
  }

  return <main className="workflow-page general-page">
    <PageTitle step="01" eyebrow="Shift Identity" title="General" subtitle="Confirm the reporting context and accept responsibility for the incoming shift." action={<button className="context-edit" onClick={saveGeneral}>Edit context</button>} />
    <section className="identity-card">
      <div className="identity-card-head"><span>Shift identity</span></div>
      <div className="identity-fields">
        <Field label="Duty Manager"><div className="lookup-wrap"><input value={form.dmName} onChange={(e) => searchUsers(e.target.value)} onBlur={() => setTimeout(() => setUserMatches([]), 150)} />{userMatches.length > 0 && <div className="lookup-results">{userMatches.map((u: any) => <button className="lookup-item" key={u.systemuserid} onClick={() => { updateForm({ dmName: u.fullname, dmUserId: u.systemuserid }); setUserMatches([]) }}>{u.fullname}</button>)}</div>}</div></Field>
        <SelectField label="Business Unit" value={form.businessUnit} options={businessUnits} onChange={(businessUnit: string) => updateForm({ businessUnit })} />
        <Field label="Report Date"><input type="datetime-local" value={form.reportDate} onChange={(e) => updateForm({ reportDate: e.target.value })} /></Field>
        <Field label="Shift"><select value={form.shift} onChange={(e) => updateForm({ shift: e.target.value as Shift })}><option>Morning</option><option>Evening</option><option>Night</option></select></Field>
      </div>
    </section>
    <div className="page-section-title"><h2>Incoming responsibility</h2><p>Context carried from the previous Duty Manager.</p></div>
    <section className="takeover-grid">
      <div className="carry-register">
        <div className="carry-ack previous-handover-row">
          <div>
            <h3>{previousReport?.dma_name || 'Previous handover'}</h3>
            <p>{previousLoading ? 'Retrieving the latest submitted handover from the same business unit...' : previousReport ? `${labelFor(businessUnits, previousReport.dma_businessunit)} - ${shiftFromValue(previousReport.dma_shifttype)} - ${formatDate(previousReport.dma_reportdate)}${previousMessage ? ` - ${previousMessage}` : ''}` : previousMessage || 'No previous handover found for this business unit.'}</p>
          </div>
          <span className={`status-token ${previousAcknowledged ? 'ok' : previousReport ? 'warning' : 'info'}`}>{previousAcknowledged ? 'Acknowledged' : previousReport ? 'Needs acknowledgment' : 'No report'}</span>
          <div className="carry-actions">
            {previousReport?.dma_handoverreportid && <button className="btn" onClick={() => openReport(previousReport.dma_handoverreportid)}>View previous report</button>}
            {previousReport?.dma_handoverreportid && !previousAcknowledged && <button className="btn primary" onClick={acknowledgePrevious}>Acknowledge</button>}
          </div>
        </div>
        <div className="carry-label">Carried forward responsibilities</div>
        {previousLoading ? <div className="carry-row"><div><h3>Loading carried responsibilities</h3><p>Checking unresolved issues from the previous same-BU handover.</p></div><span className="status-token info">Loading</span><div><strong>Previous shift</strong><small>Source</small></div><button className="btn" disabled>Loading</button></div> : carryItems.length === 0 ? <div className="carry-row"><div><h3>No carried responsibilities found</h3><p>No unresolved administrative or operations issues were found on the previous same-BU handover.</p></div><span className="status-token ok">Clear</span><div><strong>Previous shift</strong><small>Source</small></div><button className="btn" disabled>None</button></div> : carryItems.map((item) => <div className="carry-row" key={item.id}><div><h3>{item.title}</h3><p>{item.description || item.pending || 'No details recorded.'}</p></div><span className="status-token warning">{item.kind === 'admin' ? 'Administrative' : 'Operations'}</span><div><strong>{item.age}</strong><small>{labelFor(resolutionOptions, item.status)}</small></div><button className="btn" disabled={carriedAlready(item)} onClick={() => carryForward(item)}>{carriedAlready(item) ? 'Carried' : 'Carry over'}</button></div>)}
        <div className="carry-row"><div><h3>Dataverse report context</h3><p>Duty Manager, business unit, date and shift are saved using the original `dma_handoverreport` payload.</p></div><span className="status-token ok">In progress</span><div><strong>Live</strong><small>Data source</small></div><button className="btn" onClick={saveGeneral}>Save context</button></div>
      </div>
      <aside className="takeover-state"><div className="eyebrow">Takeover state</div><h2>{previousAcknowledged ? 'Responsibility accepted' : 'Acknowledgment pending'}</h2><p>{previousAcknowledged ? 'Previous-shift context has been acknowledged. Carried items remain visible for ownership.' : 'Review and acknowledge the previous same-BU handover before responsibility transfer.'}</p><div className="takeover-check"><span>Reporting context</span><b>Complete</b></div><div className={previousAcknowledged ? 'takeover-check' : 'takeover-check warn'}><span>Previous handover</span><b>{previousAcknowledged ? 'Acknowledged' : previousReport ? 'Required' : 'Not found'}</b></div><div className={carryItems.length ? 'takeover-check warn' : 'takeover-check'}><span>Carried responsibility</span><b>{carryItems.length ? `${carryItems.length} item${carryItems.length === 1 ? '' : 's'}` : 'Clear'}</b></div></aside>
    </section>
  </main>
}

function EventsTab({ events, setEvents, eventTypes, eventCodes, loadEventCodes }: any) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<EventItem>({ id: '', typeId: '', typeText: '', codeId: '', codeText: '', severity: '778000001', desc: '', actions: '', area: 'ER', pName: '', pCode: '', pId: '' })
  const areaOptions = eventAreaOptions(draft.typeText)
  const reset = () => setDraft({ id: '', typeId: '', typeText: '', codeId: '', codeText: '', severity: '778000001', desc: '', actions: '', area: 'ER', pName: '', pCode: '', pId: '' })
  const closeModal = () => { reset(); setAdding(false) }
  function editEvent(item: EventItem) {
    setDraft({ ...item, pCode: item.pCode || '' })
    if (item.typeId) loadEventCodes(item.typeId)
    setAdding(true)
  }
  function changeType(typeId: string) {
    const t = eventTypes.find((x: any) => x.dma_eventtypeid === typeId)
    const typeText = t?.dma_name || ''
    const nextArea = eventAreaOptions(typeText)[0][0]
    setDraft({ ...draft, typeId, typeText, codeId: '', codeText: '', area: nextArea, pName: '', pCode: '', pId: '' })
    loadEventCodes(typeId)
  }
  function save() {
    const item = { ...draft, id: draft.id || `event-${Date.now()}`, typeText: draft.typeText || 'Event', codeText: draft.codeText || 'Code', pCode: draft.pCode || '' }
    setEvents(draft.id ? events.map((event: EventItem) => event.id === draft.id ? item : event) : [...events, item])
    closeModal()
  }
  const major = events.filter((e: EventItem) => e.severity === '778000002').length
  const moderate = events.filter((e: EventItem) => e.severity === '778000001').length
  const low = Math.max(0, events.length - major - moderate)
  return <main className="workflow-page events-page">
    <PageTitle step="02" eyebrow="Clinical Situation Awareness" title="Hospital events" subtitle="Time-ordered clinical events, severity and accountable ownership." action={<button className="btn primary" onClick={() => setAdding(true)}>Log hospital event</button>} />
    {adding && <ModalShell title={draft.id ? 'Edit Hospital Event' : 'Add Hospital Event'} tone="event" onClose={closeModal}>
      <div className="grid report-grid two">
        <Field label="Critical Event Type *"><select value={draft.typeId} onChange={(e) => changeType(e.target.value)}><option value="">Select</option>{eventTypes.map((x: any) => <option key={x.dma_eventtypeid} value={x.dma_eventtypeid}>{x.dma_name}</option>)}</select></Field>
        <Field label="Specific Code *"><select value={draft.codeId} onChange={(e) => { const c = eventCodes.find((x: any) => x.dma_eventcodeid === e.target.value); setDraft({ ...draft, codeId: e.target.value, codeText: c?.dma_name || '' }) }}><option value="">Select</option>{eventCodes.map((x: any) => <option key={x.dma_eventcodeid} value={x.dma_eventcodeid}>{x.dma_name}</option>)}</select></Field>
        <SeverityBubbles value={draft.severity} onChange={(severity: Severity) => setDraft({ ...draft, severity })} />
        <Field label="Context (Area) *"><select value={draft.area || areaOptions[0][0]} onChange={(e) => setDraft({ ...draft, area: e.target.value as PatientArea, pName: '', pCode: '', pId: '' })}>{areaOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      </div>
      <div className="grid report-grid two">
        <PatientLookup area={(draft.area || areaOptions[0][0]) as PatientArea} label="Patient Search *" value={draft.pName ? `${draft.pName}${draft.pCode ? ` (${draft.pCode})` : ''}` : ''} onSelect={(p) => setDraft({ ...draft, area: p.area, pName: p.name, pCode: p.code, pId: p.id })} />
        <Field label="Patient Code"><input value={draft.pCode || ''} onChange={(e) => setDraft({ ...draft, pCode: e.target.value })} placeholder="Auto-filled from patient search" /></Field>
      </div>
      <Field label="Incident Description *"><textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="Details of the event..." /></Field>
      <Field label="Immediate Actions Taken *"><textarea value={draft.actions} onChange={(e) => setDraft({ ...draft, actions: e.target.value })} placeholder="Steps taken to mitigate issue..." /></Field>
      <div className="modal-actions"><button className="btn" onClick={closeModal}>Cancel</button><button className="btn primary" onClick={save}>{draft.id ? 'Save Event' : 'Add Event'}</button></div>
    </ModalShell>}
    <section className="event-summary-strip"><div><small>Shift event register</small><b>{events.length}<span>events this shift</span></b></div><div><small>Severity distribution</small><p><i className="dot red" />Major {major}<i className="dot amber" />Moderate {moderate}<i className="dot green" />Low {low}</p></div><div><small>Operational state</small><b>{events.length}<span>active events</span></b></div></section>
    <div className="page-section-title"><h2>Clinical event timeline</h2><p>Chronological event record for this shift.</p></div>
    <section className="event-timeline">{events.length === 0 ? <Empty title="No hospital events recorded" text="Clinical events logged during this shift will appear in the timeline." /> : events.map((e: EventItem, index: number) => <article className="timeline-row" key={e.id}><time>{shortTime(new Date().toISOString()) || `0${index}:00`}</time><span className={`timeline-dot ${severityClass(e.severity)}`} /><div><small>{labelFor(severityOptions, e.severity)}</small><h3>{e.typeText} - {e.codeText}</h3><p>{e.pName ? `${e.pName}${e.pCode ? ` (${e.pCode})` : ''} - ${e.area} - ` : ''}{e.desc}</p></div><div className="timeline-owner"><b>{e.actions || 'Duty Manager follow-up'}</b><span>{e.actions ? 'Action logged' : 'Active monitoring'}</span></div><div className="row-actions compact"><button className="btn small" onClick={() => editEvent(e)}>Update</button><button className="btn small danger icon-delete" aria-label="Delete event" title="Delete" onClick={() => setEvents(events.filter((x: EventItem) => x.id !== e.id))}>x</button></div></article>)}</section>
  </main>
}
function AdminTab({ form, updateForm, adminIssues, setAdminIssues, adminCatalog }: any) {
  const [draft, setDraft] = useState<AdminIssue>({ id: '', catId: adminCatalog[0]?.[0] || '', catLabel: adminCatalog[0]?.[1] || '', status: '778000000', desc: '', action: '', pendingDetails: '' })
  const [adding, setAdding] = useState(false)
  const delayed = adminIssues.filter((i: AdminIssue) => i.catLabel.toLowerCase().includes('discharge')).length
  const prolonged = adminIssues.filter((i: AdminIssue) => i.catLabel.toLowerCase().includes('admission')).length
  function resetAdminDraft() { setDraft({ id: '', catId: adminCatalog[0]?.[0] || '', catLabel: adminCatalog[0]?.[1] || '', status: '778000000', desc: '', action: '', pendingDetails: '' }) }
  function editAdminIssue(issue: AdminIssue) { setDraft({ ...issue }); setAdding(true) }
  function closeAdminModal() { resetAdminDraft(); setAdding(false) }
  function save() {
    const catLabel = labelFor(adminCatalog, draft.catId)
    const item = { ...draft, id: draft.id || `admin-${Date.now()}`, catLabel }
    setAdminIssues(draft.id ? adminIssues.map((issue: AdminIssue) => issue.id === draft.id ? item : issue) : [...adminIssues, item])
    closeAdminModal()
  }
  return <main className="workflow-page admin-page"><PageTitle step="03" eyebrow="Operational Constraints" title="Administrative issues" subtitle="Delayed discharges, prolonged ER admissions and issue ownership." action={<button className="btn primary" onClick={() => setAdding(true)}>Log administrative issue</button>} />
    <section className="admin-metrics"><div><small>Current load</small><b>{adminIssues.length}<span>Open issues</span></b><p>active this shift</p></div><div><small>Operational pressure</small><div className="metric-cluster"><b>{delayed}<span>Delayed discharges</span></b><b>{prolonged}<span>Prolonged ER</span></b><b>{Math.max(0, adminIssues.length - delayed - prolonged)}<span>Other blockers</span></b></div></div><div><small>Duty Manager attention</small><b>{adminIssues.filter((i: AdminIssue) => i.status !== '778000001').length} actions due</b><p>Requires intervention before handover</p></div></section>
    <div className="inline-edit-fields"><Field label="Delayed discharge narrative"><textarea value={form.delayedDischargesNarrative} onChange={(e) => updateForm({ delayedDischargesNarrative: e.target.value })} /></Field><Field label="Prolonged ER narrative"><textarea value={form.prolongedERNarrative} onChange={(e) => updateForm({ prolongedERNarrative: e.target.value })} /></Field></div>
    {adding && <ModalShell title={draft.id ? 'Edit Administrative Issue' : 'Add Administrative Issue'} tone="admin" onClose={closeAdminModal}><div className="grid report-grid two"><SelectField label="Issue Category *" value={draft.catId} options={adminCatalog} onChange={(catId: string) => setDraft({ ...draft, catId })} /><SelectField label="Resolution Status *" value={draft.status} options={resolutionOptions} onChange={(status: Resolution) => setDraft({ ...draft, status })} /></div><Field label="Description"><textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} /></Field><Field label="Action Taken"><textarea value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} /></Field>{draft.status !== '778000001' && <Field label="Summary / Pending Details *"><textarea value={draft.pendingDetails} onChange={(e) => setDraft({ ...draft, pendingDetails: e.target.value })} placeholder="Overall summary or pending action plan..." /></Field>}<div className="modal-actions"><button className="btn" onClick={closeAdminModal}>Cancel</button><button className="btn primary" onClick={save}>{draft.id ? 'Save Issue' : 'Add Issue'}</button></div></ModalShell>}
    <div className="admin-layout"><section className="issue-register"><div className="issue-head"><span>Issue / context</span><span>Owner</span><span>Operational state</span><span>Timing</span><span>Action</span></div>{adminIssues.length === 0 ? <DashedEmpty text="No administrative issues recorded yet." variant="register" /> : adminIssues.map((i: AdminIssue) => <article className="issue-row" key={i.id}><div><h3>{i.catLabel}</h3><p>{i.desc || 'No description entered'}</p></div><span>Duty Manager</span><span className="issue-state">{labelFor(resolutionOptions, i.status)}</span><span><b>Current shift</b><small>{i.pendingDetails || i.action || 'Active work'}</small></span><div className="row-actions compact"><button className="btn small" onClick={() => editAdminIssue(i)}>Update</button><button className="btn small danger icon-delete" aria-label="Delete administrative issue" title="Delete" onClick={() => setAdminIssues(adminIssues.filter((x: AdminIssue) => x.id !== i.id))}>x</button></div></article>)}</section><aside className="intervention-panel"><div className="eyebrow">Intervention now</div><h2>Priority ownership</h2><p>{adminIssues.length ? 'Issues requiring the Duty Manager immediate attention.' : 'No priority administrative issues logged.'}</p>{adminIssues.slice(0, 3).map((i: AdminIssue, idx: number) => <div className="priority-item" key={i.id}><strong>{String(idx + 1).padStart(2, '0')} - {i.catLabel}</strong><span>{labelFor(resolutionOptions, i.status)}</span></div>)}</aside></div>
  </main>
}
function FlowTab({ form, updateForm, reportId, discharges, damaEntries, setDamaEntries, earlyDischarges, setEarlyDischarges }: any) {
  const [entry, setEntry] = useState<DamaEntry>({ id: '', damaType: 'ER', patientName: '', patientCode: '', reason: '', actionTaken: '' })
  const [editingFlow, setEditingFlow] = useState(false)
  const [retentionType, setRetentionType] = useState<DamaEntry['damaType'] | null>(null)
  const [addingEarlyDischarge, setAddingEarlyDischarge] = useState(false)
  const [earlyDischargeMasterId, setEarlyDischargeMasterId] = useState('')
  const [nightFlowStatus, setNightFlowStatus] = useState('')
  const [refreshingFlow, setRefreshingFlow] = useState(false)
  const [flowRefreshStatus, setFlowRefreshStatus] = useState('')
  function addEntry(type: DamaEntry['damaType']) { setDamaEntries([...damaEntries, { ...entry, damaType: type, id: `dama-${Date.now()}` }]); setEntry({ id: '', damaType: type, patientName: '', patientCode: '', reason: '', actionTaken: '' }) }
  function setEarlyRows(rows: EarlyDischarge[]) {
    setEarlyDischarges(rows)
    if (form.shift === 'Night' && form.plannedDischarges !== rows.length) updateForm({ plannedDischarges: rows.length })
  }
  async function syncNightEarlyDischarges(showStatus = false) {
    if (form.shift !== 'Night') return
    if (showStatus) setNightFlowStatus('Refreshing tomorrow discharge plan...')
    try {
      const synced = await syncEarlyDischargesViaXrm(form.reportDate)
      setEarlyDischargeMasterId(synced.masterId)
      if (synced.rows.length || synced.masterId) {
        setEarlyRows(synced.rows)
        if (showStatus) setNightFlowStatus(synced.masterId ? 'Night discharge plan refreshed.' : 'No draft discharge plan was found for tomorrow.')
      } else if (showStatus) {
        setNightFlowStatus('No draft discharge plan was found for tomorrow.')
      }
    } catch (error) {
      console.warn('Night discharge plan refresh failed', error)
      if (showStatus) setNightFlowStatus('Could not refresh the night discharge plan.')
    }
  }
  async function saveEarlyDischarge(draft: { type: EarlyDischarge['type'] | ''; patientCode: string; reason: string }) {
    if (!draft.type || !draft.patientCode.trim()) {
      setNightFlowStatus('Choose a discharge type and patient code.')
      return
    }
    if (earlyDischarges.some((row: EarlyDischarge) => row.code.toLowerCase() === draft.patientCode.trim().toLowerCase())) {
      setNightFlowStatus('This patient is already in tomorrow discharge plan.')
      return
    }
    try {
      let masterId = earlyDischargeMasterId
      if (!masterId) {
        const synced = await syncEarlyDischargesViaXrm(form.reportDate)
        masterId = synced.masterId
        setEarlyDischargeMasterId(masterId)
        if (synced.rows.length) setEarlyRows(synced.rows)
      }
      if (!masterId) {
        setNightFlowStatus('No draft Early Discharge master record found for tomorrow. The automated flow must create it first.')
        return
      }
      const dischargeType: EarlyDischarge['type'] = draft.type
      const row = await createEarlyDischargeViaXrm(masterId, { type: dischargeType, patientCode: draft.patientCode, reason: draft.reason })
      const rows = [...earlyDischarges, row]
      setEarlyRows(rows)
      await triggerEarlyDischargeRollup(masterId)
      setAddingEarlyDischarge(false)
      setNightFlowStatus('Patient added to tomorrow discharge plan.')
    } catch (error) {
      console.warn('Could not add early discharge patient', error)
      setNightFlowStatus(error instanceof Error ? error.message : 'Could not add patient to tomorrow discharge plan.')
    }
  }
  async function deleteEarlyDischarge(row: EarlyDischarge) {
    const rows = earlyDischarges.filter((item: EarlyDischarge) => item.id !== row.id)
    setEarlyRows(rows)
    if (!row.id.startsWith('local-')) {
      try {
        await deleteEarlyDischargeViaXrm(row.id)
        if (earlyDischargeMasterId) await triggerEarlyDischargeRollup(earlyDischargeMasterId)
        setNightFlowStatus('Patient removed from tomorrow discharge plan.')
      } catch (error) {
        console.warn('Could not delete early discharge patient', error)
        setNightFlowStatus('Patient removed locally, but Dataverse delete failed.')
      }
    }
  }
  async function refreshAutoCounts(showStatus = true) {
    if (!reportId || String(reportId).startsWith('local-')) return
    if (showStatus) {
      setRefreshingFlow(true)
      setFlowRefreshStatus('Refreshing census...')
    }
    try {
      const [censusValues, dischargeCount] = await Promise.all([
        retrieveFlowCensusViaXrm(reportId),
        retrieveTotalDischargesViaXrm(form),
      ])
      const patch: Partial<FormState> = { ...censusValues }
      if (typeof dischargeCount === 'number') patch.discharges = dischargeCount
      if (Object.keys(patch).length) updateForm(patch)
      if (showStatus) setFlowRefreshStatus('Auto-refreshed from Dataverse.')
    } catch (error) {
      console.warn('Could not refresh patient flow counts', error)
      if (showStatus) setFlowRefreshStatus('Could not refresh auto-counts.')
    } finally {
      if (showStatus) setRefreshingFlow(false)
    }
  }
  useEffect(() => {
    if (!reportId || String(reportId).startsWith('local-')) return
    refreshAutoCounts(false)
    const interval = window.setInterval(() => refreshAutoCounts(false), 10000)
    return () => window.clearInterval(interval)
  }, [reportId, form.reportDate, form.shift])
  useEffect(() => {
    if (form.shift !== 'Night') return
    syncNightEarlyDischarges(false)
  }, [form.shift, form.reportDate])
  const damaCounts = [
    { type: 'ER' as DamaEntry['damaType'], label: 'ER', cases: form.erDama, retained: form.erDamaRetention },
    { type: 'INP' as DamaEntry['damaType'], label: 'Inpatient', cases: form.inpDama, retained: form.inpDamaRetention },
    { type: 'Closed' as DamaEntry['damaType'], label: 'Closed', cases: form.closedDama, retained: form.closedDamaRetention },
  ]
  const retentionTotal = damaCounts.reduce((sum, item) => sum + item.retained, 0)
  const flowStatus = form.staffAdequacy === '778000000' ? 'Pressure' : 'Stable'
  return <main className="workflow-page flow-page">
    <PageTitle step="04" eyebrow="Patient Flow" title="Patient flow" subtitle="Live census, movement, theatre flow and retention signals for the current shift." action={<div className="flow-title-actions"><button className="btn" onClick={() => refreshAutoCounts()} disabled={refreshingFlow}>{refreshingFlow ? 'Refreshing...' : 'Refresh counts'}</button><button className="btn primary" onClick={() => setEditingFlow(true)}>Update patient flow</button></div>} />
    <section className="flow-status-strip">
      <div className="flow-status-cell">
        <small>Flow status</small>
        <b>{flowStatus}</b>
        <p>{form.staffAdequacy === '778000000' ? form.shortfallSummary || 'Staff coverage requires attention' : 'No current pressure'}</p>
        <span className="staff-chip">Staff coverage <strong>{labelFor(staffOptions, form.staffAdequacy)}</strong></span>
      </div>
      <div className="flow-status-cell flow-metrics">
        <small>Inbound</small>
        <div className="flow-metric-grid">
          <b>{form.admissions}<span>Total admissions</span></b>
          <b>{form.erAdmissions}<span>ER admissions <i className="auto-source-pill">Auto</i> - volume {form.erVolume}</span></b>
          <b>{form.opdAdmissions}<span>OPD admissions <i className="auto-source-pill">Auto</i></span></b>
          <b>{form.erVolume}<span>Total ER volume</span></b>
        </div>
      </div>
      <div className="flow-status-cell flow-metrics">
        <small>Outbound</small>
        <div className="flow-metric-grid">
          <b>{discharges}<span>Total discharges <i className="auto-source-pill">Auto</i></span></b>
          <b>{form.plannedDischarges}<span>Planned</span></b>
          <b>{form.unplannedDischarges}<span>Unplanned</span></b>
        </div>
        <div className="net-flow">Admissions <span>{'->'}</span> In hospital <span>{'->'}</span> Discharges <strong>Net flow {form.admissions - discharges}</strong></div>
      </div>
      <div className="flow-status-cell watch">
        <small>Watch</small>
        <b>{retentionTotal}<span>DAMA retained</span></b>
        <p>{retentionTotal ? 'Retention cases require active ownership.' : 'No retention cases recorded this shift.'}</p>
      </div>
    </section>
    {flowRefreshStatus && <div className="flow-refresh-note">{flowRefreshStatus}</div>}
    <div className="movement-head"><div><h2>Today's movement</h2></div><p>Throughput and exceptions requiring operational awareness.</p></div>
    <div className="flow-work-grid">
      <section className="theatre-flow-card">
        <div className="flow-card-head">
          <h2>Theatre flow</h2>
          <span><strong>{form.totalORCases}</strong> total cases <em>Current shift</em></span>
        </div>
        <div className="theatre-stage">
          <div><small>Pre-op</small><b>{form.preoperative}</b></div>
          <span className="flow-arrow">{'->'}</span>
          <div><small>Post-op</small><b>{form.postoperative}</b></div>
        </div>
        <div className="theatre-exceptions">
          <small>Exceptions</small>
          <div className="theatre-exception-metrics">
            <span className="postponed">Postponed <b>{form.postponedORCases}</b></span>
            <span className="cancelled">Cancelled <b>{form.cancelledORCases}</b></span>
          </div>
          {!form.postponedORCases && !form.cancelledORCases && <p>No theatre activity recorded for this shift.</p>}
        </div>
      </section>
      <section className="retention-watch-card">
        <div className="flow-card-head">
          <h2>Retention watch</h2>
          <span>Log only when required</span>
        </div>
        <div className="retention-table">
          <div className="retention-head"><span>Area</span><span>Cases</span><span>Retained</span><span>Action</span></div>
          {damaCounts.map((item) => <div className="retention-row" key={item.type}><strong>{item.label}</strong><span>{item.cases}</span><b>{item.retained}</b><button className="btn small" onClick={() => { setEntry({ ...entry, damaType: item.type }); setRetentionType(item.type) }}>Log patient</button></div>)}
        </div>
        <p>Retained patients require active ownership before handover.</p>
      </section>
    </div>
    {form.shift === 'Night' && <NightShiftFlowPanel form={form} earlyDischarges={earlyDischarges} status={nightFlowStatus} refresh={() => syncNightEarlyDischarges(true)} add={() => setAddingEarlyDischarge(true)} remove={deleteEarlyDischarge} />}
    {editingFlow && <FlowUpdateModal form={form} updateForm={updateForm} discharges={discharges} close={() => setEditingFlow(false)} />}
    {retentionType && <RetentionPatientModal type={retentionType} entry={entry} setEntry={setEntry} addEntry={() => { addEntry(retentionType); setRetentionType(null) }} close={() => setRetentionType(null)} />}
    {addingEarlyDischarge && <EarlyDischargeModal save={saveEarlyDischarge} close={() => setAddingEarlyDischarge(false)} />}
  </main>
}

function FlowUpdateModal({ form, updateForm, discharges, close }: any) {
  function toggleShortage(value: string) {
    const current = form.shortageTypes || []
    updateForm({ shortageTypes: current.includes(value) ? current.filter((item: string) => item !== value) : [...current, value] })
  }

  return <div className="modal flow-popup-backdrop" role="dialog" aria-modal="true">
    <div className="flow-popup flow-update-popup">
      <div className="flow-popup-head">
        <div><h2>Update patient flow</h2><p>Update the current-shift patient flow values.</p></div>
        <button className="flow-popup-close" onClick={close} aria-label="Close">x</button>
      </div>
      <div className="flow-popup-section">Staff coverage</div>
      <div className="flow-popup-grid single">
        <label className="flow-popup-field"><span>Staff coverage</span><select value={form.staffAdequacy} onChange={(e) => updateForm({ staffAdequacy: e.target.value })}>{staffOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {form.staffAdequacy === '778000000' && <div className="flow-shortage-panel">
        <div className="flow-popup-field"><span>Coverage shortage *</span><div className="bubble-row">{shortageOptions.map(([value, label]) => <button type="button" key={value} className={`shortage-bubble ${form.shortageTypes?.includes(value) ? 'active' : ''}`} onClick={() => toggleShortage(value)}>{label}</button>)}</div></div>
        <label className="flow-popup-field"><span>Shortfall summary *</span><textarea value={form.shortfallSummary} onChange={(e) => updateForm({ shortfallSummary: e.target.value })} placeholder="Describe the impact of the staff shortage..." /></label>
      </div>}
      <div className="flow-popup-section">Inbound</div>
      <div className="flow-popup-grid">
        <FlowNumber label="ER admissions" value={form.erAdmissions} readOnly onChange={(erAdmissions) => updateForm({ erAdmissions })} />
        <FlowNumber label="OPD admissions" value={form.opdAdmissions} readOnly onChange={(opdAdmissions) => updateForm({ opdAdmissions })} />
        <FlowNumber label="Total ER volume" value={form.erVolume} onChange={(erVolume) => updateForm({ erVolume })} />
      </div>
      <div className="flow-popup-section">Outbound</div>
      <div className="flow-popup-grid">
        <FlowNumber label="Planned discharges" value={form.plannedDischarges} onChange={(plannedDischarges) => updateForm({ plannedDischarges })} />
        <FlowNumber label="Unplanned discharges" value={form.unplannedDischarges} onChange={(unplannedDischarges) => updateForm({ unplannedDischarges })} />
        <FlowNumber label="Total discharges" value={discharges} readOnly onChange={() => undefined} />
      </div>
      <div className="flow-popup-section">Theatre flow</div>
      <div className="flow-popup-grid">
        <FlowNumber label="Total cases" value={form.totalORCases} onChange={(totalORCases) => updateForm({ totalORCases })} />
        <FlowNumber label="Pre-op" value={form.preoperative} onChange={(preoperative) => updateForm({ preoperative })} />
        <FlowNumber label="Post-op" value={form.postoperative} onChange={(postoperative) => updateForm({ postoperative })} />
        <FlowNumber label="Postponed" value={form.postponedORCases} onChange={(postponedORCases) => updateForm({ postponedORCases })} />
        <FlowNumber label="Cancelled" value={form.cancelledORCases} onChange={(cancelledORCases) => updateForm({ cancelledORCases })} />
      </div>
      {form.shift === 'Night' && <>
        <div className="flow-popup-section">Unit utilization</div>
        <div className="flow-popup-grid">
          <FlowNumber label="Ward utilization" value={form.inpUtilization} onChange={(inpUtilization) => updateForm({ inpUtilization })} />
          <FlowNumber label="ICU utilization" value={form.icuUtilization} onChange={(icuUtilization) => updateForm({ icuUtilization })} />
          <FlowNumber label="CCU utilization" value={form.ccuUtilization} onChange={(ccuUtilization) => updateForm({ ccuUtilization })} />
          <FlowNumber label="PICU utilization" value={form.picuUtilization} onChange={(picuUtilization) => updateForm({ picuUtilization })} />
          <FlowNumber label="NICU utilization" value={form.nicuUtilization} onChange={(nicuUtilization) => updateForm({ nicuUtilization })} />
          <FlowNumber label="CPU utilization" value={form.cxUtilization} onChange={(cxUtilization) => updateForm({ cxUtilization })} />
          <FlowNumber label="Stroke utilization" value={form.strokeUtilization} onChange={(strokeUtilization) => updateForm({ strokeUtilization })} />
        </div>
      </>}
      <div className="flow-popup-actions">
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={close}>Save context</button>
      </div>
    </div>
  </div>
}

function FlowNumber({ label, value, readOnly, onChange }: { label: string; value: number; readOnly?: boolean; onChange: (value: number) => void }) {
  return <label className={`flow-popup-field ${readOnly ? 'auto-field' : ''}`}><span>{label}{readOnly && <i>Auto</i>}</span><input type="number" min="0" readOnly={readOnly} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>
}

function RetentionPatientModal({ type, entry, setEntry, addEntry, close }: any) {
  const area = type === 'ER' ? 'ER' : 'IPD'
  const label = type === 'INP' ? 'inpatient' : String(type).toLowerCase()
  return <div className="modal flow-popup-backdrop" role="dialog" aria-modal="true">
    <div className="flow-popup retention-popup">
      <div className="flow-popup-head">
        <div><h2>Log retention patient</h2><p>Record a patient retained in {label}.</p></div>
      </div>
      <div className="flow-popup-stack">
        <PatientLookup area={area} label="Patient / MRN" value={entry.damaType === type ? entry.patientName : ''} onSelect={(p) => setEntry({ ...entry, damaType: type, area: p.area, patientName: p.name, patientCode: p.code, pId: p.id })} />
        <Field label="Reason"><textarea value={entry.damaType === type ? entry.reason : ''} onChange={(e) => setEntry({ ...entry, damaType: type, reason: e.target.value, actionTaken: e.target.value })} placeholder="Reason for retention..." /></Field>
      </div>
      <div className="flow-popup-actions">
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={addEntry}>Save patient</button>
      </div>
    </div>
  </div>
}

function NightShiftFlowPanel({ form, earlyDischarges, status, refresh, add, remove }: any) {
  const utilization = [
    ['Ward', form.inpUtilization, '51 beds'],
    ['ICU', form.icuUtilization, '21 beds'],
    ['CCU', form.ccuUtilization, '6 beds'],
    ['PICU', form.picuUtilization, '2 beds'],
    ['NICU', form.nicuUtilization, '4 beds'],
    ['CPU', form.cxUtilization, '0 beds'],
    ['Stroke', form.strokeUtilization, '0 beds'],
  ]
  return <section className="night-flow-panel">
    <div className="night-flow-head">
      <div><div className="eyebrow">Night shift planning</div><h2>Tomorrow discharge command</h2><p>Early and planned discharge ownership for the next day.</p></div>
      <div className="night-flow-actions">{status && <span className="night-status-chip">{status}</span>}<button className="btn" onClick={refresh}>Refresh plan</button><button className="btn primary" onClick={add}>Add discharge patient</button></div>
    </div>
    <div className="night-flow-grid">
      <section className="early-discharge-card">
        <div className="flow-card-head">
          <h2>Early & planned discharges</h2>
          <span><strong>{earlyDischarges.length}</strong> patients for {targetDischargeDate(form.reportDate) || 'tomorrow'}</span>
        </div>
        <div className="early-discharge-list">
          {earlyDischarges.length === 0 ? <div className="early-discharge-empty"><strong>No patients added yet</strong><span>Patients planned for tomorrow discharge will appear here.</span></div> : earlyDischarges.map((row: EarlyDischarge) => <article className="early-discharge-row" key={row.id}>
            <div><strong>{row.name || 'Unnamed patient'}</strong><p>{row.code || 'No MRN'} - {row.reason || 'No reason recorded'}</p></div>
            <span className={`status-token ${row.type === 'Early' ? 'warning' : 'ok'}`}>{row.type}</span>
            <button className="btn small danger icon-delete" aria-label="Delete discharge patient" title="Delete" onClick={() => remove(row)}>x</button>
          </article>)}
        </div>
      </section>
      <aside className="night-util-card">
        <div className="flow-card-head"><h2>Unit utilization</h2><span>Night review</span></div>
        <div className="night-util-grid">
          {utilization.map(([label, value, capacity]) => <div className="night-util-tile" key={String(label)}>
            <small>{label}</small>
            <b>{value}%</b>
            <span>{capacity}</span>
          </div>)}
        </div>
      </aside>
    </div>
  </section>
}

function EarlyDischargeModal({ save, close }: any) {
  const [draft, setDraft] = useState<{ type: EarlyDischarge['type'] | ''; patientCode: string; reason: string }>({ type: '', patientCode: '', reason: '' })
  return <div className="modal flow-popup-backdrop" role="dialog" aria-modal="true">
    <div className="flow-popup early-discharge-popup">
      <div className="flow-popup-head">
        <div><h2>Add discharge patient</h2><p>Add a patient to tomorrow early or planned discharge list.</p></div>
        <button className="flow-popup-close" onClick={close} aria-label="Close">x</button>
      </div>
      <div className="flow-popup-stack">
        <label className="flow-popup-field"><span>Discharge type *</span><select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as EarlyDischarge['type'] | '' })}><option value="">Select type</option><option value="Early">Early</option><option value="Planned">Planned</option></select></label>
        <label className="flow-popup-field"><span>Patient / MRN *</span><input value={draft.patientCode} onChange={(e) => setDraft({ ...draft, patientCode: e.target.value })} placeholder="Enter inpatient code or MRN" autoFocus /></label>
        <label className="flow-popup-field"><span>Reason *</span><textarea value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="Discharge planning notes..." /></label>
      </div>
      <div className="flow-popup-actions">
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={() => save(draft)}>Save patient</button>
      </div>
    </div>
  </div>
}

function OpsTab({ opsIssues, setOpsIssues }: any) {
  const [draft, setDraft] = useState<OpsIssue>({ id: '', funcId: '778000002', affectedId: '778000000', issueId: '778000000', statusId: '778000000', desc: '', pendingDetails: '' })
  const [adding, setAdding] = useState(false)
  const pendingOps = opsIssues.filter((o: OpsIssue) => o.statusId !== '778000001')
  const carriedOps = opsIssues.filter((o: OpsIssue) => String(o.id || '').startsWith('carry-ops-'))
  const pendingCarriedOps = carriedOps.filter((o: OpsIssue) => o.statusId !== '778000001')
  function resetOpsDraft() { setDraft({ id: '', funcId: '778000002', affectedId: '778000000', issueId: '778000000', statusId: '778000000', desc: '', pendingDetails: '' }) }
  function closeOpsModal() { resetOpsDraft(); setAdding(false) }
  function updateOpsIssue(issue: OpsIssue) { setDraft({ ...issue }); setAdding(true) }
  function save() {
    const item = { ...draft, id: draft.id || `ops-${Date.now()}` }
    setOpsIssues(draft.id ? opsIssues.map((issue: OpsIssue) => issue.id === draft.id ? item : issue) : [...opsIssues, item])
    closeOpsModal()
  }
  return <main className="workflow-page ops-page"><PageTitle step="05" eyebrow="Operations" title="Operations" subtitle="Shift-reported operational exceptions and accountable follow-up." action={<button className="btn primary" onClick={() => setAdding(true)}>Log operational exception</button>} /><section className="card report-card section-ops"><div className="ops-summary"><div><small>Shift operations</small><b>{opsIssues.length ? 'Exceptions logged' : 'Clear this shift'}</b><p>{carriedOps.length ? `${carriedOps.length} carried over from previous shift` : opsIssues.length ? 'Operational interruptions recorded' : 'No operational interruptions logged'}</p></div><div><small>Open exceptions</small><b>{pendingOps.length}</b><p>Unresolved partial or total outages</p></div><div><small>Duty Manager attention</small><b>{pendingOps.length}</b><p>Pending exceptions requiring follow-up</p></div></div>
    {adding && <ModalShell title={draft.id ? 'Update Operations Outage' : 'Log Operations Outage'} tone="ops" onClose={closeOpsModal}><div className="grid report-grid two"><SelectField label="Service Functionality *" value={draft.funcId} options={serviceFunctionalityOptions} onChange={(funcId: string) => setDraft({ ...draft, funcId })} /><SelectField label="Service Affected *" value={draft.affectedId} options={serviceAffectedOptions} onChange={(affectedId: string) => setDraft({ ...draft, affectedId })} /><SelectField label="Type of Issue *" value={draft.issueId} options={opsIssueOptions} onChange={(issueId: string) => setDraft({ ...draft, issueId })} /><SelectField label="Resolution Status *" value={draft.statusId} options={resolutionOptions} onChange={(statusId: Resolution) => setDraft({ ...draft, statusId })} /></div><Field label="Description of Issue *"><textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} /></Field>{draft.statusId !== '778000001' && <Field label="Summary / Pending Details *"><textarea value={draft.pendingDetails} onChange={(e) => setDraft({ ...draft, pendingDetails: e.target.value })} /></Field>}<div className="modal-actions"><button className="btn" onClick={closeOpsModal}>Cancel</button><button className="btn primary" onClick={save}>{draft.id ? 'Save Update' : 'Save Operations Outage'}</button></div></ModalShell>}
    <div className={`previous-placeholder ops-tone ${pendingCarriedOps.length ? 'has-carry' : ''}`}>{pendingCarriedOps.length ? `${pendingCarriedOps.length} pending operations outage${pendingCarriedOps.length === 1 ? '' : 's'} carried over from the previous shift. Update the item to resolve it.` : 'No pending operations outages carried over from previous shifts.'}</div><div className="single-list">{opsIssues.length === 0 ? <Empty title="All systems fully functional" text="No active outages have been logged for this handover." /> : <CardList items={opsIssues} tone="ops" onUpdate={updateOpsIssue} onDelete={(id: string) => setOpsIssues(opsIssues.filter((x: OpsIssue) => x.id !== id))} render={(o: OpsIssue) => <><strong>{labelFor(serviceAffectedOptions, o.affectedId)} - {labelFor(opsIssueOptions, o.issueId)}</strong><span className="section-bubble ops light">{labelFor(resolutionOptions, o.statusId)}</span>{String(o.id || '').startsWith('carry-ops-') && <span className="section-bubble ops carry-badge">Carried over</span>}<p>{o.desc}</p><small><b>Summary/Pending:</b> {o.pendingDetails}</small></>} />}</div>
  </section></main>
}
function ExperienceTab({ form, updateForm }: any) {
  const hasFollowUp = Boolean(form.complaintsCount || form.ovrsCount || form.govVisit === 'Yes')
  return <main className="workflow-page experience-page"><PageTitle step="06" eyebrow="Experience" title="Experience" subtitle="Patient concerns, variance reports and regulatory follow-up for the current shift." /><section className="experience-summary"><div><small>Experience status</small><b>{hasFollowUp ? 'Active follow-up' : 'No active concerns'}</b><p>{hasFollowUp ? 'Experience items require documented follow-up.' : 'No unresolved patient or family experience issues logged.'}</p></div><div><small>Experience attention</small><b>{form.complaintsCount}</b><p>Escalated complaints</p></div><div><small>Governance signals</small><div className="metric-cluster"><b>{form.ovrsCount}<span>Escalated OVRs</span></b><b>{form.govVisit === 'Yes' ? 1 : 0}<span>Regulatory visits</span></b></div></div></section><section className="experience-work-grid"><ExperiencePanel title="Escalated complaints" subtitle="Patient dissatisfaction cases"><NumberField label="Number of Complaints *" value={form.complaintsCount} onChange={(complaintsCount: number) => updateForm({ complaintsCount })} />{form.complaintsCount > 0 && <Field label="Summary of Complaints *"><textarea value={form.complaintsSummary} onChange={(e) => updateForm({ complaintsSummary: e.target.value })} placeholder="Describe patient complaints clearly..." /></Field>}</ExperiencePanel><ExperiencePanel title="Escalated OVRs" subtitle="Official variance reports"><NumberField label="Number of OVRs *" value={form.ovrsCount} onChange={(ovrsCount: number) => updateForm({ ovrsCount })} />{form.ovrsCount > 0 && <Field label="Summary of OVRs *"><textarea value={form.ovrsSummary} onChange={(e) => updateForm({ ovrsSummary: e.target.value })} placeholder="Describe incident / OVR details..." /></Field>}</ExperiencePanel></section><section className="experience-card experience-regulatory"><div className="experience-head"><div><h3>Regulatory & Government</h3><small>Authority visits during shift</small></div><span className="experience-state">{form.govVisit === 'Yes' ? 'Visit logged' : 'No visits'}</span></div><div className="experience-body"><Field label="Government / Regulatory Visit"><select value={form.govVisit} onChange={(e) => updateForm({ govVisit: e.target.value })}><option value="No">No Visits</option><option value="Yes">Yes, Visited</option></select></Field>{form.govVisit === 'Yes' && <Field label="Authority Name & Findings Summary *"><textarea value={form.govSummary} onChange={(e) => updateForm({ govSummary: e.target.value })} placeholder="Include authority name, purpose of visit, and findings..." /></Field>}</div></section></main>
}
function SummaryTab({ form, updateForm, completion, pendingItems, submitReport, busy }: any) {
  const readinessSections = [
    ['01', 'General / Shift Identity'],
    ['02', 'Hospital Events'],
    ['03', 'Administrative Issues'],
    ['04', 'Patient Flow'],
    ['05', 'Operations'],
    ['06', 'Experience'],
  ]
  const carriedPending = pendingItems.filter((item: any) => String(item.id || '').startsWith('carry-'))
  const saveReview = () => updateForm({ hotIssues: form.hotIssues })

  return <main className="workflow-page summary-page">
    <PageTitle step="07" eyebrow="Handover Review" title="Summary" subtitle="Review readiness, unresolved responsibilities and transfer state before handover." />
    <section className="summary-hero">
      <div>
        <small>Handover readiness</small>
        <h2>{completion.ok ? 'Ready to submit' : 'Review required'}</h2>
        <p>Readiness follows required-field validation across the handover modules. Complete the review below before submitting.</p>
      </div>
      <div>
        <small>Final transfer action</small>
        <p>{completion.ok ? 'All required fields are complete.' : 'Hot issues during shift are required before this report can be submitted.'}</p>
        <button className="btn primary submit" disabled={busy} onClick={submitReport}>{busy ? 'Submitting...' : 'Submit Shift Report'}</button>
        <strong className="summary-action-note">{completion.ok ? 'Ready for final transfer.' : 'Review required - complete mandatory fields before submission.'}</strong>
        {!completion.ok && <div className="missing-fields-panel"><span>Missing fields</span>{completion.missing.map((field: string) => <b key={field}>{field}</b>)}</div>}
      </div>
    </section>
    <section className="summary-readiness">
      <div className="summary-card-head"><h2>Section readiness</h2><span>Required-field review across the handover</span></div>
      <div className="readiness-grid">
        {readinessSections.map(([code, label]) => <div className="ready-line" key={label}><span>{code} - {label}</span><b>{completion.ok ? 'Complete' : 'Review required'}</b></div>)}
      </div>
    </section>
    <div className="summary-main-grid">
      <section className="card final-review">
        <div className="section-header"><h2>Final review</h2><span>Current shift handover</span></div>
        <Field label="Final handover note - Hot issues during shift *"><textarea value={form.hotIssues} onChange={(e) => updateForm({ hotIssues: e.target.value })} /></Field>
        <p className="field-help">Capture only issues requiring incoming Duty Manager awareness.</p>
        {form.shift === 'Night' && <div className="grid night-summary-fields"><Field label="Night Medical Meeting"><select value={form.nightMedicalMeeting} onChange={(e) => updateForm({ nightMedicalMeeting: e.target.value })}><option value="778000000">Done</option><option value="778000001">Not Done</option></select></Field><Field label="Meeting Summary"><textarea value={form.nightSummary} onChange={(e) => updateForm({ nightSummary: e.target.value })} /></Field></div>}
        <div className="final-review-actions"><button className="btn" onClick={saveReview}>Save review</button></div>
      </section>
      <aside className="transfer-state"><div className="transfer-head"><h2>Final transfer state</h2><span>Outgoing handover</span></div><div><span>Report state</span><b>{completion.ok ? 'Ready' : 'Review required'}</b></div><div><span>Submission</span><b>Not submitted</b></div><div><span>Incoming responsibility</span><b>Pending assignment</b></div><div><span>Acknowledgment</span><b>Not yet acknowledged</b></div></aside>
    </div>
    <section className="summary-carry-card">
      <div className="summary-card-head"><h2>Pending issues from previous shifts</h2><span>Carry-over register</span></div>
      <div className="summary-carry-list">
        {carriedPending.length === 0 ? <div className="summary-carry-empty"><strong>No responsibilities carried forward</strong><p>No pending items from previous shifts are assigned to this handover.</p></div> : carriedPending.map((item: any) => <div className="summary-carry-item" key={item.id}><div><strong>{item.catLabel || item.desc || 'Carried responsibility'}</strong><p>From {carryIssueOrigin(item)}</p></div><span>{labelFor(resolutionOptions, item.status || item.statusId)}</span></div>)}
      </div>
    </section>
  </main>
}
function carryIssueOrigin(item: any) {
  if (String(item.id || '').startsWith('carry-admin-')) return `Administrative issues - ${item.catLabel || 'Operational constraint'}`
  if (String(item.id || '').startsWith('carry-ops-')) return `Operations - ${labelFor(serviceAffectedOptions, item.affectedId)} / ${labelFor(opsIssueOptions, item.issueId)}`
  return item.catLabel ? `Administrative issues - ${item.catLabel}` : 'Previous-shift issue'
}
function eventAreaOptions(typeText?: string): [PatientArea, string][] {
  if (typeText === 'ER Code') return [['ER', 'ER']]
  if (typeText === 'Hospital Code') return [['IPD', 'IPD']]
  return [['ER', 'ER'], ['IPD', 'IPD'], ['OPD_EG', 'OPD EG'], ['OPD_KSA', 'OPD KSA']]
}
function ModalShell({ title, tone, onClose, children }: any) {
  return <div className="modal" role="dialog" aria-modal="true"><div className={`modal-content form-modal tone-${tone || 'default'}`}><div className="modal-title-row"><h3>{title}</h3><button className="icon-close" onClick={onClose} aria-label="Close">x</button></div>{children}</div></div>
}
function ExperiencePanel({ title, subtitle, children }: any) { return <section className="experience-card"><div className="experience-head"><div><h3>{title}</h3><small>{subtitle}</small></div></div><div className="experience-body">{children}</div></section> }
function SeverityBubbles({ value, onChange }: { value: Severity; onChange: (value: Severity) => void }) {
  return <Field label="Severity Level *"><div className="severity-bubbles">{severityOptions.map(([optionValue, optionLabel]) => <button key={optionValue} className={`severity-bubble ${severityClass(optionValue)} ${String(value) === String(optionValue) ? 'active' : ''}`} onClick={() => onChange(optionValue as Severity)}>{optionLabel}</button>)}</div></Field>
}

function severityClass(value: string | number) {
  if (String(value) === '778000002') return 'major'
  if (String(value) === '778000001') return 'moderate'
  return 'low'
}

function PatientLookup({ area, label, value, onSelect }: { area: PatientArea; label: string; value: string; onSelect: (patient: { id: string; name: string; code: string; area: PatientArea }) => void }) {
  const [query, setQuery] = useState(value || '')
  const [matches, setMatches] = useState<any[]>([])

  useEffect(() => { setQuery(value || '') }, [value])

  async function change(next: string) {
    setQuery(next)
    setMatches(await searchPatients(area, next))
  }

  return <Field label={label}><div className="lookup-wrap"><input value={query} placeholder="Search by Name or MRN..." onChange={(e) => change(e.target.value)} onBlur={() => setTimeout(() => setMatches([]), 150)} />{matches.length > 0 && <div className="lookup-results">{matches.map((p) => <button className="lookup-item" key={p.id} onClick={() => { onSelect(p); setQuery(`${p.name}${p.code ? ` (${p.code})` : ''}`); setMatches([]) }}>{p.name || 'Unnamed Patient'} {p.code ? `- ${p.code}` : ''}</button>)}</div>}</div></Field>
}
function DashedEmpty({ text, variant }: { text: string; variant?: string }) { return <div className={`dashed-empty ${variant || ''}`}>{text}</div> }
function Submitted({ form, events, opsIssues, pendingItems, openReport, goHome }: any) {
  const majorEvents = events.filter((e: EventItem) => e.severity === '778000002')
  const outageNotice = opsIssues.some((o: OpsIssue) => ['778000000', '778000004'].includes(o.affectedId))
  return <main className="workflow-page submitted-page">
    <PageTitle step="08" eyebrow="Transfer Complete" title={`${form.shift} shift report submitted`} subtitle={`${labelFor(businessUnits, form.businessUnit)} - ${formatDate(form.reportDate)} - ${reportCode(form)}`} />
    <section className="submitted-hero">
      <div className="submitted-confirmation">
        <div className="submitted-check" aria-hidden="true">✓</div>
        <div>
          <small>Submission complete</small>
          <h2>Report sent for incoming acknowledgment</h2>
          <p>The outgoing handover has been submitted through the existing Duty Manager flow. No more data entry is required for this report.</p>
          <span className="submitted-receipt">Submitted report code: {reportCode(form)}</span>
        </div>
      </div>
      <div className="submitted-actions">
        <button className="btn primary" onClick={openReport}>View full report</button>
        <button className="btn" onClick={() => window.print()}>Download PDF</button>
        <button className="btn" onClick={goHome}>Home</button>
      </div>
    </section>

    <section className="submitted-grid">
      <div className="submitted-summary">
        <div><small>Hospital events</small><b>{events.length}</b></div>
        <div><small>Operations outages</small><b>{opsIssues.length}</b></div>
        <div><small>Pending issues</small><b>{pendingItems.length}</b></div>
      </div>
      <aside className="transfer-state submitted-state">
        <h2>Final transfer state</h2>
        <div><span>Report state</span><b>Submitted</b></div>
        <div><span>Incoming responsibility</span><b>Pending acknowledgment</b></div>
        <div><span>Report code</span><b>{reportCode(form)}</b></div>
      </aside>
    </section>

    <section className="submitted-notifications">
      <div className="section-header"><div><h2>Notifications</h2><p>Routing generated by the existing handover submission rules.</p></div></div>
      <div className="notification-list">
        <span>Incoming DM - report ready</span>
        {majorEvents.map((e: EventItem) => <span key={e.id}>Medical Director - {e.codeText} major event</span>)}
        {outageNotice && <span>Biomedical - Lab/Radiology outage</span>}
      </div>
    </section>
  </main>
}

function ReportModal({ bundle, close, acknowledge }: any) {
  const r = bundle.report || {}
  const flow = bundle.flow?.[0] || {}
  const flowEntries = bundle.flowEntries || []
  const reportShift = shiftFromValue(r.dma_shifttype)
  const isNightReport = reportShift === 'Night'
  return <div className="modal report-modal-backdrop"><div className="modal-content wide report-modal">
    <header className="report-modal-head">
      <div>
        <div className="eyebrow">Submitted handover report</div>
        <h2>{r.dma_name || 'Shift Report'}</h2>
        <p>{labelFor(businessUnits, r.dma_businessunit)} - {reportShift} - {formatDate(r.dma_reportdate)}</p>
      </div>
      <div className="report-print-meta" aria-label="Report details">
        <span><small>Business unit</small><b>{labelFor(businessUnits, r.dma_businessunit)}</b></span>
        <span><small>Shift</small><b>{reportShift}</b></span>
        <span><small>Report date</small><b>{formatDate(r.dma_reportdate)}</b></span>
        <span><small>Duty manager</small><b>{displayName(r)}</b></span>
        <span><small>Report state</small><b>{r.dma_dmacknowledgmenttimestamp ? 'Acknowledged' : 'Submitted'}</b></span>
        <span><small>Acknowledgment</small><b>{r.dma_dmacknowledgmenttimestamp ? formatDate(r.dma_dmacknowledgmenttimestamp) : 'Pending'}</b></span>
      </div>
      <button className="icon-close report-close" onClick={close} aria-label="Close">x</button>
    </header>

    <section className="report-modal-summary">
      <div><small>Patient flow</small><b>{bundle.flow.length}</b></div>
      <div><small>Hospital events</small><b>{bundle.events.length}</b></div>
      <div><small>Administrative</small><b>{bundle.admin.length}</b></div>
      <div><small>Operations</small><b>{bundle.ops.length}</b></div>
      <div><small>Experience</small><b>{bundle.experience.length}</b></div>
    </section>
    {bundle.loading && <div className="report-loading">Loading full report details...</div>}

    <section className="report-modal-body">
      <div className="report-modal-main">
        <section className="report-surface">
          <div className="surface-head"><h3>Executive summary</h3><p>Outgoing handover note</p></div>
          <p className="executive-note">{r.dma_hotissues || 'No hot issues recorded.'}</p>
        </section>

        <section className="report-surface">
          <div className="surface-head"><h3>Patient flow</h3><p>{bundle.flow.length} summary records attached</p></div>
          {bundle.flow.length === 0 ? <Empty title="No patient flow summary" text="No patient flow summary is attached to this handover." /> : <div className="report-detail-grid">
            <ReportMetric label="Staff coverage" value={formattedChoice(flow, 'dma_staffadequacy', staffOptions, 'Not recorded')} />
            <ReportMetric label="Total ER volume" value={flow.dma_ervolume ?? 0} />
            <ReportMetric label="ER admissions" value={flow.dma_eradmissions ?? 0} />
            <ReportMetric label="OPD admissions" value={flow.dma_opdadmissions ?? 0} />
            <ReportMetric label="Total admissions" value={flow.dma_admissions ?? 0} />
            <ReportMetric label="Planned discharges" value={flow.dma_planneddischarges ?? 0} />
            <ReportMetric label="Unplanned discharges" value={flow.dma_unplanneddischarges ?? 0} />
            <ReportMetric label="Total discharges" value={flow.dma_discharges ?? 0} />
            <ReportMetric label="Total OR cases" value={flow.dma_totalorcases ?? 0} />
            <ReportMetric label="Pre-op" value={flow.dma_preoperative ?? 0} />
            <ReportMetric label="Post-op" value={flow.dma_postoperative ?? 0} />
            <ReportMetric label="Postponed OR" value={flow.dma_postponedorcases ?? 0} />
            <ReportMetric label="Cancelled OR" value={flow.dma_cancelledorcases ?? 0} />
            <ReportMetric label="ER DAMA / retained" value={`${flow.dma_erdama ?? 0} / ${flow.dma_erdamaretention ?? 0}`} />
            <ReportMetric label="Inpatient DAMA / retained" value={`${flow.dma_inpdama ?? 0} / ${flow.dma_inpdamaretention ?? 0}`} />
            <ReportMetric label="Closed DAMA / retained" value={`${flow.dma_closeddama ?? 0} / ${flow.dma_closeddamaretention ?? 0}`} />
            {isNightReport && <ReportMetric label="INP utilization" value={`${flow.dma_inputilization ?? 0}%`} />}
            {isNightReport && <ReportMetric label="ICU utilization" value={`${flow.dma_icuutilization ?? 0}%`} />}
            {isNightReport && <ReportMetric label="CCU utilization" value={`${flow.dma_ccuutilization ?? 0}%`} />}
            {isNightReport && <ReportMetric label="PICU utilization" value={`${flow.dma_picuutilization ?? 0}%`} />}
            {isNightReport && <ReportMetric label="NICU utilization" value={`${flow.dma_nicuutilization ?? 0}%`} />}
            {isNightReport && <ReportMetric label="Stroke utilization" value={`${flow.dma_strokeutilization ?? 0}%`} />}
            <ReportMetric label="Shortfall summary" value={flow.dma_shortfallsummary || 'None'} wide />
            <ReportMetric label="Delayed discharge narrative" value={flow.dma_delayeddischargesnarrative || 'None'} wide />
            <ReportMetric label="Prolonged ER narrative" value={flow.dma_prolongedernarrative || 'None'} wide />
          </div>}
          {flowEntries.length > 0 && <div className="report-record-list nested"><div className="surface-subhead">DAMA / retention entries</div>{flowEntries.map((entry: any, index: number) => <article className="report-record" key={entry.dma_patientflowentryid || index}><div><strong>{entry.dma_name || entry.dma_erpatientname || entry.dma_ipdpatientsname || 'Patient flow entry'}</strong><p>{entry.dma_reason || 'No reason recorded.'} {entry.dma_actiontaken ? `Action: ${entry.dma_actiontaken}` : ''}</p></div><span className="status-token info">{entry.dma_erdama ? 'ER DAMA' : entry.dma_inpdama ? 'INP DAMA' : 'Flow entry'}</span></article>)}</div>}
        </section>

        {isNightReport && <section className="report-surface">
          <div className="surface-head"><h3>Night shift review</h3><p>Night-only handover fields</p></div>
          <div className="report-detail-grid night-report-grid">
            <ReportMetric label="Night medical meeting" value={reportChoiceLabel([['778000000', 'Done'], ['778000001', 'Not done']], r.dma_nightmedicalmeeting, 'Not recorded')} />
            <ReportMetric label="Meeting summary" value={r.dma_nightmedicalmeetingsummary || 'None'} wide />
          </div>
        </section>}

        <section className="report-surface">
          <div className="surface-head"><h3>Hospital events</h3><p>{bundle.events.length} records attached</p></div>
          {bundle.events.length === 0 ? <Empty title="No events logged" text="No hospital events are attached to this handover." /> : <div className="report-record-list">{bundle.events.map((e: any, index: number) => <article className="report-record" key={e.dma_hospitaleventid || index}><div><strong>{e.dma_name || e.dma_eventtypename || 'Hospital Event'}</strong><p><b>Description:</b> {e.dma_incidentdescription || 'Not recorded'}<br /><b>Immediate action:</b> {e.dma_immediateactionstaken || 'Not recorded'}<br /><b>Time:</b> {formatDate(e.dma_eventlogtimestamp || e.dma_eventtime)}</p></div><span className="status-token warning">{formattedChoice(e, 'dma_severitylevel', severityOptions, 'Logged')}</span></article>)}</div>}
        </section>

        <section className="report-surface">
          <div className="surface-head"><h3>Administrative issues</h3><p>{bundle.admin.length} records attached</p></div>
          {bundle.admin.length === 0 ? <Empty title="No administrative issues logged" text="No administrative issue entries are attached to this handover." /> : <div className="report-record-list">{bundle.admin.map((x: any, index: number) => <article className="report-record" key={x.dma_administrativeissueentryid || index}><div><strong>{x.dma_IssueID?.dma_name || x.dma_issueidname || x.dma_name || 'Administrative issue'}</strong><p><b>Description:</b> {x.dma_description || 'Not recorded'}<br /><b>Action taken:</b> {x.dma_actiontaken || 'Not recorded'}<br /><b>Pending details:</b> {x.dma_pendingissues || 'None'}</p></div><span className="status-token critical">{formattedChoice(x, 'dma_resolutionstatus', resolutionOptions, 'Pending')}</span></article>)}</div>}
        </section>

        <section className="report-surface">
          <div className="surface-head"><h3>Operations</h3><p>{bundle.ops.length} records attached</p></div>
          {bundle.ops.length === 0 ? <Empty title="No operations outages logged" text="No operations outage records are attached to this handover." /> : <div className="report-record-list">{bundle.ops.map((x: any, index: number) => <article className="report-record" key={x.dma_opeartionid || index}><div><strong>{x.dma_name || `${formattedChoice(x, 'dma_serviceaffected', serviceAffectedOptions, 'Service')} - ${formattedChoice(x, 'dma_typeofissue', opsIssueOptions, 'Issue')}`}</strong><p><b>Functionality:</b> {formattedChoice(x, 'dma_servicefunctionality', serviceFunctionalityOptions, 'Not recorded')}<br /><b>Service affected:</b> {formattedChoice(x, 'dma_serviceaffected', serviceAffectedOptions, 'Not recorded')}<br /><b>Issue type:</b> {formattedChoice(x, 'dma_typeofissue', opsIssueOptions, 'Not recorded')}<br /><b>Description:</b> {x.dma_descriptionofissue || 'Not recorded'}<br /><b>Pending details:</b> {x.dma_pendingissues || 'None'}</p></div><span className="status-token critical">{formattedChoice(x, 'dma_resolutionstatus', resolutionOptions, 'Pending')}</span></article>)}</div>}
        </section>

        <section className="report-surface">
          <div className="surface-head"><h3>Experience</h3><p>{bundle.experience.length} records attached</p></div>
          {bundle.experience.length === 0 ? <Empty title="No experience records logged" text="No patient experience or governance records are attached to this handover." /> : <div className="report-detail-grid experience-report-grid">{bundle.experience.map((x: any, index: number) => <Fragment key={x.dma_patientexperienceid || index}><ReportMetric label="Escalated complaints" value={x.dma_escalatedcomplaints ?? 0} /><ReportMetric label="Escalated OVRs" value={x.dma_escalatedovrs ?? 0} /><ReportMetric label="Government / regulatory visits" value={formattedChoice(x, 'dma_governmentalregulatoryvisits', governmentVisitOptions, 'No')} /><ReportMetric label="Complaint summary" value={x.dma_summaryofnewongoingcomplaints || 'None'} wide /><ReportMetric label="OVR summary" value={x.dma_summaryofnewovrs || 'None'} wide /><ReportMetric label="Authority findings" value={x.dma_authoritynamefindingssummary || 'None'} wide /></Fragment>)}</div>}
        </section>
      </div>

      <aside className="transfer-state report-transfer">
        <h2>Transfer state</h2>
        <div><span>Report state</span><b>{r.dma_dmacknowledgmenttimestamp ? 'Acknowledged' : 'Submitted'}</b></div>
        <div><span>Acknowledgment</span><b>{r.dma_dmacknowledgmenttimestamp ? formatDate(r.dma_dmacknowledgmenttimestamp) : 'Pending'}</b></div>
        <div><span>Duty Manager</span><b>{displayName(r)}</b></div>
      </aside>
    </section>

    <footer className="report-modal-actions">
      <button className="btn primary" onClick={acknowledge}>Acknowledge</button>
      <button className="btn" onClick={() => window.print()}>Download PDF</button>
      <button className="btn" onClick={close}>Close</button>
    </footer>
  </div></div>
}

function ReportMetric({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return <div className={`report-metric ${wide ? 'wide' : ''}`}><small>{label}</small><b>{value}</b></div>
}

function reportChoiceLabel(options: [string, string][], value: unknown, fallback = 'Not recorded') {
  if (value === null || value === undefined || value === '') return fallback
  const label = options.find(([key]) => String(key) === String(value))?.[1]
  return label || fallback
}

function formattedChoice(row: any, field: string, options: [string, string][], fallback = 'Not recorded') {
  return row?.[`${field}@OData.Community.Display.V1.FormattedValue`] || row?.[`${field}name`] || reportChoiceLabel(options, row?.[field], fallback)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: any) => void }) {
  return <Field label={label}><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></Field>
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Field label={label}><input type="number" min="0" value={value} onChange={(e) => onChange(Number(e.target.value))} /></Field>
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><strong>{title}</strong><span>{text}</span></div>
}

function PageTitle({ step, eyebrow, title, subtitle, action }: { step: string; eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <header className="page-title"><div><div className="eyebrow">{step} · {eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>
}

function CardList({ items, render, onDelete, onUpdate }: any) {
  if (!items?.length) return <Empty title="Nothing logged yet" text="Add an entry above." />
  return <div className="card-list">{items.map((item: any, index: number) => <div className="event-card" key={item.id || item.dma_hospitaleventid || item.dma_administrativeissueentryid || item.dma_opeartionid || index}>{onDelete && <button className="btn small danger icon-delete" aria-label="Delete item" title="Delete" onClick={() => onDelete(item.id)}>x</button>}{render(item)}{onUpdate && <button className="btn small update-card" onClick={() => onUpdate(item)}>Update</button>}</div>)}</div>
}









type HostUser = { id: string; name: string; upn: string; aadObjectId: string }

function reportPayload(source: FormState) {
  const payload: any = compact({
    dma_name: reportCode(source),
    dma_reportdate: source.reportDate ? new Date(source.reportDate).toISOString() : new Date().toISOString(),
    dma_businessunit: Number(source.businessUnit),
    dma_shifttype: shiftMap[source.shift],
    dma_reportstatus: 778000001,
    dma_hotissues: source.hotIssues || 'Draft Report initiated',
    dma_nightmedicalmeeting: source.shift === 'Night' ? Number(source.nightMedicalMeeting) : undefined,
    dma_nightmedicalmeetingsummary: source.shift === 'Night' ? source.nightSummary : undefined,
  })
  if (source.dmUserId) payload['dma_DutyManager@odata.bind'] = `/systemusers(${cleanId(source.dmUserId)})`
  return payload
}

async function persistGeneral(source: FormState, existingId: string) {
  const payload = reportPayload(source)
  if (existingId) {
    await Services.reports.update(cleanId(existingId), payload)
    return cleanId(existingId)
  }
  const created = unwrap<any>(await Services.reports.create(payload))
  const id = cleanId(created?.dma_handoverreportid || created?.id)
  if (!id) throw new Error('Dataverse did not return the new handover report ID.')
  return id
}

function patientFlowPayload(source: FormState, issues: AdminIssue[]) {
  return compact({
    dma_name: `${reportCode(source)} Flow`,
    dma_staffadequacy: Number(source.staffAdequacy), dma_ervolume: source.erVolume, dma_eradmissions: source.erAdmissions, dma_opdadmissions: source.opdAdmissions,
    dma_admissions: source.erAdmissions + source.opdAdmissions, dma_discharges: source.discharges, dma_planneddischarges: source.plannedDischarges, dma_unplanneddischarges: source.unplannedDischarges,
    dma_totalorcases: source.totalORCases, dma_preoperative: source.preoperative, dma_postoperative: source.postoperative, dma_postponedorcases: source.postponedORCases, dma_cancelledorcases: source.cancelledORCases,
    dma_erdama: source.erDama, dma_erdamaretention: source.erDamaRetention, dma_inpdama: source.inpDama, dma_inpdamaretention: source.inpDamaRetention,
    dma_closeddama: source.closedDama, dma_closeddamaretention: source.closedDamaRetention, dma_shortagetype: source.shortageTypes[0] ? Number(source.shortageTypes[0]) : undefined,
    dma_shortfallsummary: source.shortfallSummary, dma_inputilization: source.inpUtilization, dma_icuutilization: source.icuUtilization, dma_ccuutilization: source.ccuUtilization,
    dma_picuutilization: source.picuUtilization, dma_nicuutilization: source.nicuUtilization, dma_cxutilization: source.cxUtilization, dma_strokeutilization: source.strokeUtilization,
    dma_delayeddischargescount: issues.filter((x) => x.catLabel.toLowerCase().includes('discharge')).length,
    dma_delayeddischargesnarrative: source.delayedDischargesNarrative,
    dma_prolongederadmissionscount: issues.filter((x) => x.catLabel.toLowerCase().includes('admission')).length,
    dma_prolongedernarrative: source.prolongedERNarrative,
  })
}

async function persistFlow(source: FormState, issues: AdminIssue[], reportId: string, existingId: string) {
  if (!reportId) throw new Error('A handover report ID is required before patient flow can be saved.')
  const payload: any = patientFlowPayload(source, issues)
  if (existingId) {
    await Services.flow.update(cleanId(existingId), payload)
    return cleanId(existingId)
  }
  payload['dma_ReportID@odata.bind'] = `/dma_handoverreports(${cleanId(reportId)})`
  const created = unwrap<any>(await Services.flow.create(payload))
  const id = cleanId(created?.dma_patientflowsummaryid || created?.id)
  if (!id) throw new Error('Dataverse did not return the new patient-flow summary ID.')
  return id
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown error')
}

function resultId(result: unknown, primaryKey: string) {
  const record = unwrap<any>(result)
  const id = cleanId(record?.[primaryKey] || record?.id)
  if (!id) throw new Error(`Dataverse did not return ${primaryKey}.`)
  return id
}

async function getLoggedInUser(): Promise<HostUser> {
  const xrmUser = getXrmUser()
  if ((xrmUser.id || xrmUser.name) && !isAppPrincipalName(xrmUser.name)) return xrmUser

  try {
    const powerApps = await import('@microsoft/power-apps/app')
    const context = await powerApps.getContext()
    const contextUser = {
      id: '',
      name: context?.user?.fullName || '',
      upn: context?.user?.userPrincipalName || '',
      aadObjectId: cleanId(context?.user?.objectId || ''),
    }
    if (contextUser.name || contextUser.upn || contextUser.aadObjectId) return contextUser
  } catch (error) {
    console.warn('Power Apps context was not available', error)
  }

  const bridgeUser = getBridgeUser()
  if (bridgeUser.id || bridgeUser.name || bridgeUser.upn || bridgeUser.aadObjectId) return bridgeUser
  return xrmUser
}

function getXrmUser(): HostUser {
  const candidates: any[] = []
  try { candidates.push(window) } catch {}
  try { candidates.push(window.parent) } catch {}
  try { candidates.push(window.top) } catch {}

  for (const candidate of candidates) {
    try {
      const user = candidate?.Xrm?.Utility?.getGlobalContext?.()?.userSettings
      if (user?.userId || user?.userName) {
        return { id: cleanId(user.userId || ''), name: user.userName || '', upn: '', aadObjectId: '' }
      }
    } catch {}
  }

  return { id: '', name: '', upn: '', aadObjectId: '' }
}

function getBridgeUser(): HostUser {
  const candidates: any[] = []
  try { candidates.push(window) } catch {}
  try { candidates.push(window.parent) } catch {}
  try { candidates.push(window.top) } catch {}

  for (const candidate of candidates) {
    try {
      const pa = candidate?.powerAppsBridge || candidate?.Microsoft?.PowerApps
      const user = pa?.context?.user || pa?.context?.User || {}
      const name = user.userName || user.fullName || user.name || user.displayName || ''
      const id = cleanId(user.userId || user.systemUserId || user.id || '')
      const upn = user.userPrincipalName || user.email || user.mail || ''
      const aadObjectId = cleanId(user.objectId || user.aadObjectId || '')
      if (id || name || upn || aadObjectId) return { id, name, upn, aadObjectId }
    } catch {}
  }

  return { id: '', name: '', upn: '', aadObjectId: '' }
}

async function resolveSystemUser(hostUser: HostUser) {
  const select = ['fullname', 'systemuserid', 'domainname', 'internalemailaddress', 'azureactivedirectoryobjectid']
  const hostLooksLikeApp = isAppPrincipalName(hostUser.name) || isAppPrincipalName(hostUser.upn)
  const filters = [
    hostUser.id && !hostLooksLikeApp ? `systemuserid eq ${cleanId(hostUser.id)}` : '',
    hostUser.aadObjectId && !hostLooksLikeApp ? `azureactivedirectoryobjectid eq ${cleanId(hostUser.aadObjectId)}` : '',
    hostUser.upn && !hostLooksLikeApp ? `internalemailaddress eq '${escapeOData(hostUser.upn)}'` : '',
    hostUser.upn && !hostLooksLikeApp ? `domainname eq '${escapeOData(hostUser.upn)}'` : '',
    hostUser.name && !hostLooksLikeApp ? `fullname eq '${escapeOData(hostUser.name)}'` : '',
  ].filter(Boolean)

  for (const filter of filters) {
    const xrmUser = await retrieveSystemUserViaXrm(filter).catch((error) => {
      console.warn(`Xrm systemuser lookup failed for ${filter}`, error)
      return null
    })
    if (xrmUser?.systemuserid) return xrmUser

    try {
      const users = list(await Services.users.getAll({ select, filter, top: 1 } as any))
      if (users[0]?.systemuserid) return users[0]
    } catch (error) {
      console.warn(`Systemuser lookup failed for ${filter}`, error)
    }
  }

  return null
}

function escapeOData(value: string) {
  return value.replace(/'/g, "''")
}

function isAppPrincipalName(value: string) {
  return /\b(appagents|s2s|application|service principal|prod application)\b/i.test(value)
}

function getXrmWebApi() {
  const candidates: any[] = []
  try { candidates.push(window) } catch {}
  try { candidates.push(window.parent) } catch {}
  try { candidates.push(window.top) } catch {}
  for (const candidate of candidates) {
    try {
      if (candidate?.Xrm?.WebApi) return candidate.Xrm.WebApi
    } catch {}
  }
  return null
}

async function retrieveHandoverReportsViaXrm(filterValue = 'all') {
  const api = getXrmWebApi()
  if (!api) return []
  let query = '?$select=dma_handoverreportid,dma_name,dma_reportdate,dma_shifttype,createdon,dma_businessunit,dma_dmacknowledgmenttimestamp,_dma_dutymanager_value&$top=100&$orderby=createdon desc'
  if (filterValue !== 'all') query += `&$filter=dma_businessunit eq ${filterValue}`
  const result = await api.retrieveMultipleRecords('dma_handoverreport', query)
  return result?.entities || []
}

async function retrievePreviousSameBuReport(form: FormState, currentReportId?: string) {
  if (!form.businessUnit || !form.reportDate) return null
  const api = getXrmWebApi()
  const currentDate = new Date(form.reportDate)
  const cleanCurrentId = cleanId(currentReportId || '')
  const beforeFilter = Number.isNaN(currentDate.getTime()) ? '' : ` and dma_reportdate lt ${currentDate.toISOString()}`
  const excludeCurrent = cleanCurrentId ? ` and dma_handoverreportid ne ${cleanCurrentId}` : ''
  const filter = `dma_businessunit eq ${form.businessUnit}${beforeFilter}${excludeCurrent}`

  if (api) {
    const query = `?$select=dma_handoverreportid,dma_name,dma_reportdate,dma_shifttype,createdon,dma_businessunit,dma_dmacknowledgmenttimestamp,_dma_dutymanager_value&$filter=${filter}&$orderby=dma_reportdate desc,createdon desc&$top=1`
    const result = await api.retrieveMultipleRecords('dma_handoverreport', query)
    return result?.entities?.[0] || null
  }

  const result = await Services.reports.getAll({
    select: ['dma_handoverreportid', 'dma_name', 'dma_reportdate', 'dma_shifttype', 'createdon', 'dma_businessunit', 'dma_dmacknowledgmenttimestamp', '_dma_dutymanager_value'],
    filter,
    orderBy: ['dma_reportdate desc', 'createdon desc'],
    top: 1,
  } as any)
  return list(result)[0] || null
}

async function retrieveCarryForwardItems(previousReportId: string) {
  const report = cleanId(previousReportId)
  if (!report) return []
  const api = getXrmWebApi()
  let adminRows: any[] = []
  let opsRows: any[] = []

  if (api) {
    const [admin, ops] = await Promise.all([
      api.retrieveMultipleRecords('dma_administrativeissueentry', `?$filter=_dma_reportid_value eq ${report}&$expand=dma_IssueID($select=dma_administrativeissueid,dma_name)`),
      api.retrieveMultipleRecords('dma_opeartion', `?$filter=_dma_reportid_value eq ${report}`),
    ])
    adminRows = admin?.entities || []
    opsRows = ops?.entities || []
  } else {
    const [admin, ops] = await Promise.all([
      Services.adminEntries.getAll({ filter: `_dma_reportid_value eq ${report}` } as any),
      Services.ops.getAll({ filter: `_dma_reportid_value eq ${report}` } as any),
    ])
    adminRows = list(admin)
    opsRows = list(ops)
  }

  const unresolvedAdmin = adminRows
    .filter((row) => String(row.dma_resolutionstatus || '') !== '778000001')
    .map((row) => {
      const sourceId = row.dma_administrativeissueentryid || row.id || `admin-${row.dma_name || Date.now()}`
      return {
        id: `prev-admin-${sourceId}`,
        targetId: `carry-admin-${cleanId(sourceId)}`,
        kind: 'admin',
        title: row.dma_IssueID?.dma_name || row.dma_issueidname || row.dma_name || 'Administrative issue',
        description: row.dma_description || row.dma_pendingissues || row.dma_actiontaken || '',
        action: row.dma_actiontaken || '',
        pending: row.dma_pendingissues || '',
        status: String(row.dma_resolutionstatus || '778000000'),
        age: 'Previous shift',
      }
    })

  const unresolvedOps = opsRows
    .filter((row) => String(row.dma_resolutionstatus || '') !== '778000001')
    .map((row) => {
      const sourceId = row.dma_opeartionid || row.id || `ops-${row.dma_name || Date.now()}`
      return {
        id: `prev-ops-${sourceId}`,
        targetId: `carry-ops-${cleanId(sourceId)}`,
        kind: 'ops',
        title: row.dma_name || `${labelFor(serviceAffectedOptions, row.dma_serviceaffected)} - ${labelFor(opsIssueOptions, row.dma_typeofissue)}`,
        description: row.dma_descriptionofissue || row.dma_pendingissues || '',
        pending: row.dma_pendingissues || '',
        status: String(row.dma_resolutionstatus || '778000000'),
        funcId: String(row.dma_servicefunctionality || '778000000'),
        affectedId: String(row.dma_serviceaffected || '778000000'),
        issueId: String(row.dma_typeofissue || '778000000'),
        age: 'Previous shift',
      }
    })

  return [...unresolvedAdmin, ...unresolvedOps]
}

async function acknowledgeHandoverReport(id: string, timestamp: string) {
  const payload = { dma_dmacknowledgmenttimestamp: timestamp, statecode: 1, statuscode: 2 } as any
  const api = getXrmWebApi()
  if (api) {
    await api.updateRecord('dma_handoverreport', cleanId(id), payload)
    return
  }
  await Services.reports.update(cleanId(id), payload)
}

async function retrieveReportBundleViaXrm(id: string): Promise<ReportBundle | null> {
  const api = getXrmWebApi()
  if (!api) return null
  const clean = cleanId(id)
  const [report, flow, events, admin, ops, experience] = await Promise.all([
    api.retrieveRecord('dma_handoverreport', clean, '?$select=dma_handoverreportid,dma_name,dma_reportdate,dma_businessunit,dma_shifttype,dma_hotissues,dma_nightmedicalmeeting,dma_nightmedicalmeetingsummary,dma_dmacknowledgmenttimestamp,_dma_dutymanager_value&$expand=dma_DutyManager($select=fullname)'),
    api.retrieveMultipleRecords('dma_patientflowsummary', `?$filter=_dma_reportid_value eq ${clean}`),
    api.retrieveMultipleRecords('dma_hospitalevent', `?$filter=_dma_reportid_value eq ${clean}`),
    api.retrieveMultipleRecords('dma_administrativeissueentry', `?$filter=_dma_reportid_value eq ${clean}&$expand=dma_IssueID($select=dma_administrativeissueid,dma_name)`),
    api.retrieveMultipleRecords('dma_opeartion', `?$filter=_dma_reportid_value eq ${clean}`),
    api.retrieveMultipleRecords('dma_patientexperience', `?$filter=_dma_reportid_value eq ${clean}`),
  ])
  const flowRows = flow?.entities || []
  const flowId = cleanId(flowRows[0]?.dma_patientflowsummaryid || '')
  const flowEntries = flowId ? await api.retrieveMultipleRecords('dma_patientflowentry', `?$filter=_dma_patientflow_value eq ${flowId}`).catch(() => ({ entities: [] })) : { entities: [] }
  return {
    report,
    flow: flowRows,
    flowEntries: flowEntries?.entities || [],
    events: events?.entities || [],
    admin: admin?.entities || [],
    ops: ops?.entities || [],
    experience: experience?.entities || [],
  }
}

async function retrieveFlowCensusViaXrm(id: string): Promise<Partial<FormState>> {
  const api = getXrmWebApi()
  if (!api) return {}
  const clean = cleanId(id)
  const fromRow = (row: any): Partial<FormState> => {
    const erAdmissions = toNumeric(row?.dma_eradmissions)
    const opdAdmissions = toNumeric(row?.dma_opdadmissions)
    const patch: Partial<FormState> = {}
    if (row?.dma_ervolume !== undefined && row?.dma_ervolume !== null) patch.erVolume = toNumeric(row.dma_ervolume)
    if (row?.dma_eradmissions !== undefined && row?.dma_eradmissions !== null) patch.erAdmissions = erAdmissions
    if (row?.dma_opdadmissions !== undefined && row?.dma_opdadmissions !== null) patch.opdAdmissions = opdAdmissions
    if (row?.dma_admissions !== undefined && row?.dma_admissions !== null) patch.admissions = toNumeric(row.dma_admissions)
    return patch
  }

  try {
    const report = await api.retrieveRecord('dma_handoverreport', clean, '?$select=dma_ervolume,dma_eradmissions,dma_opdadmissions,dma_admissions')
    const patch = fromRow(report)
    if (Object.keys(patch).length) return patch
  } catch (error) {
    console.warn('Handover report census refresh failed, trying patient flow summary', error)
  }

  try {
    const flow = await api.retrieveMultipleRecords('dma_patientflowsummary', `?$filter=_dma_reportid_value eq ${clean}&$top=1&$orderby=createdon desc`)
    return fromRow(flow?.entities?.[0])
  } catch (error) {
    console.warn('Patient flow summary census refresh failed', error)
    return {}
  }
}

async function retrieveTotalDischargesViaXrm(form: FormState): Promise<number | null> {
  const api = getXrmWebApi()
  if (!api || !form.reportDate) return null
  const range = shiftWindow(form.reportDate, form.shift)
  if (!range) return null
  try {
    const result = await api.retrieveMultipleRecords('crad2_patientdischarge', `?$select=crad2_patientdischargeid&$filter=crad2_dischargedate ge ${range.start} and crad2_dischargedate lt ${range.end}`)
    return result?.entities?.length ?? null
  } catch (error) {
    console.warn('Total discharges refresh failed', error)
    return null
  }
}

function targetDischargeDate(reportDate: string) {
  if (!reportDate) return ''
  const base = new Date(reportDate)
  if (Number.isNaN(base.getTime())) return ''
  base.setDate(base.getDate() + 1)
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`
}

async function syncEarlyDischargesViaXrm(reportDate: string): Promise<{ masterId: string; rows: EarlyDischarge[] }> {
  const api = getXrmWebApi()
  const targetDate = targetDischargeDate(reportDate)
  if (!api || !targetDate) return { masterId: '', rows: [] }
  const masterResult = await api.retrieveMultipleRecords('and_earlydischarge', `?$select=and_earlydischargeid,and_name,and_dischargedate,and_statusnew&$filter=and_dischargedate eq '${targetDate}' and and_statusnew eq 0&$top=1`)
  const master = masterResult?.entities?.[0]
  const masterId = cleanId(master?.and_earlydischargeid || '')
  if (!masterId) return { masterId: '', rows: [] }
  const childResult = await api.retrieveMultipleRecords('and_earlydischarge_ipdvisits', `?$select=and_earlydischarge_ipdvisitsid,and_name,and_dischargetype,and_cancellationreason,_and_patientcode_value&$filter=_and_earlydischarge_value eq ${masterId}&$expand=and_PatientCode($select=and_name,and_patientname)`)
  const rows = (childResult?.entities || []).map((child: any) => ({
    id: child.and_earlydischarge_ipdvisitsid,
    area: 'IPD' as PatientArea,
    name: child.and_PatientCode?.and_patientname || child.and_name || 'Early/Planned Discharge',
    code: child.and_PatientCode?.and_name || '',
    patientId: child._and_patientcode_value || '',
    type: child.and_dischargetype === 1 ? 'Early' : 'Planned',
    reason: child.and_cancellationreason || '',
  }))
  return { masterId, rows }
}

async function createEarlyDischargeViaXrm(masterId: string, draft: { type: EarlyDischarge['type']; patientCode: string; reason: string }): Promise<EarlyDischarge> {
  const api = getXrmWebApi()
  if (!api) throw new Error('Dataverse is not available for early discharge entry.')
  const patient = await findInpatientByCodeViaXrm(draft.patientCode)
  if (!patient?.and_inpatientlistid) throw new Error('No inpatient was found for that patient code.')
  const payload = compact({
    and_dischargetype: draft.type === 'Early' ? 1 : 2,
    and_name: patient.and_patientname || patient.and_name || 'Early/Planned Discharge',
    and_cancellationreason: draft.reason,
    'and_PatientCode@odata.bind': `/and_inpatientlists(${cleanId(patient.and_inpatientlistid)})`,
    'and_EarlyDischarge@odata.bind': `/and_earlydischarges(${cleanId(masterId)})`,
  })
  const created = await api.createRecord('and_earlydischarge_ipdvisits', payload)
  return {
    id: created?.id || created?.and_earlydischarge_ipdvisitsid || `local-ed-${Date.now()}`,
    area: 'IPD',
    name: patient.and_patientname || patient.and_name || 'Early/Planned Discharge',
    code: patient.and_name || draft.patientCode.trim(),
    patientId: patient.and_inpatientlistid,
    type: draft.type,
    reason: draft.reason,
  }
}

async function deleteEarlyDischargeViaXrm(id: string) {
  const api = getXrmWebApi()
  if (!api) throw new Error('Dataverse is not available for early discharge delete.')
  await api.deleteRecord('and_earlydischarge_ipdvisits', cleanId(id))
}

async function findInpatientByCodeViaXrm(code: string) {
  const api = getXrmWebApi()
  if (!api) return null
  const safe = escapeOData(code.trim())
  const result = await api.retrieveMultipleRecords('and_inpatientlist', `?$select=and_inpatientlistid,and_name,and_patientname&$filter=and_name eq '${safe}'&$top=1`)
  return result?.entities?.[0] || null
}

async function triggerEarlyDischargeRollup(masterId: string) {
  const clean = cleanId(masterId)
  if (!clean) return
  const candidates: any[] = []
  try { candidates.push(window) } catch {}
  try { candidates.push(window.parent) } catch {}
  try { candidates.push(window.top) } catch {}
  const context = candidates.map((candidate) => {
    try { return candidate?.Xrm?.Utility?.getGlobalContext?.() } catch { return null }
  }).find(Boolean)
  const clientUrl = context?.getClientUrl?.()
  if (!clientUrl) return
  const endpoint = `${clientUrl}/api/data/v9.0/CalculateRollupField(Target=@tid,FieldName=@fn)?@tid={'@odata.id':'and_earlydischarges(${clean})'}&@fn='crda1_countofpatients'`
  await fetch(endpoint, { method: 'GET', headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' }, credentials: 'same-origin' }).catch((error) => {
    console.warn('Early discharge rollup calculation failed', error)
  })
}

function shiftWindow(reportDate: string, shift: Shift) {
  const base = new Date(reportDate)
  if (Number.isNaN(base.getTime())) return null
  const start = new Date(base)
  const end = new Date(base)
  if (shift === 'Morning') {
    start.setHours(8, 0, 0, 0)
    end.setHours(16, 0, 0, 0)
  } else if (shift === 'Evening') {
    start.setHours(16, 0, 0, 0)
    end.setDate(end.getDate() + 1)
    end.setHours(0, 0, 0, 0)
  } else {
    start.setHours(20, 0, 0, 0)
    end.setDate(end.getDate() + 1)
    end.setHours(8, 0, 0, 0)
  }
  return { start: toDataverseLocalDateTime(start), end: toDataverseLocalDateTime(end) }
}

function toDataverseLocalDateTime(value: Date) {
  const pad = (input: number) => String(input).padStart(2, '0')
  const offsetMin = value.getTimezoneOffset()
  const sign = offsetMin <= 0 ? '+' : '-'
  const offsetAbs = Math.abs(offsetMin)
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}${sign}${pad(Math.floor(offsetAbs / 60))}:${pad(offsetAbs % 60)}`
}

function toNumeric(value: any) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

async function retrieveSystemUserViaXrm(filter: string) {
  const api = getXrmWebApi()
  if (!api) return null
  const query = `?$select=fullname,systemuserid,domainname,internalemailaddress,azureactivedirectoryobjectid&$filter=${filter}&$top=1`
  const result = await api.retrieveMultipleRecords('systemuser', query)
  return result?.entities?.[0] || null
}

function patientSchema(area: PatientArea) {
  if (area === 'ER') return { service: Services.erVisits, select: ['cr301_ervisitsid', 'cr301_patienttext', 'cr301_patientcode', 'cr301_newcolumn'], name: 'cr301_patienttext', code: 'cr301_patientcode', id: 'cr301_ervisitsid', bind: 'dma_ERPatient@odata.bind', set: 'cr301_ervisitses' }
  if (area === 'IPD') return { service: Services.ipdPatients, select: ['ipd_patientid', 'ipd_patientname', 'ipd_patientcode', 'ipd_name'], name: 'ipd_patientname', code: 'ipd_patientcode', id: 'ipd_patientid', bind: 'dma_IPDPatients@odata.bind', set: 'ipd_patients' }
  if (area === 'OPD_KSA') return { service: Services.ksaPatients, select: ['opd_ksapatientsid', 'opd_name', 'opd_patientcode', 'opd_patientname'], name: 'opd_patientname', code: 'opd_patientcode', id: 'opd_ksapatientsid', bind: 'dma_OPDPatientKSA@odata.bind', set: 'opd_ksapatientses' }
  return { service: Services.opdPatients, select: ['opd_patientid', 'opd_patientname', 'opd_patientcode', 'opd_name'], name: 'opd_patientname', code: 'opd_patientcode', id: 'opd_patientid', bind: 'dma_OPDPatientEG@odata.bind', set: 'opd_patients' }
}

async function searchPatients(area: PatientArea, value: string) {
  if (value.trim().length < 2) return []
  const schema = patientSchema(area)
  const safe = escapeOData(value.trim())
  const filter = `contains(${schema.name}, '${safe}') or contains(${schema.code}, '${safe}')`
  try {
    const result = await schema.service.getAll({ select: schema.select, filter, top: 10 } as any)
    return list(result).map((row: any) => ({ id: row[schema.id], name: row[schema.name] || row.cr301_newcolumn || row.ipd_name || row.opd_name || '', code: row[schema.code] || '', area }))
  } catch (error) {
    console.warn('Patient lookup failed', error)
    return []
  }
}

function applyPatientBind(payload: any, area?: PatientArea, id?: string) {
  if (!area || !id) return payload
  const schema = patientSchema(area)
  payload[schema.bind] = `/${schema.set}(${cleanId(id)})`
  return payload
}

