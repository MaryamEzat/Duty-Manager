# Dataverse mapping worksheet

Populate the blank values in `js/config/dataverse-schema.js` only after confirming the environment metadata. Never infer logical names from display labels.

| Frontend entity | Frontend field | Table logical name | Column logical name | Dataverse type | Required? | Lookup target | Choice mapping | Notes |
|---|---|---|---|---|---|---|---|---|
| ShiftHandover | id / businessUnit / shift / reportDate / dutyManager / status |  |  |  |  |  |  | Confirm ownership and lifecycle |
| HospitalEvent | title / eventTime / severity / operationalState / department / description / owner / patientMrn |  |  |  |  |  |  | Confirm Choice values and patient lookup policy |
| AdministrativeIssue | title / owner / operationalState / dueTime / description |  |  |  |  |  |  | Confirm action-due rule |
| PatientFlowSnapshot | staffCoverage / admissions / discharges / theatre values |  |  |  |  |  |  | Confirm one snapshot per handover |
| RetentionPatient | area / cases / retained / action / owner |  |  |  |  |  |  | Confirm ownership lookup |
| OperationalException | functionality / serviceAffected / issueType / status / faultDescription / pendingDetails |  |  |  |  |  |  | Confirm status Choice mapping |
| ExperienceItem | type / workflowState / summary / followUpDetail |  |  |  |  |  |  | Confirm state/type Choices |
| HandoverReview | note / submittedOn / acknowledgedOn |  |  |  |  |  |  | Submission and acknowledgement are separate |

The Dataverse adapter must also document lookup binding (`@odata.bind`), Choice numeric values, date/time zone conversion, and user/team owner resolution.
