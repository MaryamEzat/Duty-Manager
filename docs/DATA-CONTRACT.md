# Domain data contracts

Contracts are frontend/domain concepts, not a claim that each is a Dataverse table. The canonical field lists are exported from `js/config/data-contracts.js`.

| Domain model | Required conceptual fields |
|---|---|
| ShiftHandover | id, businessUnit, dutyManager, reportDate, shift, status |
| BusinessUnit | id, code, name |
| DutyManager | id, name, userId |
| CarriedResponsibility | id, handoverId, title, owner, state |
| HospitalEvent | id, handoverId, title, eventTime, severity, operationalState, department, description, owner, patientMrn |
| AdministrativeIssue | id, handoverId, title, owner, operationalState, dueTime, description |
| PatientFlowSnapshot | id, handoverId, staffCoverage, admissions/discharges, theatre values |
| RetentionPatient | id, handoverId, area, cases, retained, action |
| OperationalException | id, handoverId, functionality, serviceAffected, issueType, status, faultDescription, pendingDetails |
| ExperienceItem | id, handoverId, type, workflowState, summary, followUpDetail |
| HandoverReview | id, handoverId, note, submittedOn, acknowledgedOn |
| CommandCenterSnapshot | filters, businessUnits, executiveIssues |
| ExecutiveIssue | id, module, recordId, title, status, category |

IDs are temporary in mock mode and must be replaced by Dataverse GUIDs through the repository adapter.
