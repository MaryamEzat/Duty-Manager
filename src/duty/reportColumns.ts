// Columns read for a report and its linked records (report viewer, PDF, draft restore and the Command Center export).
export const patientLookupValues = ['_dma_erpatient_value', '_dma_ipdpatients_value', '_dma_ipdpatientsksa_value', '_dma_opdpatienteg_value', '_dma_opdpatientksa_value']
export const bundleColumns = {
  report: ['dma_handoverreportid', 'dma_name', 'dma_reportdate', 'dma_businessunit', 'dma_shifttype', 'dma_reportstatus', 'dma_hotissues', 'dma_nightmedicalmeeting', 'dma_nightmedicalmeetingsummary', 'dma_dmacknowledgmenttimestamp', '_dma_dutymanager_value', 'statecode', 'statuscode', 'createdon', 'modifiedon'],
  flow: ['dma_patientflowsummaryid', 'dma_staffadequacy', 'dma_shortagetype', 'dma_shortfallsummary', 'dma_ervolume', 'dma_eradmissions', 'dma_opdadmissions', 'dma_admissions', 'dma_discharges', 'dma_planneddischarges', 'dma_unplanneddischarges',
    'dma_delayeddischargescount', 'dma_delayeddischargesnarrative', 'dma_prolongederadmissionscount', 'dma_prolongedernarrative', 'dma_totalorcases', 'dma_preoperative', 'dma_postoperative', 'dma_postponedorcases', 'dma_cancelledorcases',
    'dma_erdama', 'dma_erdamaretention', 'dma_inpdama', 'dma_inpdamaretention', 'dma_closeddama', 'dma_closeddamaretention',
    'dma_inputilization', 'dma_icuutilization', 'dma_ccuutilization', 'dma_picuutilization', 'dma_nicuutilization', 'dma_cxutilization', 'dma_strokeutilization', 'dma_erutilization', 'createdon'],
  events: ['dma_hospitaleventid', 'dma_name', 'dma_severitylevel', 'dma_incidentdescription', 'dma_immediateactionstaken', 'dma_eventlogtimestamp', 'dma_eventtime', '_dma_eventtype_value', '_dma_eventcode_value', 'createdon', ...patientLookupValues],
  admin: ['dma_administrativeissueentryid', 'dma_name', 'dma_description', 'dma_actiontaken', 'dma_pendingissues', 'dma_resolutionstatus', '_dma_issueid_value', 'createdon', ...patientLookupValues],
  ops: ['dma_opeartionid', 'dma_name', 'dma_servicefunctionality', 'dma_serviceaffected', 'dma_typeofissue', 'dma_descriptionofissue', 'dma_resolutionstatus', 'dma_pendingissues', 'createdon'],
  experience: ['dma_patientexperienceid', 'dma_name', 'dma_escalatedcomplaints', 'dma_summaryofnewongoingcomplaints', 'dma_escalatedovrs', 'dma_summaryofnewovrs', 'dma_governmentalregulatoryvisits', 'dma_authoritynamefindingssummary'],
  flowEntries: ['dma_patientflowentryid', 'dma_name', 'dma_erdama', 'dma_inpdama', 'dma_reason', 'dma_actiontaken', 'createdon', ...patientLookupValues],
}
