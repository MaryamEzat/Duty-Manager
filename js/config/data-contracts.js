// Domain contracts are intentionally independent from physical Dataverse tables.
export const contracts = {
  ShiftHandover: ['id','businessUnit','dutyManager','reportDate','shift','status'],
  BusinessUnit: ['id','code','name'], DutyManager: ['id','name','userId'],
  CarriedResponsibility: ['id','handoverId','title','owner','state'], HospitalEvent: ['id','handoverId','title','eventTime','severity','operationalState','department','description','owner','patientMrn'],
  AdministrativeIssue: ['id','handoverId','title','owner','operationalState','dueTime','description'], PatientFlowSnapshot: ['id','handoverId','staffCoverage','erAdmissions','opdAdmissions','totalErVolume','plannedDischarges','unplannedDischarges','totalCases','preOp','postOp','postponed','cancelled'], RetentionPatient: ['id','handoverId','area','cases','retained','action'],
  OperationalException: ['id','handoverId','functionality','serviceAffected','issueType','status','faultDescription','pendingDetails'], ExperienceItem: ['id','handoverId','type','workflowState','summary','followUpDetail'], HandoverReview: ['id','handoverId','note','submittedOn','acknowledgedOn'],
  CommandCenterSnapshot: ['filters','businessUnits','executiveIssues'], BusinessUnitOperationalSnapshot: ['businessUnit','handoverState','staff','incidents','flow','capacity','dama','pending'], ExecutiveIssue: ['id','module','recordId','title','status','category']
};
