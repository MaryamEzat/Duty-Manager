import { useEffect, useMemo, useState } from 'react'
import {
  adminFallbackOptions, businessUnits, labelFor, resolutionOptions, serviceAffectedOptions, serviceFunctionalityOptions,
  opsIssueOptions, Services, severityOptions, shiftFromValue, shiftMap, staffOptions, shortageOptions,
  type AdminIssue, type DamaEntry, type DraftRecord, type EarlyDischarge, type EventItem, type FormState, type MainView, type OpsIssue, type PatientArea, type Resolution, type Severity, type Shift, type TabKey,
} from './data'
import { cleanId, compact, displayName, fallbackAlerts, formatDate, getDrafts, initialForm, list, reportCode, shortDate, shortTime, unwrap, validate } from './utils'

type AlertRow = { id: string; title: string; description: string; severity: string; isRead: boolean; createdOn?: string; reportId?: string }

type ReportBundle = { report: any; flow: any[]; events: any[]; admin: any[]; ops: any[]; experience: any[] }

export function DutyManager() {
  const [view, setView] = useState<MainView>('home')
  const [tab, setTab] = useState<TabKey>('general')
  const [form, setForm] = useState<FormState>(initialForm)
  const [draftId, setDraftId] = useState('')
  const [reportId, setReportId] = useState('')
  const [flowSummaryId, setFlowSummaryId] = useState('')
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

  const discharges = form.plannedDischarges + form.unplannedDischarges
  const filteredReports = useMemo(() => reportFilter === 'all' ? reports : reports.filter((r) => String(r.dma_businessunit) === reportFilter), [reports, reportFilter])
  const pagedReports = useMemo(() => filteredReports.slice((reportPage - 1) * 5, reportPage * 5), [filteredReports, reportPage])
  const totalReportPages = Math.max(1, Math.ceil(filteredReports.length / 5))
  const pendingItems = useMemo(() => [...adminIssues.filter((x) => x.status !== '778000001'), ...opsIssues.filter((x) => x.statusId !== '778000001')], [adminIssues, opsIssues])
  const completion = useMemo(() => validate(form, events, adminIssues, opsIssues, damaEntries), [form, events, adminIssues, opsIssues, damaEntries])

  useEffect(() => {
    loadStartup()
  }, [])

  useEffect(() => {
    if (view === 'home') loadHomeReports()
  }, [reportFilter])

  useEffect(() => {
    if (view === 'report' && !busy) saveDraft(false)
  }, [form, events, adminIssues, opsIssues, damaEntries, earlyDischarges, view])

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

  function startShift() {
    const nextForm = { ...initialForm(), dmName: form.dmName, dmUserId: form.dmUserId }
    const nextDraftId = String(Date.now())
    setForm(nextForm)
    setEvents([])
    setAdminIssues([])
    setOpsIssues([])
    setDamaEntries([])
    setEarlyDischarges([])
    setReportId('')
    setFlowSummaryId('')
    setDraftId(nextDraftId)
    writeDraft({ form: nextForm, draftId: nextDraftId, reportId: '', flowSummaryId: '', events: [], adminIssues: [], opsIssues: [], damaEntries: [], earlyDischarges: [] }, true)
    setView('report')
    setTab('general')
  }

  function writeDraft(snapshot: { form: FormState; draftId: string; reportId: string; flowSummaryId: string; events: EventItem[]; adminIssues: AdminIssue[]; opsIssues: OpsIssue[]; damaEntries: DamaEntry[]; earlyDischarges: EarlyDischarge[] }, refresh = true) {
    const draft: DraftRecord = { ...snapshot.form, draftId: snapshot.draftId, reportId: snapshot.reportId, flowSummaryId: snapshot.flowSummaryId, events: snapshot.events, adminIssues: snapshot.adminIssues, opsIssues: snapshot.opsIssues, damaEntries: snapshot.damaEntries, earlyDischarges: snapshot.earlyDischarges, timestamp: new Date().toLocaleString() }
    localStorage.setItem(`dm_handover_draft_${snapshot.draftId}`, JSON.stringify(draft))
    if (refresh) setDrafts(getDrafts())
  }

  function saveDraft(refresh = true) {
    if (view !== 'report') return
    const id = draftId || String(Date.now())
    if (!draftId) setDraftId(id)
    writeDraft({ form, draftId: id, reportId, flowSummaryId, events, adminIssues, opsIssues, damaEntries, earlyDischarges }, refresh)
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
      const payload: any = compact({
        dma_name: reportCode(form),
        dma_reportdate: form.reportDate ? new Date(form.reportDate).toISOString() : new Date().toISOString(),
        dma_businessunit: Number(form.businessUnit),
        dma_shifttype: shiftMap[form.shift],
        dma_hotissues: form.hotIssues || 'Draft Report initiated',
        dma_nightmedicalmeeting: form.shift === 'Night' ? Number(form.nightMedicalMeeting) : undefined,
        dma_nightmedicalmeetingsummary: form.shift === 'Night' ? form.nightSummary : undefined,
      })
      if (form.dmUserId) payload['dma_DutyManager@odata.bind'] = `/systemusers(${cleanId(form.dmUserId)})`
      if (reportId && !reportId.startsWith('local-')) {
        await Services.reports.update(cleanId(reportId), payload)
        setMessage('General information saved.')
        return reportId
      }
      const created = unwrap(await Services.reports.create(payload))
      const nextId = created?.dma_handoverreportid || created?.id || `local-${Date.now()}`
      setReportId(nextId)
      setMessage('General information saved.')
      return nextId
    } catch (error) {
      const fallbackId = reportId || `local-${Date.now()}`
      if (!reportId) setReportId(fallbackId)
      setMessage(`Saved as local draft. ${error instanceof Error ? error.message : ''}`)
      return fallbackId
    } finally {
      setBusy(false)
    }
  }

  async function saveFlow(currentReportId = reportId) {
    const payload: any = compact({
      dma_name: `${reportCode(form)} Flow`,
      dma_staffadequacy: Number(form.staffAdequacy), dma_ervolume: form.erVolume, dma_eradmissions: form.erAdmissions, dma_opdadmissions: form.opdAdmissions,
      dma_admissions: form.admissions, dma_discharges: discharges, dma_planneddischarges: form.plannedDischarges, dma_unplanneddischarges: form.unplannedDischarges,
      dma_totalorcases: form.totalORCases, dma_preoperative: form.preoperative, dma_postoperative: form.postoperative, dma_postponedorcases: form.postponedORCases, dma_cancelledorcases: form.cancelledORCases,
      dma_erdama: form.erDama, dma_erdamaretention: form.erDamaRetention, dma_inpdama: form.inpDama, dma_inpdamaretention: form.inpDamaRetention,
      dma_closeddama: form.closedDama, dma_closeddamaretention: form.closedDamaRetention, dma_shortagetype: form.shortageTypes[0] ? Number(form.shortageTypes[0]) : undefined,
      dma_shortfallsummary: form.shortfallSummary, dma_inputilization: form.inpUtilization, dma_icuutilization: form.icuUtilization, dma_ccuutilization: form.ccuUtilization,
      dma_picuutilization: form.picuUtilization, dma_nicuutilization: form.nicuUtilization, dma_cxutilization: form.cxUtilization, dma_strokeutilization: form.strokeUtilization,
      dma_delayeddischargescount: adminIssues.filter((x) => x.catLabel.toLowerCase().includes('discharge')).length,
      dma_delayeddischargesnarrative: form.delayedDischargesNarrative,
      dma_prolongederadmissionscount: adminIssues.filter((x) => x.catLabel.toLowerCase().includes('admission')).length,
      dma_prolongedernarrative: form.prolongedERNarrative,
    })
    if (currentReportId) payload['dma_ReportID@odata.bind'] = `/dma_handoverreports(${cleanId(currentReportId)})`
    if (flowSummaryId && !flowSummaryId.startsWith('local-')) {
      await Services.flow.update(cleanId(flowSummaryId), payload)
      return flowSummaryId
    }
    const created = unwrap(await Services.flow.create(payload))
    const id = created?.dma_patientflowsummaryid || created?.id || `local-flow-${Date.now()}`
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
      let id = reportId
      id = await saveGeneral()
      if (!id) id = reportId
      const flowId = await saveFlow(id)
      await Promise.all([
        Services.experience.create(compact({ dma_name: `${reportCode(form)} Experience`, dma_escalatedcomplaints: form.complaintsCount, dma_summaryofnewongoingcomplaints: form.complaintsSummary, dma_escalatedovrs: form.ovrsCount, dma_summaryofnewovrs: form.ovrsSummary, dma_governmentalregulatoryvisits: form.govVisit === 'Yes' ? 999740000 : 999740001, dma_authoritynamefindingssummary: form.govSummary, 'dma_ReportID@odata.bind': id ? `/dma_handoverreports(${cleanId(id)})` : undefined }) as any),
        ...events.map((e) => Services.events.create(compact(applyPatientBind({ dma_name: `${e.typeText} - ${e.codeText}`, dma_severitylevel: Number(e.severity), dma_incidentdescription: e.desc, dma_immediateactionstaken: e.actions, dma_eventlogtimestamp: new Date().toISOString(), 'dma_ReportID@odata.bind': id ? `/dma_handoverreports(${cleanId(id)})` : undefined, 'dma_EventType@odata.bind': e.typeId ? `/dma_eventtypes(${cleanId(e.typeId)})` : undefined, 'dma_EventCode@odata.bind': e.codeId ? `/dma_eventcodes(${cleanId(e.codeId)})` : undefined }, e.area, e.pId)) as any)),
        ...adminIssues.map((i) => Services.adminEntries.create(compact({ dma_name: i.catLabel, dma_description: i.desc, dma_actiontaken: i.action, dma_pendingissues: i.pendingDetails, dma_count: 1, dma_resolutionstatus: Number(i.status), 'dma_IssueID@odata.bind': i.catId ? `/dma_administrativeissues(${cleanId(i.catId)})` : undefined, 'dma_ReportID@odata.bind': id ? `/dma_handoverreports(${cleanId(id)})` : undefined }) as any)),
        ...opsIssues.map((o) => Services.ops.create(compact({ dma_name: `${labelFor(serviceAffectedOptions, o.affectedId)} - ${labelFor(opsIssueOptions, o.issueId)}`, dma_servicefunctionality: Number(o.funcId), dma_serviceaffected: Number(o.affectedId), dma_typeofissue: Number(o.issueId), dma_descriptionofissue: o.desc, dma_resolutionstatus: Number(o.statusId), dma_pendingissues: o.pendingDetails, 'dma_ReportID@odata.bind': id ? `/dma_handoverreports(${cleanId(id)})` : undefined }) as any)),
        ...damaEntries.map((d) => Services.flowEntries.create(compact(applyPatientBind({ dma_name: d.patientName || 'DAMA Patient', dma_erdama: d.damaType === 'ER' ? 1 : 0, dma_inpdama: d.damaType === 'INP' ? 1 : 0, dma_reason: d.reason, dma_actiontaken: d.actionTaken, 'dma_PatientFlow@odata.bind': flowId ? `/dma_patientflowsummaries(${cleanId(flowId)})` : undefined }, d.area || (d.damaType === 'ER' ? 'ER' : 'IPD'), d.pId)) as any)),
      ])
      if (id && !id.startsWith('local-')) await Services.reports.update(cleanId(id), { statecode: 1, statuscode: 2 } as any)
      if (draftId) localStorage.removeItem(`dm_handover_draft_${draftId}`)
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
    try {
      const clean = cleanId(id)
      const [report, flow, eventRows, admin, ops, experience] = await Promise.all([
        Services.reports.get(clean), Services.flow.getAll({ filter: `_dma_reportid_value eq ${clean}` }), Services.events.getAll({ filter: `_dma_reportid_value eq ${clean}` }),
        Services.adminEntries.getAll({ filter: `_dma_reportid_value eq ${clean}` }), Services.ops.getAll({ filter: `_dma_reportid_value eq ${clean}` }), Services.experience.getAll({ filter: `_dma_reportid_value eq ${clean}` }),
      ])
      setSelectedReport({ report: unwrap(report), flow: list(flow), events: list(eventRows), admin: list(admin), ops: list(ops), experience: list(experience) })
    } catch {
      const local = reports.find((x) => cleanId(x.dma_handoverreportid) === cleanId(id))
      setSelectedReport({ report: local, flow: [], events: [], admin: [], ops: [], experience: [] })
    }
  }

  async function acknowledgeReport() {
    const id = selectedReport?.report?.dma_handoverreportid
    if (!id) return
    try {
      await Services.reports.update(cleanId(id), { dma_dmacknowledgmenttimestamp: new Date().toISOString(), statecode: 1, statuscode: 2 } as any)
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

  return <div className="dm-app">
    <header className="top"><button className="brand" onClick={() => leaveReport('home')}><span>DM</span><strong>DM Handover System</strong><small>Production Environment</small></button><div className="view-switcher"><button className={view === 'home' ? 'active' : ''} onClick={() => leaveReport('home')}>Home</button><button className={view === 'dashboard' ? 'active' : ''} onClick={showDashboard}>Operations Dashboard</button></div><button className="alert-button" onClick={() => setAlertsOpen(true)}>Alerts <b>{alerts.filter((a) => !a.isRead).length}</b></button><div className="user-chip">{form.dmName || 'Loading User...'}</div></header>
    {message && <div className="toast" onClick={() => setMessage('')}>{message}</div>}
    {view === 'home' && <Home drafts={drafts} reports={pagedReports} reportFilter={reportFilter} setReportFilter={(value: string) => { setReportFilter(value); setReportPage(1) }} reportPage={reportPage} totalReportPages={totalReportPages} nextPage={() => setReportPage((p) => Math.min(totalReportPages, p + 1))} prevPage={() => setReportPage((p) => Math.max(1, p - 1))} startShift={startShift} openDraft={openDraft} deleteDraft={(id: string) => { localStorage.removeItem(`dm_handover_draft_${id}`); setDrafts(getDrafts()) }} openReport={openReport} />}
    {view === 'dashboard' && <Dashboard data={dashboard} refresh={showDashboard} />}
    {view === 'report' && <Editor state={{ form, updateForm, tab, setTab, busy, saveGeneral, submitReport, completion, discharges, events, setEvents, adminIssues, setAdminIssues, opsIssues, setOpsIssues, damaEntries, setDamaEntries, earlyDischarges, setEarlyDischarges, searchUsers, userMatches, setUserMatches, eventTypes, eventCodes, loadEventCodes, adminCatalog, pendingItems }} />}
    {view === 'submitted' && <Submitted form={form} events={events} opsIssues={opsIssues} pendingItems={pendingItems} openReport={() => reportId && openReport(reportId)} goHome={() => setView('home')} />}
    {alertsOpen && <AlertDrawer alerts={alerts} markAlertRead={markAlertRead} openReport={(id: string) => { openReport(id); setAlertsOpen(false) }} close={() => setAlertsOpen(false)} />}
    {selectedReport && <ReportModal bundle={selectedReport} close={() => setSelectedReport(null)} acknowledge={acknowledgeReport} />}
  </div>
}
function Home({ drafts, reports, reportFilter, setReportFilter, reportPage, totalReportPages, nextPage, prevPage, startShift, openDraft, deleteDraft, openReport }: any) {
  return <section className="card home-card">
    <div className="section-header">
      <h2>Handover Records</h2>
      <button className="btn primary" onClick={startShift}>+ Start Shift</button>
    </div>

    {drafts.length > 0 && <div className="draft-box compact-drafts">
      <h3>Unfinished Drafts Found</h3>
      {drafts.map((d: DraftRecord, index: number) => <div className={`record-row ${index === drafts.length - 1 ? 'last' : ''}`} key={d.draftId}>
        <div>
          <strong>BU: {labelFor(businessUnits, d.businessUnit)} - {d.shift || 'Morning'} Shift</strong>
          <span>Report Date: {formatDate(d.reportDate)}</span>
          <span>Last Modified: {d.timestamp}</span>
        </div>
        <div className="row-actions">
          <button className="btn danger small" onClick={() => deleteDraft(d.draftId)}>Delete</button>
          <button className="btn primary small" onClick={() => openDraft(d)}>Continue Report</button>
        </div>
      </div>)}
    </div>}

    <div className="filter-bar home-filter">
      <strong>Filter Submissions by<br />BU:</strong>
      <select value={reportFilter} onChange={(event) => setReportFilter(event.target.value)}>
        <option value="all">All Business Units</option>
        {businessUnits.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>

    <div className="recent-title">Recent Submissions</div>
    {reports.length === 0 ? <Empty title="No reports found." text="Start a new shift to begin." /> : <div className="records-list">
      {reports.map((r: any) => {
        const shift = shiftFromValue(r.dma_shifttype)
        const bu = labelFor(businessUnits, r.dma_businessunit)
        return <button className="report-row old-style" key={r.dma_handoverreportid} onClick={() => openReport(r.dma_handoverreportid)}>
          <div className="report-main">
            <div className="report-title-line">
              <strong>{shift} Shift - {shortDate(r.dma_reportdate)}</strong>
              <span className="bu-chip">{bu}</span>
              <span className="created-time">{shortTime(r.createdon)}</span>
            </div>
            <span>Duty Manager: {displayName(r)}</span>
          </div>
          <span className="review-pill">Review Report</span>
        </button>
      })}
      <div className="pager">
        <button className="btn" disabled={reportPage <= 1} onClick={prevPage}>Previous</button>
        <span>Page {reportPage}</span>
        <button className="btn" disabled={reportPage >= totalReportPages} onClick={nextPage}>Next</button>
      </div>
    </div>}
  </section>
}

function Dashboard({ data, refresh }: any) {
  const [dateFilter, setDateFilter] = useState(data?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10))
  const [shiftFilter, setShiftFilter] = useState(data?.shift || 'Morning')
  const [buFilter, setBuFilter] = useState('All')
  const visibleBus = (data?.bus || []).filter((b: any) => buFilter === 'All' || b.label === buFilter)
  const parsedDate = dateFilter ? new Date(dateFilter) : new Date()
  const dateText = parsedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return <section className="dashboard original-dashboard">
    <div>
      <div className="dashboard-meta-bar"><span>{shiftFilter.toUpperCase()} SHIFT - {dateText.toUpperCase()}</span><span>Last Updated: {data?.updated || 'Not loaded'}</span></div>
      <div className="dashboard-header-block"><div><h2>Group Operations Dashboard</h2><p>ASH - SMH - AMH - AHJ - {shiftFilter} shift - {dateText}</p></div></div>
    </div>

    <div className="dashboard-filter-card">
      <div className="dashboard-filter-group">
        <label>Date</label><input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        <label>Shift:</label><select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}><option>Morning</option><option>Evening</option><option>Night</option></select>
        <label>BU:</label><select value={buFilter} onChange={(e) => setBuFilter(e.target.value)}><option>All</option>{(data?.bus || []).map((b: any) => <option key={b.value}>{b.label}</option>)}</select>
      </div>
      <button className="btn primary" onClick={refresh}>Refresh Dashboard</button>
    </div>

    <div className="dashboard-kpi-grid">{(data?.metrics || []).map((m: any) => <div className={`dashboard-kpi ${m.alert ? 'alert' : m.warn ? 'warn' : ''}`} key={m.key}><div>{m.label}</div><strong>{m.value}</strong><small>{m.desc}</small></div>)}</div>

    <div className="dashboard-bu-grid">{visibleBus.map((b: any) => <div className={`bu-status-card ${b.status === 'unsubmitted' ? 'unsubmitted' : ''}`} key={b.value}><div className="bu-card-top"><div className="bu-card-info"><h3>{b.label}</h3><span>{shiftFilter} shift - {b.status === 'unsubmitted' ? 'Pending' : b.dm}</span></div><span className={`bu-status-badge ${b.status === 'acknowledged' ? 'green' : b.status === 'submitted' ? 'blue' : 'red'}`}>{b.statusLabel}</span></div>{b.status === 'unsubmitted' ? <div className="bu-sla-list"><div><span>Submission SLA</span><strong>{b.sla}</strong></div><div><span>Escalation sent</span><strong>{b.escalation}</strong></div></div> : <table className="bu-metrics-table"><tbody><tr><td>Report</td><td className="val">{b.report?.dma_name || 'Submitted'}</td></tr><tr><td>Incidents</td><td className="val">{b.report?.dma_majorincidents || '-'}</td></tr><tr><td>Admissions / Disc.</td><td className="val">{b.report?.dma_admissions || '-'}</td></tr><tr><td>Total ER Volume</td><td className="val">{b.report?.dma_ervolume || '-'}</td></tr><tr><td>INP Utilization</td><td className="val">{b.report?.dma_inputilization ? `${b.report.dma_inputilization}%` : '-'}</td></tr><tr><td>ER DAMA / Ret.</td><td className="val">{b.report?.dma_erdama ?? '-'}</td></tr><tr><td>Acknowledged</td><td className={`val ${b.status === 'acknowledged' ? 'good' : 'warn'}`}>{b.status === 'acknowledged' ? 'Acknowledged' : 'Pending'}</td></tr></tbody></table>}</div>)}</div>

    <div className="aging-board-card"><div className="aging-board-head"><div><h3>Administrative Aging Board</h3><p>Active unresolved issues pending resolution across all units</p></div><span>{data?.aging?.length ? `${data.aging.length} active escalations` : 'No immediate escalations'}</span></div><div className="aging-table-wrap"><table className="bu-metrics-table aging-table"><thead><tr><th>ISSUE</th><th>BU</th><th>CATEGORY</th><th>OWNER</th><th>AGE</th></tr></thead><tbody>{data?.aging?.length ? data.aging.map((row: any) => <tr key={row.id}><td>{row.issue}</td><td>{row.bu}</td><td>{row.category}</td><td>{row.owner}</td><td className="val warn">{row.age}</td></tr>) : <tr><td colSpan={5} className="empty-cell">No active unresolved issues.</td></tr>}</tbody></table></div></div>
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
    {active === 'general' && <GeneralTab form={state.form} updateForm={state.updateForm} saveGeneral={state.saveGeneral} searchUsers={state.searchUsers} userMatches={state.userMatches} setUserMatches={state.setUserMatches} />}
    {active === 'events' && <EventsTab events={state.events} setEvents={state.setEvents} eventTypes={state.eventTypes} eventCodes={state.eventCodes} loadEventCodes={state.loadEventCodes} />}
    {active === 'admin' && <AdminTab form={state.form} updateForm={state.updateForm} adminIssues={state.adminIssues} setAdminIssues={state.setAdminIssues} adminCatalog={state.adminCatalog} />}
    {active === 'flow' && <FlowTab form={state.form} updateForm={state.updateForm} discharges={state.discharges} damaEntries={state.damaEntries} setDamaEntries={state.setDamaEntries} earlyDischarges={state.earlyDischarges} setEarlyDischarges={state.setEarlyDischarges} />}
    {active === 'ops' && <OpsTab opsIssues={state.opsIssues} setOpsIssues={state.setOpsIssues} />}
    {active === 'experience' && <ExperienceTab form={state.form} updateForm={state.updateForm} />}
    {active === 'summary' && <SummaryTab form={state.form} updateForm={state.updateForm} completion={state.completion} pendingItems={state.pendingItems} submitReport={state.submitReport} busy={state.busy} />}
  </div>
}
function GeneralTab({ form, updateForm, saveGeneral, searchUsers, userMatches, setUserMatches }: any) {
  return <section className="card"><div className="section-header"><h2>General Information</h2><button className="btn primary" onClick={saveGeneral}>Save General</button></div><div className="grid"><Field label="Duty Manager"><div className="lookup-wrap"><input value={form.dmName} onChange={(e) => searchUsers(e.target.value)} onBlur={() => setTimeout(() => setUserMatches([]), 150)} />{userMatches.length > 0 && <div className="lookup-results">{userMatches.map((u: any) => <button className="lookup-item" key={u.systemuserid} onClick={() => { updateForm({ dmName: u.fullname, dmUserId: u.systemuserid }); setUserMatches([]) }}>{u.fullname}</button>)}</div>}</div></Field><SelectField label="Business Unit" value={form.businessUnit} options={businessUnits} onChange={(businessUnit: string) => updateForm({ businessUnit })} /><Field label="Report Date"><input type="datetime-local" value={form.reportDate} onChange={(e) => updateForm({ reportDate: e.target.value })} /></Field><Field label="Shift"><select value={form.shift} onChange={(e) => updateForm({ shift: e.target.value as Shift })}><option>Morning</option><option>Evening</option><option>Night</option></select></Field></div></section>
}

function EventsTab({ events, setEvents, eventTypes, eventCodes, loadEventCodes }: any) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<EventItem>({ id: '', typeId: '', typeText: '', codeId: '', codeText: '', severity: '778000001', desc: '', actions: '', area: 'ER', pName: '', pCode: '', pId: '' })
  const areaOptions = eventAreaOptions(draft.typeText)
  function reset() { setDraft({ id: '', typeId: '', typeText: '', codeId: '', codeText: '', severity: '778000001', desc: '', actions: '', area: 'ER', pName: '', pCode: '', pId: '' }) }
  function changeType(typeId: string) {
    const t = eventTypes.find((x: any) => x.dma_eventtypeid === typeId)
    const typeText = t?.dma_name || ''
    const nextArea = eventAreaOptions(typeText)[0][0]
    setDraft({ ...draft, typeId, typeText, codeId: '', codeText: '', area: nextArea, pName: '', pCode: '', pId: '' })
    loadEventCodes(typeId)
  }
  function save() { const item = { ...draft, id: `event-${Date.now()}`, typeText: draft.typeText || 'Event', codeText: draft.codeText || 'Code' }; setEvents([...events, item]); reset(); setAdding(false) }
  return <section className="card report-card section-events"><div className="section-header report-header"><div><h2>Hospital Events Dashboard</h2><p>Log critical codes, strokes, or patient safety incidents</p></div><div className="header-actions"><span className="section-bubble event">{events.length} Events Logged</span><button className="btn primary" onClick={() => setAdding(true)}>+ Add Event</button></div></div>
    {adding && <ModalShell title="Add Hospital Event" tone="event" onClose={() => setAdding(false)}><div className="grid report-grid two"><Field label="Critical Event Type *"><select value={draft.typeId} onChange={(e) => changeType(e.target.value)}><option value="">Select</option>{eventTypes.map((x: any) => <option key={x.dma_eventtypeid} value={x.dma_eventtypeid}>{x.dma_name}</option>)}</select></Field><Field label="Specific Code *"><select value={draft.codeId} onChange={(e) => { const c = eventCodes.find((x: any) => x.dma_eventcodeid === e.target.value); setDraft({ ...draft, codeId: e.target.value, codeText: c?.dma_name || '' }) }}><option value="">Select</option>{eventCodes.map((x: any) => <option key={x.dma_eventcodeid} value={x.dma_eventcodeid}>{x.dma_name}</option>)}</select></Field><SeverityBubbles value={draft.severity} onChange={(severity: Severity) => setDraft({ ...draft, severity })} /><Field label="Context (Area) *"><select value={draft.area || areaOptions[0][0]} onChange={(e) => setDraft({ ...draft, area: e.target.value as PatientArea, pName: '', pCode: '', pId: '' })}>{areaOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div><PatientLookup area={(draft.area || areaOptions[0][0]) as PatientArea} label="Patient Search *" value={draft.pName || ''} onSelect={(p) => setDraft({ ...draft, area: p.area, pName: p.name, pCode: p.code, pId: p.id })} /><Field label="Incident Description *"><textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="Details of the event..." /></Field><Field label="Immediate Actions Taken *"><textarea value={draft.actions} onChange={(e) => setDraft({ ...draft, actions: e.target.value })} placeholder="Steps taken to mitigate issue..." /></Field><div className="modal-actions"><button className="btn" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary" onClick={save}>Add Event</button></div></ModalShell>}
    <CardList items={events} tone="event" onDelete={(id: string) => setEvents(events.filter((x: EventItem) => x.id !== id))} render={(e: EventItem) => <><strong>{e.typeText} - {e.codeText}</strong><span className={`severity-pill ${severityClass(e.severity)}`}>{labelFor(severityOptions, e.severity)}</span>{e.pName && <small>{e.area}: {e.pName} {e.pCode ? `(${e.pCode})` : ''}</small>}<p>{e.desc}</p><small>{e.actions}</small></>} />
  </section>
}
function AdminTab({ form, updateForm, adminIssues, setAdminIssues, adminCatalog }: any) {
  const [draft, setDraft] = useState<AdminIssue>({ id: '', catId: adminCatalog[0]?.[0] || '', catLabel: adminCatalog[0]?.[1] || '', status: '778000000', desc: '', action: '', pendingDetails: '' })
  const [adding, setAdding] = useState(false)
  const delayed = adminIssues.filter((i: AdminIssue) => i.catLabel.toLowerCase().includes('discharge')).length
  const prolonged = adminIssues.filter((i: AdminIssue) => i.catLabel.toLowerCase().includes('admission')).length
  function save() { const catLabel = labelFor(adminCatalog, draft.catId); setAdminIssues([...adminIssues, { ...draft, id: `admin-${Date.now()}`, catLabel }]); setDraft({ ...draft, desc: '', action: '', pendingDetails: '' }); setAdding(false) }
  return <section className="card report-card section-admin"><div className="section-header report-header"><div><h2>Administrative Issues</h2><p>Log and track operational delays and administrative blockers</p></div><div className="header-actions"><span className="section-bubble admin">{adminIssues.length} Issues</span><button className="btn primary" onClick={() => setAdding(true)}>+ Add Issue</button></div></div>
    <div className="grid report-grid two admin-overview"><InfoPanel tone="admin" title="Delayed Patient Discharges" count={delayed} note="Count of patients where Clinical Discharge Time > 2 hours."><textarea value={form.delayedDischargesNarrative} onChange={(e) => updateForm({ delayedDischargesNarrative: e.target.value })} placeholder="Add narrative or context regarding the delays..." /></InfoPanel><InfoPanel tone="admin" title="Prolonged ER Admissions" count={prolonged} note="Count of ER patients where Triage to Admission Time > 2 hours."><textarea value={form.prolongedERNarrative} onChange={(e) => updateForm({ prolongedERNarrative: e.target.value })} placeholder="Add narrative or context regarding ER admission delays..." /></InfoPanel></div>
    {adding && <ModalShell title="Add Administrative Issue" tone="admin" onClose={() => setAdding(false)}><div className="grid report-grid two"><SelectField label="Issue Category *" value={draft.catId} options={adminCatalog} onChange={(catId: string) => setDraft({ ...draft, catId })} /><SelectField label="Resolution Status *" value={draft.status} options={resolutionOptions} onChange={(status: Resolution) => setDraft({ ...draft, status })} /></div><Field label="Description"><textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} /></Field><Field label="Action Taken"><textarea value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} /></Field>{draft.status !== '778000001' && <Field label="Summary / Pending Details *"><textarea value={draft.pendingDetails} onChange={(e) => setDraft({ ...draft, pendingDetails: e.target.value })} placeholder="Overall summary or pending action plan..." /></Field>}<div className="modal-actions"><button className="btn" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary" onClick={save}>Save Issue</button></div></ModalShell>}
    <div className="previous-placeholder admin-tone">No pending issues carried over from previous shifts.</div><div className="single-list">{adminIssues.length === 0 ? <DashedEmpty text="No administrative issues recorded yet." /> : <CardList items={adminIssues} tone="admin" onDelete={(id: string) => setAdminIssues(adminIssues.filter((x: AdminIssue) => x.id !== id))} render={(i: AdminIssue) => <><strong>{i.catLabel}</strong><span className="section-bubble admin light">{labelFor(resolutionOptions, i.status)}</span><p>{i.desc}</p><small><b>Summary/Pending:</b> {i.pendingDetails || i.action}</small></>} />}</div>
  </section>
}
function FlowTab({ form, updateForm, discharges, damaEntries, setDamaEntries, earlyDischarges, setEarlyDischarges }: any) {
  const [entry, setEntry] = useState<DamaEntry>({ id: '', damaType: 'ER', patientName: '', patientCode: '', reason: '', actionTaken: '' })
  const census = [['Total ER Volume *','erVolume'], ['ER Admissions *','erAdmissions'], ['OPD Admissions *','opdAdmissions'], ['Total Admissions *','admissions'], ['Planned Discharges *','plannedDischarges'], ['Unplanned Discharges *','unplannedDischarges'], ['Total Discharges','discharges']]
  const orMetrics = [['Total OR Cases *','totalORCases'], ['Preoperative *','preoperative'], ['Postoperative *','postoperative'], ['Postponed OR Cases *','postponedORCases'], ['Cancelled OR Cases *','cancelledORCases']]
  const util = [['Ward','inpUtilization','51 beds'], ['ICU','icuUtilization','21 beds'], ['CCU','ccuUtilization','6 beds'], ['PICU','picuUtilization','2 beds'], ['NICU','nicuUtilization','4 beds'], ['CPU','cxUtilization','0 beds'], ['Stroke','strokeUtilization','0 beds']]
  function addEntry(type: DamaEntry['damaType']) { setDamaEntries([...damaEntries, { ...entry, damaType: type, id: `dama-${Date.now()}` }]); setEntry({ id: '', damaType: type, patientName: '', patientCode: '', reason: '', actionTaken: '' }) }
  function addEarlyDischarge() { setEarlyDischarges([...earlyDischarges, { id: `ed-${Date.now()}`, area: 'IPD', name: '', code: '', patientId: '', type: 'Planned', reason: '' }]) }
  function updateEarlyDischarge(id: string, patch: Partial<EarlyDischarge>) { setEarlyDischarges(earlyDischarges.map((item: EarlyDischarge) => item.id === id ? { ...item, ...patch } : item)) }
  return <section className="card report-card section-flow"><div className="section-header report-header"><div><h2>Patient Flow & Census Metrics</h2><p>Census, DAMA, discharge planning, and utilization</p></div><span className="section-bubble flow">{discharges} Discharges</span></div>
    <Field label="Staff Adequacy *"><select value={form.staffAdequacy} onChange={(e) => updateForm({ staffAdequacy: e.target.value })}>{staffOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    {form.staffAdequacy === '778000000' && <div className="staff-shortage-box"><Field label="Coverage Shortage *"><div className="bubble-row">{shortageOptions.map(([value, label]) => <button key={value} className={`shortage-bubble ${form.shortageTypes.includes(value) ? 'active' : ''}`} onClick={() => updateForm({ shortageTypes: form.shortageTypes.includes(value) ? form.shortageTypes.filter((x: string) => x !== value) : [...form.shortageTypes, value] })}>{label}</button>)}</div></Field><Field label="Shortfall Summary *"><textarea value={form.shortfallSummary} onChange={(e) => updateForm({ shortfallSummary: e.target.value })} placeholder="Describe the impact of the staff shortage..." /></Field></div>}
    <ReportSectionTitle>Census Metrics</ReportSectionTitle><div className="metric-tile-grid">{census.map(([label, key]) => <MetricTile key={key} label={label} value={key === 'discharges' ? discharges : form[key]} readOnly={['admissions','discharges','erAdmissions','opdAdmissions'].includes(key)} onChange={(value: number) => updateForm({ [key]: value })} />)}</div>
    <div className="metric-tile-grid or-grid">{orMetrics.map(([label, key]) => <MetricTile key={key} label={label} value={form[key]} onChange={(value: number) => updateForm({ [key]: value })} />)}</div>
    <ReportSectionTitle>DAMA & Retentions</ReportSectionTitle><div className="dama-grid">{(['ER','INP','Closed'] as DamaEntry['damaType'][]).map((type) => <DamaUnit key={type} type={type} form={form} updateForm={updateForm} entries={damaEntries.filter((d: DamaEntry) => d.damaType === type)} entry={entry} setEntry={setEntry} addEntry={() => addEntry(type)} removeEntry={(id: string) => setDamaEntries(damaEntries.filter((d: DamaEntry) => d.id !== id))} />)}</div>
    {form.shift === 'Night' && <div className="night-panel"><div className="night-top"><strong>EARLY & PLANNED DISCHARGES (TOMORROW)</strong><button className="btn small" onClick={addEarlyDischarge}>+ Add Discharge Patient</button></div>{earlyDischarges.length === 0 ? <DashedEmpty text="No patients added yet" /> : <div className="early-discharge-list">{earlyDischarges.map((d: EarlyDischarge) => <div className="early-discharge-row" key={d.id}><div className="grid report-grid two"><Field label="Area"><select value={d.area} onChange={(e) => updateEarlyDischarge(d.id, { area: e.target.value as PatientArea, name: '', code: '', patientId: '' })}><option value="IPD">IPD</option><option value="ER">ER</option><option value="OPD_EG">OPD EG</option><option value="OPD_KSA">OPD KSA</option></select></Field><Field label="Discharge Type"><select value={d.type} onChange={(e) => updateEarlyDischarge(d.id, { type: e.target.value as EarlyDischarge['type'] })}><option>Planned</option><option>Early</option></select></Field></div><PatientLookup area={d.area} label="Patient Search" value={d.name} onSelect={(p) => updateEarlyDischarge(d.id, { area: p.area, name: p.name, code: p.code, patientId: p.id })} /><Field label="Reason / Notes"><textarea value={d.reason} onChange={(e) => updateEarlyDischarge(d.id, { reason: e.target.value })} /></Field><div className="mini-card-actions"><span>{d.code || 'No patient selected'}</span><button onClick={() => setEarlyDischarges(earlyDischarges.filter((x: EarlyDischarge) => x.id !== d.id))}>Delete</button></div></div>)}</div>}<ReportSectionTitle>Unit Utilization & Occupancy</ReportSectionTitle><div className="util-grid">{util.map(([label, key, cap]) => <UtilTile key={key} label={label} cap={cap} value={form[key]} onChange={(value: number) => updateForm({ [key]: value })} />)}</div></div>}
  </section>
}
function OpsTab({ opsIssues, setOpsIssues }: any) {
  const [draft, setDraft] = useState<OpsIssue>({ id: '', funcId: '778000000', affectedId: '778000000', issueId: '778000000', statusId: '778000000', desc: '', pendingDetails: '' })
  const [adding, setAdding] = useState(false)
  function save() { setOpsIssues([...opsIssues, { ...draft, id: `ops-${Date.now()}` }]); setDraft({ ...draft, desc: '', pendingDetails: '' }); setAdding(false) }
  return <section className="card report-card section-ops"><div className="section-header report-header"><div><h2>Operations & Service Functionality</h2><p>Log and track partial or total service outages for critical units</p></div><div className="header-actions"><span className="section-bubble ops">{opsIssues.length} Outages</span><button className="btn primary" onClick={() => setAdding(true)}>+ Log Outage</button></div></div>
    {adding && <ModalShell title="Log Operations Outage" tone="ops" onClose={() => setAdding(false)}><div className="grid report-grid two"><SelectField label="Service Functionality *" value={draft.funcId} options={serviceFunctionalityOptions} onChange={(funcId: string) => setDraft({ ...draft, funcId })} /><SelectField label="Service Affected *" value={draft.affectedId} options={serviceAffectedOptions} onChange={(affectedId: string) => setDraft({ ...draft, affectedId })} /><SelectField label="Type of Issue *" value={draft.issueId} options={opsIssueOptions} onChange={(issueId: string) => setDraft({ ...draft, issueId })} /><SelectField label="Resolution Status *" value={draft.statusId} options={resolutionOptions} onChange={(statusId: Resolution) => setDraft({ ...draft, statusId })} /></div><Field label="Description of Issue *"><textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} /></Field>{draft.statusId !== '778000001' && <Field label="Summary / Pending Details *"><textarea value={draft.pendingDetails} onChange={(e) => setDraft({ ...draft, pendingDetails: e.target.value })} /></Field>}<div className="modal-actions"><button className="btn" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary" onClick={save}>Save Operations Outage</button></div></ModalShell>}
    <div className="previous-placeholder ops-tone">No pending operations outages carried over from previous shifts.</div><div className="single-list">{opsIssues.length === 0 ? <DashedEmpty text="All systems are fully functional. No active outages logged." /> : <CardList items={opsIssues} tone="ops" onDelete={(id: string) => setOpsIssues(opsIssues.filter((x: OpsIssue) => x.id !== id))} render={(o: OpsIssue) => <><strong>{labelFor(serviceAffectedOptions, o.affectedId)} - {labelFor(opsIssueOptions, o.issueId)}</strong><span className="section-bubble ops light">{labelFor(resolutionOptions, o.statusId)}</span><p>{o.desc}</p><small><b>Summary/Pending:</b> {o.pendingDetails}</small></>} />}</div>
  </section>
}
function ExperienceTab({ form, updateForm }: any) {
  return <section className="card report-card section-experience"><div className="section-header stacked"><h2>Patient Experience & Regulatory</h2><p>Track patient satisfaction metrics and authority visits</p></div><div className="grid report-grid two"><ExperiencePanel icon="!" title="Escalated Complaints" subtitle="Patient dissatisfaction cases"><NumberField label="Number of Complaints *" value={form.complaintsCount} onChange={(complaintsCount: number) => updateForm({ complaintsCount })} />{form.complaintsCount > 0 && <Field label="Summary of Complaints *"><textarea value={form.complaintsSummary} onChange={(e) => updateForm({ complaintsSummary: e.target.value })} placeholder="Describe patient complaints clearly..." /></Field>}</ExperiencePanel><ExperiencePanel icon="OVR" title="Escalated OVRs" subtitle="Official variance reports"><NumberField label="Number of OVRs *" value={form.ovrsCount} onChange={(ovrsCount: number) => updateForm({ ovrsCount })} />{form.ovrsCount > 0 && <Field label="Summary of OVRs *"><textarea value={form.ovrsSummary} onChange={(e) => updateForm({ ovrsSummary: e.target.value })} placeholder="Describe incident / OVR details..." /></Field>}</ExperiencePanel></div><div className="experience-card regulatory"><div className="experience-head"><div className="experience-icon">REG</div><div><h3>Regulatory & Government</h3><small>Authority visits during shift</small></div></div><Field label="Government / Regulatory Visit"><select value={form.govVisit} onChange={(e) => updateForm({ govVisit: e.target.value })}><option value="No">No Visits</option><option value="Yes">Yes, Visited</option></select></Field>{form.govVisit === 'Yes' && <Field label="Authority Name & Findings Summary *"><textarea value={form.govSummary} onChange={(e) => updateForm({ govSummary: e.target.value })} placeholder="Include authority name, purpose of visit, and findings..." /></Field>}</div></section>
}
function SummaryTab({ form, updateForm, completion, pendingItems, submitReport, busy }: any) {
  return <section className="card"><div className="section-header"><h2>Summary & Acknowledgment</h2><span>{reportCode(form)}</span></div><Field label="Hot Issues / Clinical Decisions"><textarea value={form.hotIssues} onChange={(e) => updateForm({ hotIssues: e.target.value })} /></Field>{form.shift === 'Night' && <div className="grid"><Field label="Night Medical Meeting"><select value={form.nightMedicalMeeting} onChange={(e) => updateForm({ nightMedicalMeeting: e.target.value })}><option value="778000000">Done</option><option value="778000001">Not Done</option></select></Field><Field label="Meeting Summary"><textarea value={form.nightSummary} onChange={(e) => updateForm({ nightSummary: e.target.value })} /></Field></div>}<div className="summary-list"><h3>Current Pending Items</h3>{pendingItems.length === 0 ? <Empty title="No pending issues" text="All logged items are resolved." /> : pendingItems.map((x: any) => <div className="pending-row" key={x.id}>{x.catLabel || x.desc}<span className="badge orange">Pending</span></div>)}</div><div className={completion.ok ? 'completion ok' : 'completion warn'}>{completion.ok ? 'All mandatory sections complete.' : `Missing: ${completion.missing.join(', ')}`}</div><button className="btn primary submit" disabled={busy} onClick={submitReport}>{busy ? 'Submitting...' : `Submit ${form.shift} Shift Report`}</button></section>
}
function eventAreaOptions(typeText?: string): [PatientArea, string][] {
  if (typeText === 'ER Code') return [['ER', 'ER']]
  if (typeText === 'Hospital Code') return [['IPD', 'IPD']]
  return [['ER', 'ER'], ['IPD', 'IPD'], ['OPD_EG', 'OPD EG'], ['OPD_KSA', 'OPD KSA']]
}
function ModalShell({ title, tone, onClose, children }: any) {
  return <div className="modal" role="dialog" aria-modal="true"><div className={`modal-content form-modal tone-${tone || 'default'}`}><div className="modal-title-row"><h3>{title}</h3><button className="icon-close" onClick={onClose} aria-label="Close">x</button></div>{children}</div></div>
}
function ExperiencePanel({ icon, title, subtitle, children }: any) { return <div className="experience-card"><div className="experience-head"><div className="experience-icon">{icon}</div><div><h3>{title}</h3><small>{subtitle}</small></div></div>{children}</div> }
function InfoPanel({ title, count, note, children, tone }: any) { return <div className={`info-panel ${tone ? `tone-${tone}` : ""}`}><div className="info-panel-top"><label>{title}</label><input readOnly value={count} /></div><div className="panel-note">{note}</div>{children}</div> }
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
function ReportSectionTitle({ children }: { children: React.ReactNode }) { return <h3 className="report-section-title">{children}</h3> }
function DashedEmpty({ text }: { text: string }) { return <div className="dashed-empty">{text}</div> }
function MetricTile({ label, value, readOnly, onChange }: { label: string; value: number; readOnly?: boolean; onChange: (value: number) => void }) { return <div className="metric-tile"><label>{label}</label><input type="number" min="0" readOnly={readOnly} value={value} onChange={(e) => onChange(Number(e.target.value))} /></div> }
function UtilTile({ label, cap, value, onChange }: { label: string; cap: string; value: number; onChange: (value: number) => void }) { const denom = Number(cap.split(' ')[0]); const pct = denom ? Math.round((Number(value) / denom) * 100) : 0; return <div className="util-tile"><div><label>{label}</label><span>/ {cap}</span></div><input type="number" min="0" value={value} onChange={(e) => onChange(Number(e.target.value))} /><small>{pct}% Utilization</small></div> }
function DamaUnit({ type, form, updateForm, entries, entry, setEntry, addEntry, removeEntry }: any) {
  const keys = type === 'ER' ? ['erDama','erDamaRetention'] : type === 'INP' ? ['inpDama','inpDamaRetention'] : ['closedDama','closedDamaRetention']
  const total = Number(form[keys[0]]) || 0
  const retained = Number(form[keys[1]]) || 0
  const pct = total ? Math.round((retained / total) * 100) : 0
  return <div className="dama-unit"><h4>{type === 'INP' ? 'Inpatient Unit' : `${type} Unit`}</h4><div className="dama-counts"><NumberField label="Cases" value={form[keys[0]]} onChange={(value: number) => updateForm({ [keys[0]]: value })} /><NumberField label="Retained" value={form[keys[1]]} onChange={(value: number) => updateForm({ [keys[1]]: value })} /></div><div className="retention-chip">Retention: {pct}%</div><div className="mini-dama-form"><PatientLookup area={type === 'ER' ? 'ER' : 'IPD'} label="Patient Search" value={entry.damaType === type ? entry.patientName : ''} onSelect={(p) => setEntry({ ...entry, damaType: type, area: p.area, patientName: p.name, patientCode: p.code, pId: p.id })} /><textarea placeholder="Reason / action" value={entry.damaType === type ? entry.reason : ''} onChange={(e) => setEntry({ ...entry, damaType: type, reason: e.target.value, actionTaken: e.target.value })} /><button className="btn small primary" onClick={addEntry}>+ Log {type} DAMA Patient</button></div><div className="mini-card-list">{entries.map((d: DamaEntry) => <div className="mini-card" key={d.id}><strong>{d.patientName || 'Patient'}</strong><small>{d.reason}</small><button onClick={() => removeEntry(d.id)}>Delete</button></div>)}</div></div>
}
function Submitted({ form, events, opsIssues, pendingItems, openReport, goHome }: any) {
  return <section className="post-card"><div className="post-head"><small>{form.shift} - {labelFor(businessUnits, form.businessUnit)} - {formatDate(form.reportDate)}</small><h2>{form.shift} Shift Report Submitted</h2><p>Report #{reportCode(form)}</p></div><div className="post-body"><div className="summary-grid"><span>Events</span><strong>{events.length}</strong><span>Operations Outages</span><strong>{opsIssues.length}</strong><span>Pending Issues</span><strong>{pendingItems.length}</strong></div><h3>Notifications</h3><div className="notification-list"><span>Incoming DM - report ready</span>{events.filter((e: EventItem) => e.severity === '778000002').map((e: EventItem) => <span key={e.id}>Medical Director - {e.codeText} major event</span>)}{opsIssues.some((o: OpsIssue) => ['778000000', '778000004'].includes(o.affectedId)) && <span>Biomedical - Lab/Radiology outage</span>}</div><div className="post-actions"><button className="btn primary" onClick={openReport}>View Full Report</button><button className="btn" onClick={() => window.print()}>Download PDF</button><button className="btn" onClick={goHome}>Home</button></div></div></section>
}

function ReportModal({ bundle, close, acknowledge }: any) {
  const r = bundle.report || {}
  return <div className="modal"><div className="modal-content wide"><div className="section-header"><div><h2>{r.dma_name || 'Shift Report'}</h2><p>{labelFor(businessUnits, r.dma_businessunit)} - {shiftFromValue(r.dma_shifttype)} - {formatDate(r.dma_reportdate)}</p></div><button className="btn" onClick={close}>Close</button></div><div className="report-print"><h3>Executive Summary</h3><p>{r.dma_hotissues || 'No hot issues recorded.'}</p><div className="summary-grid"><span>Flow</span><strong>{bundle.flow.length}</strong><span>Events</span><strong>{bundle.events.length}</strong><span>Admin</span><strong>{bundle.admin.length}</strong><span>Operations</span><strong>{bundle.ops.length}</strong><span>Experience</span><strong>{bundle.experience.length}</strong></div><h3>Events</h3><CardList items={bundle.events} render={(e: any) => <><strong>{e.dma_name || e.dma_eventtypename || 'Hospital Event'}</strong><span className="badge orange">{e.dma_severitylevelname || e.dma_severitylevel}</span><p>{e.dma_incidentdescription}</p></>} /><h3>Issues</h3><CardList items={[...bundle.admin, ...bundle.ops]} render={(x: any) => <><strong>{x.dma_name || x.dma_issueidname || 'Issue'}</strong><p>{x.dma_description || x.dma_descriptionofissue || x.dma_pendingissues}</p></>} /></div><div className="modal-actions"><button className="btn primary" onClick={acknowledge}>Acknowledge</button><button className="btn" onClick={() => window.print()}>Download PDF</button></div></div></div>
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

function CardList({ items, render, onDelete }: any) {
  if (!items?.length) return <Empty title="Nothing logged yet" text="Add an entry above." />
  return <div className="card-list">{items.map((item: any, index: number) => <div className="event-card" key={item.id || item.dma_hospitaleventid || item.dma_administrativeissueentryid || item.dma_opeartionid || index}>{render(item)}{onDelete && <button className="btn small danger" onClick={() => onDelete(item.id)}>Delete</button>}</div>)}</div>
}









type HostUser = { id: string; name: string; upn: string; aadObjectId: string }

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
