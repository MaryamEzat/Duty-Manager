# Duty Manager Application

## Complete Project Documentation and Handover Report

**Prepared for:** Project sponsors, operational owners, Power Platform administrators, support teams, and future development teams  
**Document date:** 13 October 2026  
**Application status:** Development completed; report structure confirmation remains outstanding  
**Source of truth:** Current React/TypeScript implementation in `C:\data\my-app`

---

## Document purpose

This report provides a complete functional, technical, operational, and management handover for the Duty Manager application. It reflects the current source code, generated Dataverse contracts, configuration, Git history, and validation results available in the project repository. Where an external configuration or business decision cannot be proved from the repository, it is marked **Requires confirmation**.

## Contents

1. Executive Summary
2. Project Overview
3. Business Objectives
4. Current Project Status
5. Functional Scope
6. Solution Architecture
7. Technology Stack
8. GitHub Repository and Source Control
9. Application Structure
10. Application Modules and Screens
11. Dataverse Data Model
12. Data Sources and Integrations
13. Automated KPIs and Calculations
14. Business Logic and Lifecycle Rules
15. Business Unit and Country Logic
16. User Workflows
17. Automation and Scheduled Processes
18. Reporting and Export
19. Security and Access Control
20. Deployment and Environment Configuration
21. Completed Work
22. Current Outstanding Item
23. Dependencies, Risks, and Limitations
24. Recommended Next Steps
25. Management Handover Summary

---

## 1. Executive Summary

The Duty Manager application is a Microsoft Power Apps Code App built with React and TypeScript. It gives hospital duty managers a structured process for starting, completing, submitting, reviewing, and acknowledging operational handover reports. The application brings together patient flow, hospital events, administrative issues, operational disruptions, patient experience, night-shift discharge planning, alerts, and management reporting in one workflow.

Development is complete against the currently understood requirements. The current implementation supports resumable drafts, section-level persistence, validation before submission, submitted-report review, acknowledgment, PDF generation, dashboard analysis, and CSV export. Draft reports remain editable until final submission and may be opened and closed repeatedly. A submitted report can be acknowledged only after it has been successfully persisted as submitted; after a successful acknowledgment, the viewer closes automatically.

The only primary business item still outstanding is confirmation of the final report structure and reporting expectations. This includes the required management report layout, export frequency, required fields, selected-filter behavior, and whether CSV, Excel, PDF, or a combination is required. Until these points are confirmed, the application’s current PDF and dashboard CSV should be treated as implemented working outputs rather than final business-approved report formats.

The current React/TypeScript source in this repository is the application source of truth. Older static HTML, JavaScript, and CSS files remain in the repository as historical or reference material and are not the active runtime. The application builds successfully, and the six targeted draft-lifecycle tests pass. The repository lint command currently reports pre-existing issues across active, generated, and backup files and is not a clean release gate.

## 2. Project Overview

The application supports the transfer of operational accountability between hospital duty managers across shifts. Each handover is associated with a report date, hospital business unit, shift, and duty manager. The report records operational status and outstanding items so that the incoming manager can understand current conditions and acknowledge receipt.

The active business units are:

| Code | Business unit | Country routing |
|---|---|---|
| AMH | AMH | Egypt |
| ASH | ASH | Egypt |
| SMH | SMH | Egypt |
| AHJ | AHJ | Saudi Arabia |

The system uses AHJ as the Saudi Arabia business unit. All other active business units use Egypt data sources. This behavior is explicitly implemented in the patient lookup logic.

The application is designed for three shifts: Morning, Evening, and Night. The current application derives the initial shift using 07:00–15:00 for Morning, 15:00–23:00 for Evening, and 23:00–07:00 for Night. Business notes supplied separately refer to 08:00–14:00, 14:00–20:00, and 20:00–08:00. The authoritative shift schedule therefore **Requires confirmation**.

## 3. Business Objectives

The application addresses the following objectives:

- Standardize duty-manager handovers across hospital business units and shifts.
- Preserve incomplete work as a draft until the duty manager explicitly submits it.
- Allow a draft to be opened, closed, and continued without changing its lifecycle state.
- Prevent duplicate handovers for the same manager, business unit, shift, and date.
- Capture structured operational data rather than relying on unstructured messages.
- Highlight major incidents, pending issues, hot issues, staffing gaps, and patient-flow pressure.
- Require the previous handover to be acknowledged before the next handover is submitted.
- Provide a formal acknowledgment timestamp and measurable acknowledgment turnaround.
- Carry unresolved administrative and operational items into the next handover when accepted.
- Support operational review through dashboard metrics, filters, PDF reports, and export.
- Use country-appropriate patient sources for Egypt and Saudi Arabia.
- Support night-shift early-discharge planning and linkage to discharge records.

## 4. Current Project Status

| Area | Status | Notes |
|---|---|---|
| Core application development | Complete | Active React/TypeScript implementation is available in `src/`. |
| Draft lifecycle | Complete | Drafts remain open until final submission and can be resumed repeatedly. |
| Submission workflow | Complete | Includes validation, persistence, duplicate prevention, and autosave protection. |
| Review and acknowledgment | Complete | Acknowledgment is restricted to submitted reports and the viewer closes after successful persistence. |
| Dashboard | Complete | Filters, operational indicators, issue views, refresh, and CSV export are implemented. |
| PDF report | Complete | A4 handover report generation is implemented. |
| Dataverse integration | Complete in code | Live permissions, connections, and environment ownership require environment verification. |
| Automated testing | Passed | Six targeted draft-lifecycle tests pass. |
| Production build | Passed | Vite production build completed successfully. |
| Lint quality gate | Open | Current lint run reports 278 issues across active, generated, and backup files. |
| Power Apps publishing | Blocked by access | The configured app returned `PowerAppsNoAccess` for the authenticated account. |
| Final report structure | **Requires confirmation** | This is the primary remaining business decision. |

The repository also contains staged work that implements and tests the latest draft and acknowledgment requirements. These changes should be reviewed, committed, and published through the normal release process after environment access is confirmed.

## 5. Functional Scope

### 5.1 Included scope

- Duty-manager identity and business-unit selection.
- Start a new handover for a business unit and shift.
- Recover and continue an existing Dataverse draft.
- Local draft caching as a secondary resilience mechanism.
- General handover information and hot issues.
- Hospital events and incident details.
- Administrative issue tracking.
- Patient-flow, theatre, staffing, utilization, discharge, and DAMA information.
- Operational disruption and service-functionality tracking.
- Patient complaints, OVRs, government visits, findings, and actions.
- Night medical meeting and early-discharge planning.
- Summary review and validation before submission.
- Submitted report confirmation and report review.
- Previous-handover acknowledgment.
- Carry-forward of unresolved administrative and operational issues.
- Alerts display.
- Operations dashboard with filters and export.
- PDF report generation.

### 5.2 Excluded or unconfirmed scope

- Final management-approved report layout and export specification.
- Confirmed daily, weekly, monthly, or custom-range export usage.
- Native `.xlsx` export; the current “Export Excel” control produces CSV.
- Power Automate flow definitions and ownership.
- Power Query or dataflow definitions.
- DotCare, SQL, or CPOE integration configuration.
- Confirmed upstream formulas that populate operational source tables.
- Environment security-role definitions and user access lists.
- A global country or business-unit preference stored across sessions; this is not implemented.

Each item above **Requires confirmation** before it can be considered part of an approved production scope.


## 6. Solution Architecture

### 6.1 Logical architecture

The solution uses the following runtime path:

1. Microsoft Power Apps hosts the Code App.
2. Vite loads the React entry point in src/main.tsx.
3. src/App.tsx loads the Duty Manager application.
4. React components manage the user interface, workflow state, validation, and navigation.
5. The data layer calls generated Microsoft Dataverse service clients.
6. The generated clients perform organization-specific CRUD operations against the target Dataverse environment.
7. Dataverse stores parent handover reports, section records, lookups, patient references, alerts, and operational source data.
8. Client-side PDF and CSV generators produce downloadable outputs.

The active code deliberately routes reads and writes through the generated cross-environment Dataverse services. The helper named getXrmWebApi() returns no active Web API object, which prevents an accidental mixture of host-environment Web API calls and generated service calls.

### 6.2 Environment relationship

The Code App is configured in one Power Platform environment while the business data service points to a specific Dataverse organization URL. This is a cross-environment design and depends on the deployed connection reference, user authorization, and target Dataverse privileges.

| Component | Configured value |
|---|---|
| Power Apps application ID | bb72cb69-df81-4520-ad19-da8de18c6f49 |
| Power Platform environment ID | cd78a59b-e16f-e4aa-b0a1-8e450a70ed56 |
| App type | Code App |
| Region | Production |
| Build output | ./dist |
| Build entry point | index.html |
| Dataverse connector | shared_commondataserviceforapps |
| Authentication | OAuth |
| Target business-data organization | https://org319b4ea9.crm4.dynamics.com |

The repository refers to a host organization and a separate business-data organization. The exact production ownership, service account, connection owner, and data-loss prevention policy **Require confirmation** in the Power Platform environment.

### 6.3 Architectural boundaries

The application contains client-side workflow and persistence logic. It does not contain server-side plug-ins, custom APIs, Power Automate packages, dataflows, or infrastructure-as-code definitions. Any automation that creates source data, alerts, or daily discharge masters exists outside this repository and **Requires confirmation**.

## 7. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Host | Microsoft Power Apps Code Apps | Enterprise application hosting |
| Front end | React 19.2 | Component-based user interface |
| Language | TypeScript 5.9 | Typed application and data logic |
| Build tooling | Vite 7.2 | Development and production bundling |
| Power Apps SDK | @microsoft/power-apps 1.2.5 | Code App and connector integration |
| Vite integration | @microsoft/power-apps-vite 1.0.2 | Power Apps build tooling |
| Data platform | Microsoft Dataverse | Transactional and reference data |
| Data clients | Generated Microsoft Dataverse services | Typed organization-specific CRUD |
| PDF | jsPDF 4.2.1 and jsPDF-AutoTable 5.0.8 | Handover PDF output |
| Navigation | Pulse shared navigation 1.1.3 | Shared application navigation |
| Testing | Node test runner | Targeted lifecycle behavior tests |
| Source control | Git and GitHub | Version history and collaboration |

No back-end application server is present in the repository. The browser-hosted application connects to Dataverse through the configured Power Apps connector.


## 8. GitHub Repository and Source Control

The configured repository is:

**Repository:** https://github.com/MaryamEzat/Duty-Manager  
**Primary branch:** main

Recent repository history inspected for this handover includes:

| Commit | Date | Description |
|---|---|---|
| 9ccbd23 | 29 September 2026 | Update Duty Manager with recovered development changes |
| 9b5b96f | 10 September 2026 | Update Duty Manager filters and UI |
| 1c38c79 | 26 August 2026 | First commit |

At the time of documentation, the working tree contains staged changes in:

- src/duty/DutyManager.tsx
- src/duty/drafts.ts
- tests/draft-lifecycle.test.mjs

These changes implement the latest draft recovery, draft acknowledgment prevention, late-autosave protection, and post-acknowledgment viewer behavior. They add approximately 260 lines and remove 9 lines. They have not been altered by this documentation work.

### 8.1 Source-control handover guidance

- Review and commit the staged lifecycle changes using a descriptive commit.
- Tag or record the exact commit promoted to each Power Platform environment.
- Keep generated Dataverse files synchronized with the target environment schema.
- Do not treat a GitHub push as a Power Apps deployment. Source control and Code App publishing are separate release steps.
- Remove or clearly archive obsolete static and backup files after stakeholder approval so future maintainers do not mistake them for the active runtime.
- Protect main with review and build checks if organizational policy permits.

## 9. Application Structure

### 9.1 Active entry points

| Path | Responsibility |
|---|---|
| src/main.tsx | React bootstrap, error boundary, and lazy loading |
| src/App.tsx | Loads global styles and mounts Duty Manager |
| src/duty/DutyManager.tsx | Main application UI, navigation, workflow, validation, reporting, and orchestration |
| src/duty/data.ts | Entity definitions, CRUD wrappers, queries, and mapping logic |
| src/duty/dataverse.ts | Generated-service routing and Dataverse access boundary |
| src/duty/drafts.ts | Draft reconstruction, lifecycle helpers, and submission protection |
| src/generated/ | Generated Dataverse models, metadata, and services |
| tests/draft-lifecycle.test.mjs | Targeted lifecycle regression tests |
| power.config.json | Power Apps Code App and connector configuration |
| vite.config.ts | Vite build configuration |

### 9.2 Legacy and reference material

The repository contains static pages/, js/, and css/ assets, including duplicates under public/. These files describe an earlier implementation approach and may still be useful for design or historical reference. They are not mounted by the current React application and must not be treated as the deployed source without explicit verification.

Existing documents under docs/ also describe an earlier handoff state. They remain useful background, but the current code and this report supersede them where behavior differs.

### 9.3 Maintainability observations

The main DutyManager.tsx file currently contains a large amount of UI, state, validation, business workflow, persistence coordination, dashboard logic, and report generation. The application works, but future maintenance would benefit from separating screens, hooks, validators, repository services, and reporting modules. Such refactoring should be incremental and protected by lifecycle tests because the file contains tightly related operational behavior.

## 10. Application Modules and Screens

### 10.1 Home

The Home screen is the operational starting point. It shows the current draft, readiness information, resumable drafts, delete actions, and recent submitted handovers. Recent reports can be filtered and sorted, then opened for review.

Drafts are displayed as work in progress and should not appear as submitted handovers. Closing a draft returns the user to navigation without submitting or acknowledging it.

### 10.2 General information

Captures the report identity and general operational context, including report date, business unit, shift, duty manager, and hot issues. The report parent is created in Draft status when a shift is started.

### 10.3 Hospital events

Captures structured incidents with event type, event code, location or area, patient, description, actions, severity, and resolution status. Patient lookup behavior changes according to event type, code, business unit, and country routing.

### 10.4 Administrative issues

Captures administrative categories, issue details, status, and pending actions. Unresolved issues can be offered for carry-forward into the next handover.

### 10.5 Patient flow

Captures or displays:

- ER, OPD, and total admissions.
- Total, planned, and unplanned discharges.
- Delayed discharges and explanatory narrative.
- Prolonged ER admissions and explanatory narrative.
- Theatre totals, pre-operative, post-operative, postponed, and cancelled cases.
- DAMA cases for ER, inpatient, and closed cases.
- Retention results.
- Bed utilization for inpatient, ICU, CCU, PICU, NICU, cardiovascular, and stroke areas.
- Staffing adequacy, shortage categories, and shortage summary.

Some headline counts are refreshed from the linked Patient Flow Summary record. Other fields remain user-entered. The exact ownership of each metric **Requires confirmation** with the data owners.

### 10.6 Operations

Captures service functionality, affected service, issue type, description, status, and pending action. Supported affected services include Laboratory, Radiology, IT, Facility, Pharmacy, and CSSD. Unresolved items can be carried forward.

### 10.7 Patient experience

Captures complaint totals and summaries, OVR totals and summaries, government-visit status, findings, and corrective actions.

### 10.8 Night shift and early discharge

For Night reports, the application supports medical-meeting status and summary plus next-day planned discharge details. It reads the daily Early Discharge master and associated patient rows, allows the duty manager to add an eligible inpatient, and creates a linked patient-discharge record.

### 10.9 Summary and submission

Presents the report for final review, runs cross-section validation, checks for an acknowledged prior handover, prevents duplicates, persists all sections, and marks the parent report Completed only when submission succeeds.

### 10.10 Submission confirmation

Confirms successful final submission and provides the user with a clear end state. Local draft state is removed after successful submission.

### 10.11 Report viewer and acknowledgment

Displays a submitted report for operational review and PDF generation. A submitted report may be acknowledged, which writes the acknowledgment timestamp and changes the status to Acknowledged. The viewer closes only after acknowledgment persistence succeeds. On persistence failure, it stays open so the user can retry.

### 10.12 Operations Dashboard

Provides date, shift, business-unit, and duty-manager filters; high-level performance signals; business-unit comparisons; an issue queue; refresh; links to related reporting; and export. Dashboard access is not restricted in application code and **Requires confirmation**.

### 10.13 Alerts

Displays alerts from Dataverse in a drawer. Alert creation, recipients, escalation rules, and lifecycle are outside this repository and **Require confirmation**.


## 11. Dataverse Data Model

### 11.1 Core tables

| Functional area | Dataverse entity set | Purpose |
|---|---|---|
| Handover parent | dma_handoverreports | Report identity, status, date, BU, shift, manager, hot issues, acknowledgment |
| Patient flow summary | dma_patientflowsummaries | Admissions, discharges, theatre, utilization, staffing, and narratives |
| Patient experience | dma_patientexperiences | Complaints, OVRs, government visits, findings, and actions |
| Operations | dma_opeartions | Operational service issues; spelling reflects the deployed schema |
| Hospital events | dma_hospitalevents | Clinical and hospital incident records |
| Administrative entries | dma_administrativeissueentries | Administrative issues and pending actions |
| DAMA entries | dma_patientflowentries | ER, inpatient, and closed DAMA cases |
| Alerts | dma_alerts | User-facing operational alerts |
| Coverage shortages | dma_coverageshortages | Staffing shortage classifications |
| Event types | dma_eventtypes | Event-type reference data |
| Event codes | dma_eventcodes | Event-code reference data |
| Administrative issues | dma_administrativeissues | Administrative category reference data |
| Users | systemusers | Duty-manager identity lookup |

### 11.2 Handover parent fields

Key active fields include:

| Field | Purpose |
|---|---|
| dma_handoverreportid | Primary report GUID |
| dma_name | Report name |
| dma_reportdate | Operational report date |
| dma_businessunit | Business-unit choice |
| dma_shifttype | Shift choice |
| dma_reportstatus | Draft, Completed, or Acknowledged |
| dma_hotissues | Executive operational narrative |
| dma_dmacknowledgmenttimestamp | Successful acknowledgment time |
| dma_DutyManager | Lookup to system user |
| dma_nightmedicalmeeting | Night medical-meeting status |
| dma_nightmedicalmeetingsummary | Night medical-meeting narrative |

The generated schema also exposes night attendees, clinical decisions, administrative notes, regulatory details, a composed key, Daily Report, and Facility Capacity references. These fields are not actively used by the current UI and **Require confirmation** before future development relies on them.

### 11.3 Choice values

| Choice | Label | Value |
|---|---|---|
| Report status | Acknowledged | 778000000 |
| Report status | Draft | 778000001 |
| Report status | Completed | 778000002 |
| Shift | Morning | 989230000 |
| Shift | Evening | 989230001 |
| Shift | Night | 989230002 |
| Severity | Low | 778000000 |
| Severity | Moderate | 778000001 |
| Severity | Major | 778000002 |
| Resolution | Pending | 778000000 |
| Resolution | Resolved | 778000001 |
| Resolution | In Progress | 778000002 |
| Staffing | Short | 778000000 |
| Staffing | Adequate | 778000001 |
| Government visit | Yes | 999740000 |
| Government visit | No | 999740001 |

Operational functionality values are Partial Outage, Total Outage, and Fully Functional. Shortage types are Nursing, Medical, and Support Staff. Early Discharge masters use Draft and Submitted status values, while discharge types distinguish Early and Planned.

### 11.4 Patient and discharge source tables

| Source | Entity set | Usage |
|---|---|---|
| Egypt ER visits | cr301_ervisitses | ER patient lookup |
| Egypt inpatient | ipd_patients | Egypt inpatient lookup |
| Egypt outpatient | opd_patients | Egypt outpatient lookup |
| Saudi outpatient | opd_ksapatientses | AHJ outpatient lookup |
| Saudi inpatient | and_inpatientlists | AHJ inpatient and early-discharge lookup |
| Early Discharge master | and_earlydischarges | Daily target-date discharge plan |
| Early Discharge patients | and_earlydischarge_ipdvisitses | Planned patient rows |
| Patient discharge | crad2_patientdischarges | Linked discharge record |

### 11.5 Relationship pattern

The parent Handover Report is the organizing record. Patient Flow Summary, Patient Experience, Hospital Event, Administrative Issue Entry, Operation, Patient Flow Entry, and Coverage Shortage records link to it. Patient-specific event and DAMA records also link to the appropriate ER, outpatient, or inpatient source record.

The exact cascade-delete configuration, alternate keys, required-column enforcement, auditing settings, retention policy, and row ownership **Require confirmation** in Dataverse.

## 12. Data Sources and Integrations

### 12.1 Dataverse integration

All active data operations use generated Microsoft Dataverse clients and organization-specific create, retrieve, update, and delete methods. This gives the application explicit table contracts and avoids constructing ad hoc REST calls.

The application depends on valid OAuth connections to the Dataverse connector and sufficient table privileges. Schema changes should be regenerated into the source rather than manually duplicated.

### 12.2 Patient routing

ER patients use the ER visits source. Egypt inpatient and outpatient searches use their respective Egypt tables. AHJ uses Saudi outpatient and inpatient tables. Hospital-coded events route to country-appropriate inpatient sources, while ER-coded events force the ER source.

### 12.3 Early Discharge integration

For a Night report, the target discharge date is the next calendar day. The application searches for an active Draft Early Discharge master for that date, loads its patient rows, resolves inpatient details, and allows additions. Adding a patient creates an Early Discharge child record and a linked Patient Discharge record. If the second write fails, the application attempts to roll back the child record.

The code expects external automation to create the daily Early Discharge master. That automation is not stored in this repository and **Requires confirmation**.

### 12.4 Power BI and related applications

The Operations Dashboard contains a direct link to an ER Power BI dashboard. Workspace ownership, report permissions, refresh schedules, row-level security, and support ownership **Require confirmation**.

Pulse shared navigation is included as a dependency to connect this application with the wider application suite. The exact navigation registry and production target URLs **Require confirmation**.

### 12.5 Unverified integrations

No repository configuration or executable definition was found for:

- DotCare integration.
- SQL Server connections.
- CPOE.DischargeOrderLine.
- Power Query.
- Dataverse dataflows.
- Custom APIs or plug-ins.
- Power Automate solution packages.

These may exist outside the code repository. Their existence, purpose, owner, credentials, failure handling, and service-level expectations **Require confirmation**.

## 13. Automated KPIs and Calculations

The application derives several dashboard and report indicators from persisted records.

| KPI | Current calculation |
|---|---|
| Net patient flow | Total admissions minus total discharges |
| Major incidents | Count of event records with Major severity |
| Pending issues | Administrative and operational records whose status is not Resolved |
| Maximum utilization | Highest utilization value across configured clinical areas |
| ER DAMA count | Count of ER DAMA entries |
| Inpatient DAMA count | Count of inpatient DAMA entries |
| Retention percentage | Retained cases divided by the relevant DAMA total, subject to available values |
| Acknowledgment minutes | Time between the report reference time and acknowledgment timestamp |
| Submission count | Number of reports in the selected dashboard population |
| Acknowledged count | Number of reports with acknowledged state or timestamp |

Patient Flow refresh currently copies a defined subset from the linked Patient Flow Summary: ER admissions, OPD admissions, total admissions, total discharges, planned discharges, delayed-discharge count, and prolonged-ER count. DAMA totals are derived from child entries in the React state.

The current code does not prove how source systems populate the linked Patient Flow Summary or how frequently those values refresh. Metric definitions, time windows, authoritative source systems, rounding, and exception treatment **Require confirmation** from operational and data owners.

## 14. Business Logic and Lifecycle Rules

### 14.1 Draft creation

Starting a shift creates a Handover Report parent in Draft status and then creates or links its Patient Flow Summary. If Patient Flow creation fails, the code attempts to remove the newly created parent so the user is not left with an unusable report.

The application enforces one draft for the same duty manager, business unit, shift, and calendar date. If a matching draft exists, it opens that report instead of creating another.

### 14.2 Draft persistence and recovery

Draft content is saved to Dataverse throughout the editing process. A local-storage key provides additional in-browser recovery. The current implementation reconstructs active drafts from Dataverse, including retained parent and child record identifiers, and then allows editing to continue.

A draft remains Draft until final submission. Opening, reviewing, closing, or navigating away does not complete or acknowledge it. The duty manager may reopen it as many times as required.

### 14.3 Draft deletion

Deleting a draft removes related child data, Patient Experience, Patient Flow Summary, Coverage Shortages, the parent report, and local draft storage. This is an intentional destructive user action and should be included in user acceptance testing and support guidance.

### 14.4 Validation before submission

Submission validation includes:

- Report identity and required general fields.
- Staffing adequacy.
- Shortage types and shortage summary when staffing is Short.
- Hot-issues narrative length.
- Complaint and OVR summaries when corresponding counts are greater than zero.
- Government findings when a visit is recorded.
- Night medical-meeting narrative when the meeting is Done.
- Early-discharge rows when Night planned discharges are greater than zero.
- Required patient, type, code, area, description, actions, status, and pending-action fields across detailed sections.

### 14.5 Submission

Before submission, the application checks for a duplicate report and verifies that the previous handover for the business unit has been acknowledged. It then saves the parent and all child sections. Only after persistence succeeds does it set the parent to Completed. It removes the local draft and protects the submitted identifier from delayed autosave callbacks.

### 14.6 Acknowledgment

Only a submitted report can be acknowledged. A draft is explicitly rejected by the acknowledgment guard. Successful acknowledgment records the timestamp, changes the report status to Acknowledged, retains the record as active, and closes the viewer. If persistence fails, the report remains open and no success state is shown.

### 14.7 Previous handover rule

The previous-handover query finds the latest report for the same business unit before the current report date, considering Completed and Acknowledged reports and excluding legacy initiated drafts. Submission is blocked when the applicable previous handover has not been acknowledged.

Whether same-day earlier shifts must also be included in this rule **Requires confirmation**, because the current query boundary is based on report date.

### 14.8 Carry-forward

The application reads unresolved administrative and operational items from the previous report and presents them for acceptance. Accepted items create new child rows under the current report. The implementation does not store an explicit source-to-destination relationship or update the prior item when copied. Traceability and closure ownership **Require confirmation**.

## 15. Business Unit and Country Logic

The current active business-unit choice values are:

| Business unit | Choice value | Country behavior |
|---|---:|---|
| AMH | 983080000 | Egypt |
| ASH | 983080001 | Egypt |
| SMH | 983080002 | Egypt |
| AHJ | 983080003 | Saudi Arabia |

The country rule is small and direct: AHJ is treated as Saudi Arabia; all other active business units are treated as Egypt. This controls patient-source options and patient lookup bindings.

AHJ exposes ER, Saudi outpatient, and Saudi inpatient options. Egypt units expose ER, Egypt outpatient, and Egypt inpatient options. Event classification can further constrain the source: an ER code uses ER, while a Hospital code uses the country-specific inpatient source.

There is no implemented first-load global scope modal or persistent global country selector. Any future scope feature should reuse a single mapping function and must not introduce country values that conflict with the business-unit rule without an approved migration design.


## 16. User Workflows

### 16.1 Start or continue a handover

1. The user opens the application and is identified through the available user context.
2. The user selects the business unit and begins a shift.
3. The application checks for an existing matching draft.
4. If a draft exists, it opens for continuation.
5. If no draft exists, the application creates the Draft parent and Patient Flow record.
6. The user moves through the report sections while changes autosave.

### 16.2 Close and resume a draft

1. The user closes or leaves the report.
2. The application returns to the relevant navigation state.
3. The Dataverse parent remains Draft.
4. The Home screen continues to show the report as a draft.
5. The user can reopen and edit it until final submission.

Closing is a navigation action. It is not submission, completion, or acknowledgment.

### 16.3 Submit a handover

1. The user reviews the Summary.
2. The application validates the complete report.
3. The application checks the preceding handover acknowledgment.
4. It checks that a duplicate submitted report does not exist.
5. It persists general information and every child section.
6. It changes the parent to Completed.
7. It clears the local draft and displays the submitted confirmation.

If a required save fails, the process must not present a successful final submission.

### 16.4 Review and acknowledge

1. The incoming duty manager opens a submitted report.
2. The report viewer displays the complete handover.
3. The user selects Acknowledge.
4. The application verifies that the record is submitted.
5. It writes the timestamp and Acknowledged status to Dataverse.
6. After Dataverse confirms success, the viewer closes automatically.
7. If the write fails, the viewer stays open and the user can retry.

### 16.5 Carry an unresolved issue forward

1. The new report loads unresolved administrative and operational items from the preceding report.
2. The user reviews the offered items.
3. Accepted items are copied into new records belonging to the current report.
4. The user may update the new records during the current shift.

### 16.6 Add a Night early-discharge patient

1. The Night report determines the next-day target date.
2. The app retrieves the active Draft Early Discharge master.
3. The user searches the country-appropriate inpatient source.
4. The app creates the Early Discharge patient row.
5. It creates and links the Patient Discharge row.
6. If linkage fails, the child addition is rolled back where possible.

## 17. Automation and Scheduled Processes

The application depends on several behaviors that appear to be automated outside this repository:

| Process | Evidence in application | Handover status |
|---|---|---|
| Daily Early Discharge master creation | Code expects a target-date Draft master to exist | **Requires confirmation** |
| Early Discharge patient count rollup | Generated schema includes a scheduled rollup field | Platform schedule and ownership **Require confirmation** |
| Patient Flow source population | App reads existing summary values | Source process and refresh frequency **Require confirmation** |
| Alert generation | App reads alert records | Creation and escalation rules **Require confirmation** |
| Power BI refresh | Dashboard links to a report | Dataset, gateway, and schedule **Require confirmation** |

No Power Automate definition is included in the repository. The operational handover must identify each external flow by solution, environment, owner, connection owner, trigger, schedule, inputs, outputs, retry policy, monitoring location, and support contact.

The rollup for Early Discharge patient count is controlled by Dataverse scheduling. The client cannot force the rollup to execute immediately, so transient differences between child rows and a displayed rollup may occur.

## 18. Reporting and Export

### 18.1 Handover PDF

The report viewer generates an A4 PDF using jsPDF and AutoTable. The current document includes:

- Report identity.
- Executive or hot-issues summary.
- Patient-flow groups.
- DAMA information.
- Night-shift information where applicable.
- Hospital events.
- Administrative issues.
- Operational issues.
- Patient-experience information.
- Page footer and page numbering.

The final field order, branding, sign-off area, privacy classification, and management distribution rules **Require confirmation**.

### 18.2 Dashboard export

The Operations Dashboard includes a button labeled “Export Excel,” but the implementation generates a UTF-8 CSV file. The export reflects the dashboard’s filtered population and includes:

- Report ID and name.
- Report and creation dates.
- Business unit and shift.
- Duty manager.
- Report status.
- Acknowledgment timestamp and minutes.
- Hot issues.
- Major incident count.
- Pending issue count.
- ER and inpatient DAMA counts.

CSV files open in Excel, but they are not native Excel workbooks. If formatting, multiple sheets, formulas, charts, protection, or data types are required, native XLSX generation must be specified and developed.

### 18.3 Reporting decisions required

The business owner must confirm:

- Whether exports are needed daily, weekly, monthly, or for a custom date range.
- Whether exports must always reflect the dashboard’s selected filters.
- Which user roles may export patient or operational information.
- The exact fields, column order, labels, calculations, and time zone.
- Required formats: CSV, XLSX, PDF, or a combination.
- Whether one file should contain details, summaries, or both.
- Required branding and confidentiality labels.
- File naming and versioning.
- Distribution, retention, and audit requirements.
- Whether PDF acknowledgment evidence must be included.

Until confirmed, reporting remains the only primary outstanding business item.

## 19. Security and Access Control

Authentication is provided through the Power Apps and Dataverse connection context. Authorization ultimately depends on Power Platform sharing and Dataverse privileges.

**Security configuration is managed in the Power Platform environment and requires environment-level confirmation.**

The repository does not contain the environment’s security roles, team membership, application sharing list, field-security profiles, business-unit hierarchy, audit policy, or Power BI permissions. The following access model therefore **Requires confirmation**:

- Who may start and edit a handover.
- Whether duty managers are restricted to their own business unit.
- Who may delete drafts.
- Who may review and acknowledge submitted reports.
- Who may view the Operations Dashboard.
- Who may export data.
- Who may view patient-identifiable information.
- Whether the dashboard is intended for operations leadership rather than duty managers.
- Who administers reference data, users, alerts, and mappings.
- Whether service accounts own any external automation.

The Operations Dashboard has no explicit application-level role guard in the current code. If it must be available to a separate audience, enforce access through an approved combination of app sharing, Dataverse roles, row-level access, and an application-level entitlement check.

### 19.1 Privacy and audit considerations

The application processes patient references and operational narratives. Production readiness should confirm least-privilege access, audit logging, data retention, export controls, non-production masking, and approved incident-response procedures. These controls cannot be verified from the repository.

## 20. Deployment and Environment Configuration

### 20.1 Build and package

The production package is generated with the Vite build command and written to dist. The configured entry point is index.html. A clean production build was successfully completed during this handover review.

### 20.2 Power Apps deployment

The application is configured with app ID bb72cb69-df81-4520-ad19-da8de18c6f49 in environment cd78a59b-e16f-e4aa-b0a1-8e450a70ed56.

The expected Power Apps play URL is:

https://apps.powerapps.com/play/e/cd78a59b-e16f-e4aa-b0a1-8e450a70ed56/a/bb72cb69-df81-4520-ad19-da8de18c6f49

The exact currently published version and production availability **Require confirmation**. A recent push attempt returned HTTP 403 with PowerAppsNoAccess for the authenticated user, so source changes cannot be published until an authorized account has access to the app and environment.

### 20.3 Release procedure

1. Review the Git working tree and staged changes.
2. Run the targeted lifecycle tests.
3. Run the production build.
4. Review lint findings and waive or remediate them under an agreed policy.
5. Confirm generated Dataverse contracts match the target environment.
6. Confirm the Power Apps CLI is authenticated with the intended tenant and account.
7. Confirm the account has edit access to the Code App and required environment privileges.
8. Push the Code App using the approved release command.
9. Verify the published version in Power Apps.
10. Run smoke tests for draft create/resume/delete, submission, report review, acknowledgment, PDF, dashboard filters, and export.
11. Record the Git commit, deployment time, deployer, and validation evidence.

### 20.4 Rollback

A rollback procedure is not defined in the repository and **Requires confirmation**. At minimum, the team should retain the last known-good Git commit, record exported app/version information where supported, and define how schema or automation changes are reversed without data loss.


## 21. Completed Work

The following work is complete in the current implementation:

- React/TypeScript Code App foundation and Power Apps configuration.
- Cross-environment generated Dataverse service integration.
- Duty-manager, business-unit, date, and shift report identity.
- Draft parent creation with Patient Flow child creation and rollback protection.
- Dataverse and local draft recovery.
- Reopening and closing drafts without changing their Draft status.
- Duplicate-draft and duplicate-submission prevention.
- Section autosave and delayed-autosave protection after submission.
- General, Events, Administrative, Patient Flow, Operations, Experience, and Summary screens.
- Night medical-meeting and early-discharge workflow.
- Country-specific patient source routing for AHJ and Egypt business units.
- Full validation before submission.
- Previous-handover acknowledgment requirement.
- Submitted report viewer.
- Acknowledgment timestamp and status persistence.
- Automatic report-viewer close after successful acknowledgment.
- PDF report generation.
- Operations Dashboard filtering and operational metrics.
- CSV export using the selected dashboard population.
- Carry-forward of unresolved administrative and operational issues.
- Draft deletion across parent and related child records.
- Six targeted lifecycle regression tests.
- Successful production build.

## 22. Current Outstanding Item

### Final report structure and export requirements

The application development is complete based on the requirements currently available. The remaining primary item is business confirmation of the final reporting structure.

The business owner should provide or approve:

1. The intended report audience.
2. Whether the report is used per shift, daily, weekly, monthly, or on demand.
3. Whether users need a custom date range.
4. Whether exported results must reflect every active dashboard filter.
5. The exact data fields and calculations.
6. Required grouping, sorting, totals, and comparisons.
7. Whether patient-level detail is permitted.
8. Required formats: PDF, CSV, XLSX, or a combination.
9. Branding, confidentiality, approval, and acknowledgment evidence.
10. Distribution, file naming, retention, and audit expectations.

Once this structure is confirmed, the existing output can be adjusted and validated against an approved sample. No other primary development blocker was identified in the reviewed scope.

## 23. Dependencies, Risks, and Limitations

| Item | Impact | Required action |
|---|---|---|
| Power Apps access is missing for the current CLI identity | Prevents publishing | Grant app/environment access or authenticate with the authorized account |
| Final report specification is unconfirmed | Output may not match management expectations | Approve a sample layout and export rules |
| Shift schedule conflict | Incorrect default shift may be selected | Confirm authoritative hours and update one shared rule |
| External automations are absent from source control | Support cannot trace master creation, alerts, or source refresh | Inventory flows, owners, connections, and monitoring |
| Security configuration is external | Access cannot be validated from code | Review app sharing, Dataverse roles, teams, and Power BI access |
| Operations Dashboard has no code-level role check | Unintended users may see the page if environment sharing is broad | Confirm audience and enforce entitlement |
| CSV is labeled Export Excel | User expectation may differ from actual file type | Rename the control or implement native XLSX |
| Large DutyManager component | Changes carry regression risk | Refactor incrementally with tests |
| Legacy and backup files are present | Maintainers may edit the wrong implementation | Archive or clearly label them |
| Lint reports 278 issues | Quality gate is not clean | Scope lint to active source, exclude generated files, and remediate agreed findings |
| Same-day previous-shift acknowledgment is unclear | Submission control may not match operations | Confirm chronological rule |
| Carry-forward lacks explicit lineage | Historical traceability is limited | Confirm whether source references are required |
| Rollup values may be delayed | Counts may temporarily differ | Document refresh expectations |
| Live end-to-end Dataverse validation is not recorded | Environment behavior may differ from static checks | Run a production-like acceptance test |

## 24. Recommended Next Steps

### Immediate business actions

1. Approve the final report and export structure.
2. Confirm the Operations Dashboard audience and provide the current access list.
3. Confirm the authoritative shift times.
4. Confirm whether acknowledgment checks must include same-day earlier shifts.
5. Confirm whether carry-forward items require source-report traceability.

### Immediate technical actions

1. Review and commit the staged lifecycle changes.
2. Give the deployment account access to the configured Power Apps application and environment.
3. Inventory external flows, dataflows, Power BI assets, service accounts, and connection owners.
4. Run an end-to-end acceptance test using production-like Dataverse data.
5. Record the deployed Git commit and Power Apps version.

### Post-release improvements

1. Split the main component into screen components, hooks, validators, data repositories, and report services.
2. Add integration tests for submission rollback, Dataverse failures, and carry-forward.
3. Add role-aware navigation for the Operations Dashboard after the access model is approved.
4. Align the export label with its actual format or implement native XLSX.
5. Establish a lint baseline that excludes generated and backup code, then reduce active-source findings.
6. Archive obsolete static assets and earlier duplicate files.
7. Add release, rollback, support, and monitoring runbooks to the repository.

## 25. Management Handover Summary

The Duty Manager application is functionally complete for the currently defined operational handover process. It provides persistent drafts, structured section capture, validated final submission, submitted-report review, acknowledgment, dashboard monitoring, PDF generation, and filtered export. Recent lifecycle changes ensure that an initiated report stays Draft until final submission and that a reviewed report closes only after acknowledgment is successfully stored.

The source of truth is the React/TypeScript application under src/ in the GitHub repository at https://github.com/MaryamEzat/Duty-Manager. The solution builds successfully and the targeted lifecycle tests pass. Publishing remains dependent on correcting Power Apps access for the deployment identity.

Management approval is required for the final report structure and export operating model. Environment owners must also confirm security, external automation, Power BI ownership, connections, and production release controls. Once those confirmations are recorded and the authorized account publishes the build, the solution can proceed through final user acceptance and operational release.

---

# Appendix A — Operational Choice Reference

| Area | Available values |
|---|---|
| Shift | Morning, Evening, Night |
| Report state | Draft, Completed, Acknowledged |
| Severity | Low, Moderate, Major |
| Resolution | Pending, In Progress, Resolved |
| Functionality | Partial Outage, Total Outage, Fully Functional |
| Affected service | Laboratory, Radiology, IT, Facility, Pharmacy, CSSD |
| Operational issue | Equipment Breakdown, Utility Failure, Power, AC, Water, O2 |
| Staffing | Adequate, Short |
| Shortage type | Nursing, Medical, Support Staff |
| Government visit | Yes, No |
| Early-discharge type | Early, Planned |

# Appendix B — Minimum Production Acceptance Checklist

- [ ] Deployment account can access the target environment and app.
- [ ] Generated service contracts match the target Dataverse schema.
- [ ] Duty manager can start a report.
- [ ] Existing matching draft reopens instead of duplicating.
- [ ] Draft can be closed and reopened without becoming submitted.
- [ ] Autosaved child records reload correctly.
- [ ] Draft deletion removes expected related records.
- [ ] Submission validation blocks incomplete sections.
- [ ] Previous-handover acknowledgment rule behaves as approved.
- [ ] Successful submission creates no duplicate child rows.
- [ ] Late autosave cannot revert or alter the submitted report.
- [ ] Draft cannot be acknowledged.
- [ ] Submitted report acknowledgment writes status and timestamp.
- [ ] Viewer closes only after acknowledgment succeeds.
- [ ] Carry-forward works for unresolved administrative and operational items.
- [ ] Egypt and AHJ patient lookups use the correct source tables.
- [ ] Night early-discharge patient creation and linkage succeed.
- [ ] PDF content matches the approved report structure.
- [ ] Dashboard filters affect cards, queues, and export consistently.
- [ ] Export contains the approved fields and format.
- [ ] Operations Dashboard is available only to the approved audience.
- [ ] Power BI link and permissions work.
- [ ] Alerts display and ownership are verified.
- [ ] Audit, privacy, retention, and support controls are approved.

# Appendix C — Validation Evidence

| Check | Result |
|---|---|
| Production build | Passed; Vite built 410 modules in approximately 5.84 seconds |
| Draft lifecycle tests | Passed; 6 of 6 |
| Lint | Not clean; 278 findings, including generated and backup files |
| Live Power Apps push | Blocked by HTTP 403 PowerAppsNoAccess |
| Live end-to-end Dataverse acceptance | **Requires confirmation** |
| Final management report approval | **Requires confirmation** |

# Appendix D — Ownership Information to Complete

The following ownership fields should be completed during formal handover:

| Responsibility | Named owner |
|---|---|
| Business sponsor | **Requires confirmation** |
| Product owner | **Requires confirmation** |
| Duty Manager process owner | **Requires confirmation** |
| Operations Dashboard owner | **Requires confirmation** |
| Power Platform environment administrator | **Requires confirmation** |
| Dataverse schema owner | **Requires confirmation** |
| Power Automate owner | **Requires confirmation** |
| Power BI owner | **Requires confirmation** |
| Application support lead | **Requires confirmation** |
| Release approver | **Requires confirmation** |
| Information security approver | **Requires confirmation** |
| Data privacy owner | **Requires confirmation** |
