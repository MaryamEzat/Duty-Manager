import type { DraftRecord, FormState, PatientArea } from './data'

export function isRecoverableDraft(row: any) {
  if (Number(row?.statecode) === 1) return false
  return Number(row?.dma_reportstatus) === 778000001
    // The old previous-handover lookup could acknowledge an untouched draft.
    || (Number(row?.dma_reportstatus) === 778000000 && row?.dma_hotissues === 'Draft Report initiated')
}

export function isSubmittedReport(row: any) {
  return Number(row?.statecode) !== 1 && !isRecoverableDraft(row)
    && [778000002, 778000000].includes(Number(row?.dma_reportstatus))
}

function patient(row: any) {
  const lookups: [PatientArea, string][] = [['ER', 'erpatient'], ['IPD', 'ipdpatients'], ['IPD_KSA', 'ipdpatientsksa'], ['OPD_EG', 'opdpatienteg'], ['OPD_KSA', 'opdpatientksa']]
  for (const [area, field] of lookups) {
    const key = `_dma_${field}_value`
    if (row[key]) return { area, pId: row[key], pName: row[`${key}@OData.Community.Display.V1.FormattedValue`] || row[`dma_${field}name`] || '', pCode: '' }
  }
  return {}
}

// Retain parent and child IDs so continuing a draft updates existing rows.
export function restoreDraft(bundle: any, base: FormState, shortages: any[] = []): DraftRecord {
  const r = bundle.report
  const flow = bundle.flow[0] || {}
  const exp = bundle.experience[0] || {}
  const form = { ...base }
  for (const key of Object.keys(form) as (keyof FormState)[]) {
    const value = flow[`dma_${key.toLowerCase()}`]
    if (value != null && typeof form[key] === 'number') (form as any)[key] = Number(value)
  }
  const date = new Date(r.dma_reportdate || r.createdon)
  const localDate = Number.isNaN(date.getTime()) ? base.reportDate : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  return {
    ...form, draftId: `dataverse-${r.dma_handoverreportid}`, reportId: r.dma_handoverreportid,
    flowSummaryId: flow.dma_patientflowsummaryid || '', experienceId: exp.dma_patientexperienceid || '',
    timestamp: r.modifiedon || r.createdon || '',
    dmUserId: r._dma_dutymanager_value || '',
    dmName: r['_dma_dutymanager_value@OData.Community.Display.V1.FormattedValue'] || r.dma_dutymanagername || r.dma_DutyManager?.fullname || '',
    businessUnit: String(r.dma_businessunit), reportDate: localDate,
    shift: Number(r.dma_shifttype) === 989230002 ? 'Night' : Number(r.dma_shifttype) === 989230001 ? 'Evening' : 'Morning',
    hotIssues: r.dma_hotissues === 'Draft Report initiated' ? '' : r.dma_hotissues || '',
    nightMedicalMeeting: String(r.dma_nightmedicalmeeting ?? base.nightMedicalMeeting), nightSummary: r.dma_nightmedicalmeetingsummary || '',
    staffAdequacy: String(flow.dma_staffadequacy ?? base.staffAdequacy),
    shortageTypes: shortages.length ? shortages.map((row) => String(row.dma_shortagetype)) : flow.dma_shortagetype != null ? [String(flow.dma_shortagetype)] : [],
    shortfallSummary: flow.dma_shortfallsummary || '', delayedDischargesNarrative: flow.dma_delayeddischargesnarrative || '', prolongedERNarrative: flow.dma_prolongedernarrative || '',
    complaintsCount: Number(exp.dma_escalatedcomplaints || 0), complaintsSummary: exp.dma_summaryofnewongoingcomplaints || '',
    ovrsCount: Number(exp.dma_escalatedovrs || 0), ovrsSummary: exp.dma_summaryofnewovrs || '',
    govVisit: Number(exp.dma_governmentalregulatoryvisits) === 999740000 ? 'Yes' : 'No', govSummary: exp.dma_authoritynamefindingssummary || '',
    events: bundle.events.map((e: any) => ({ id: e.dma_hospitaleventid, dataverseId: e.dma_hospitaleventid, typeId: e._dma_eventtype_value || '', typeText: e['_dma_eventtype_value@OData.Community.Display.V1.FormattedValue'] || e.dma_eventtypename || '', codeId: e._dma_eventcode_value || '', codeText: e['_dma_eventcode_value@OData.Community.Display.V1.FormattedValue'] || e.dma_eventcodename || '', severity: String(e.dma_severitylevel ?? 778000000), desc: e.dma_incidentdescription || '', actions: e.dma_immediateactionstaken || '', ...patient(e) })),
    adminIssues: bundle.admin.map((a: any) => ({ id: a.dma_administrativeissueentryid, dataverseId: a.dma_administrativeissueentryid, catId: a._dma_issueid_value || '', catLabel: a.dma_name || '', status: String(a.dma_resolutionstatus ?? 778000000), desc: a.dma_description || '', action: a.dma_actiontaken || '', pendingDetails: a.dma_pendingissues || '', ...patient(a) })),
    opsIssues: bundle.ops.map((o: any) => ({ id: o.dma_opeartionid, dataverseId: o.dma_opeartionid, funcId: String(o.dma_servicefunctionality ?? ''), affectedId: String(o.dma_serviceaffected ?? ''), issueId: String(o.dma_typeofissue ?? ''), statusId: String(o.dma_resolutionstatus ?? ''), desc: o.dma_descriptionofissue || '', pendingDetails: o.dma_pendingissues || '' })),
    damaEntries: bundle.flowEntries.map((d: any) => ({ id: d.dma_patientflowentryid, dataverseId: d.dma_patientflowentryid, damaType: d.dma_erdama ? 'ER' : d.dma_inpdama ? 'INP' : 'Closed', patientName: patient(d).pName || d.dma_name || '', patientCode: '', reason: d.dma_reason || '', actionTaken: d.dma_actiontaken || '', retained: false, ...patient(d) })),
    earlyDischarges: [],
  }
}
