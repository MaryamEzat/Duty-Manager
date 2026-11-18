# Duty Manager Project

## Project Documentation and Management Handover

**Document purpose:** Business, functional, and current-status overview  
**Audience:** New project manager, operational owners, hospital management, and project stakeholders  
**Document date:** 13 October 2026  
**Project status:** **Development Completed**  
**Current phase:** Final report structure confirmation and reporting alignment

---

## Contents

1. Executive Summary
2. Project Background and Purpose
3. Business Objectives
4. Current Project Status
5. End-to-End Duty Manager Workflow
6. Shift Structure
7. Application Functional Areas
8. Automated and Manual Information
9. KPI and Operational Monitoring
10. Business Unit and Country Handling
11. Data and Integration Overview
12. Reporting and Export
13. Completed Development
14. Current Outstanding Items
15. Next Steps
16. Management Handover Summary

---

## 1. Executive Summary

Duty Manager is a hospital operations application that structures the handover of responsibility from one Duty Manager to the next. It provides a single place to record the operational position of the hospital during each shift, including patient flow, significant hospital events, administrative and service issues, staffing concerns, patient experience matters, pending actions, and the priorities that need attention during the next shift.

The project was developed to improve a process that can otherwise depend on fragmented spreadsheets, messages, verbal updates, and free-text reports. Those methods make it difficult to confirm whether all important topics were covered, identify who owns an action, follow an issue across shifts, or provide management with a consistent historical view. Duty Manager introduces a standard sequence and a structured record for every handover.

The application supports four hospital business units: AHJ, AMH, ASH, and SMH. AHJ uses the relevant Saudi Arabia patient and hospital data sources, while AMH, ASH, and SMH use the corresponding Egypt sources. This allows the same operating process to be used across facilities while patient search and related information remain appropriate to each country.

The application covers the complete handover lifecycle. A Duty Manager starts a report, reviews available operational information, completes the relevant sections, saves work as a draft, reviews a consolidated summary, and submits the handover. The incoming Duty Manager can then review the submitted report and formally acknowledge it. Unresolved administrative and operational matters can be carried into the next handover where appropriate.

**Development is completed.** The core application, operational sections, draft lifecycle, patient lookup, Night-shift functions, submission, acknowledgment, dashboard, and current report/export capabilities have been delivered.

The project is currently waiting for confirmation of the final structure and content of the report that will be extracted or generated from the application. The required audience, reporting period, layout, sections, field order, level of detail, filter behavior, format, and management summary must be agreed. Once this is confirmed, the existing output can be adjusted if required, validated against an approved sample, and taken through final acceptance.

## 2. Project Background and Purpose

Hospital operations change continuously during the day. Admissions and discharges affect capacity; delayed patients require escalation; clinical or facility incidents can disrupt service; staffing gaps may affect coverage; complaints and regulatory matters may require follow-up; and open actions must move safely from one shift to the next.

A reliable handover therefore needs more than a short narrative. The incoming Duty Manager needs a clear view of what happened, the hospital’s current position, what remains unresolved, which patients or services need attention, and what action is expected next.

Before a structured application, handover information may be distributed across conversations, emails, messages, spreadsheets, source systems, and manually prepared reports. This creates several operational problems:

- The content and quality of handovers may vary between Duty Managers or facilities.
- Important information may be omitted because there is no standard sequence.
- Pending actions can be difficult to track across shifts.
- The same information may need to be entered repeatedly in different places.
- Management reporting requires manual consolidation.
- Historical review and accountability are limited when information is unstructured.
- Acknowledgment by the incoming Duty Manager may not be formally recorded.

Duty Manager centralizes the process. Each shift produces a structured operational record linked to a report date, hospital business unit, shift, and Duty Manager. The record brings together the hospital’s operational position, patient-flow indicators, significant events, administrative matters, service disruptions, patient-experience information, Night-shift planning, hot issues, and outstanding actions.

The application does not replace operational judgment. It gives the Duty Manager a consistent framework for applying that judgment, explaining exceptions, escalating concerns, and transferring accountability to the next shift.

## 3. Business Objectives

The project was designed to achieve the following business outcomes.

### 3.1 Standardize the handover process

Every Duty Manager follows the same main sequence and covers the same operational areas. This reduces variation and helps ensure that important information is not missed.

### 3.2 Improve continuity between shifts

The incoming Duty Manager receives a structured view of the previous shift, including unresolved issues and pending actions. Formal acknowledgment confirms that the handover was reviewed.

### 3.3 Centralize operational information

The application provides one handover record for patient flow, events, administrative matters, operational disruptions, experience concerns, Night activities, and priorities.

### 3.4 Improve accountability

Each report is linked to a Duty Manager, business unit, date, and shift. Submission and acknowledgment are recorded, including an acknowledgment timestamp.

### 3.5 Track unresolved and pending issues

Administrative and operational issues retain their status and required action. Relevant unresolved items can be carried into the next report so they remain visible.

### 3.6 Provide management visibility

The Operations Dashboard organizes submitted handovers using date, shift, business-unit, and Duty Manager filters. It highlights operational signals and supports report extraction.

### 3.7 Capture important hospital events

Structured event information improves clarity around what happened, where it occurred, the patient involved where applicable, the severity, actions taken, and current status.

### 3.8 Monitor patient flow and operational performance

Admissions, discharges, delays, theatre activity, DAMA cases, utilization, staffing adequacy, and coverage concerns provide a shift-level operational picture.

### 3.9 Maintain a structured historical record

Submitted and acknowledged handovers create a consistent history that can support operational review, management reporting, trend analysis, and follow-up.

### 3.10 Support consistent reporting

The application already provides report and export capabilities. The remaining step is to align the final extracted report with the approved management requirement.

## 4. Current Project Status

### 4.1 Status at a glance

| Status area | Current position |
|---|---|
| **Development status** | **COMPLETED** |
| **Current phase** | Report structure confirmation and final reporting alignment |
| **Application workflow** | Completed |
| **Operational sections** | Completed |
| **Draft and submission lifecycle** | Completed |
| **Review and acknowledgment** | Completed |
| **Dashboard** | Completed |
| **Current report/export capability** | Completed |
| **Primary outstanding item** | Confirmation of the final extracted/generated report structure |

### 4.2 Completed scope

The delivered application includes:

- Core Duty Manager application and navigation.
- Shift-based handover workflow.
- Draft creation, saving, closing, reopening, and deletion.
- General and handover information.
- Hospital Events.
- Administrative Issues.
- Patient Flow.
- Operations.
- Patient Experience.
- Night Shift and medical-meeting information.
- Early and Planned Discharge linkage where applicable.
- Patient search using the appropriate facility and country source.
- Summary review and business validation.
- Final submission.
- Review and acknowledgment by the incoming Duty Manager.
- Carry-forward of relevant unresolved issues.
- Operations Dashboard.
- Current PDF handover report and dashboard export.

### 4.3 Primary outstanding item

The required structure of the final extracted or generated report must be confirmed. The decision needs to cover:

- Required report layout.
- Required sections and information.
- Field order and grouping.
- Required KPIs and summary measures.
- Whether dashboard filters must determine the extracted population.
- Required reporting period: per shift, daily, weekly, monthly, or custom.
- Whether patient-level detail is permitted or only summarized information is required.
- Preferred format, such as PDF, Excel, or both.
- Management summary, branding, and acknowledgment requirements.

This reporting decision is the current project dependency. The application itself should not be described as being under general development.

## 5. End-to-End Duty Manager Workflow

The handover process follows the sequence below.

### Step 1 — Start the shift report

The Duty Manager starts a report for the relevant hospital business unit and shift. The application establishes the report date, business unit, shift, and Duty Manager.

If a matching draft already exists, the Duty Manager continues that report instead of creating a duplicate.

### Step 2 — Load available operational information

Where information is available through the connected data records, the application retrieves relevant patient-flow counts and operational context. The Duty Manager reviews these values and completes information that requires human judgment or explanation.

### Step 3 — Complete General Information

The Duty Manager confirms the handover identity and records the hot issues or major priorities that the incoming manager must understand.

### Step 4 — Record Hospital Events

Significant hospital events are entered using a structured set of details. Where a patient is involved, the Duty Manager searches the appropriate patient source and links the patient to the event.

### Step 5 — Review and enter Administrative Issues

Administrative or coordination matters are recorded with their status and pending actions. Examples include patient delays, outstanding investigations, service coordination, or other matters requiring management attention.

### Step 6 — Review and complete Patient Flow

The Duty Manager reviews admissions, discharges, delays, theatre information, DAMA activity, utilization, staffing adequacy, and coverage shortages. Automatically available figures are combined with manually entered explanations and operational judgments.

### Step 7 — Record Operations issues

Service disruptions or functionality concerns are entered for areas such as Laboratory, Radiology, IT, CSSD, Pharmacy, and Facility services. Each issue includes its impact, current status, and pending action.

### Step 8 — Capture Patient Experience information

Complaints, OVRs, government or regulatory visits, findings, and corrective actions are recorded when applicable.

### Step 9 — Complete Night-specific information

For a Night report, the Duty Manager records the medical-meeting position and supports next-day Early or Planned Discharge preparation. Relevant inpatient information can be selected and linked.

### Step 10 — Review hot issues and pending items

The Duty Manager confirms the matters requiring attention, including unresolved administrative and operational items that should remain visible.

### Step 11 — Review the Summary

The Summary brings together the completed report. The Duty Manager checks the information before final submission. The application verifies that required information and explanations have been provided.

### Step 12 — Submit the handover

Submission changes the report from an editable draft into a completed handover. A submitted report is no longer treated as unfinished work.

### Step 13 — Incoming Duty Manager reviews the report

The incoming Duty Manager opens the submitted handover and reviews the operational position, events, patient-flow indicators, hot issues, and pending actions.

### Step 14 — Acknowledge the handover

The incoming Duty Manager acknowledges the report. The application records the acknowledgment and timestamp, providing evidence that the handover was received and reviewed.

### Step 15 — Continue unresolved matters

Relevant unresolved administrative and operational issues may be accepted into the next handover. This maintains continuity without changing the historical report from the previous shift.

## 6. Shift Structure

The Duty Manager process operates across three shifts.

| Shift | Business-defined time | Main purpose |
|---|---|---|
| Morning | 08:00–14:00 | Daytime operational oversight, activity review, and escalation |
| Evening | 14:00–20:00 | Continuation of operational oversight and transfer into Night coverage |
| Night | 20:00–08:00 | Overnight operations, medical-meeting information, and next-day discharge planning |

The report records the applicable shift and uses it to organize handovers and dashboard analysis. Operational policy remains the authority for shift timings.

### 6.1 Night-only functions

Night includes additional information because it supports preparation for the following day. The Night Duty Manager can record:

- Whether the Night medical meeting was completed.
- A summary of the medical meeting.
- Planned next-day discharges.
- Early or Planned Discharge patients.
- Relevant inpatient selection and linkage.

This provides visibility before the Morning shift and helps prepare beds, patient movement, discharge coordination, and required follow-up.

## 7. Application Functional Areas

### 7.1 General and Handover Information

This area establishes the identity and executive context of the report.

| Information | Business purpose |
|---|---|
| Report date | Identifies the operational day covered |
| Shift | Identifies Morning, Evening, or Night responsibility |
| Duty Manager | Records the manager responsible for the handover |
| Business Unit | Identifies the hospital or facility |
| Report status | Distinguishes Draft, Completed, and Acknowledged reports |
| Hot Issues | Summarizes the most important priorities, escalations, or risks for the incoming shift |

The general section gives the incoming Duty Manager immediate context before reviewing detailed areas. Hot Issues should focus attention on matters that need awareness or action rather than repeating every detail in the report.

### 7.2 Hospital Events

Hospital Events records significant incidents or occurrences during the shift in a consistent format.

Information may include:

- Event type and event code.
- Event time.
- Patient and patient identification where applicable.
- Hospital location or area.
- Responsible owner or area.
- Event summary or description.
- Actions taken.
- Severity.
- Current resolution status.

Patient search adapts to the selected business unit and event context. ER events use the ER patient source, while hospital or inpatient events use the relevant inpatient source for Egypt or Saudi Arabia. The Duty Manager selects the patient and then records the event details.

This area helps management understand significant events, the response taken, and whether further action remains.

### 7.3 Administrative Issues

Administrative Issues records matters that require coordination, escalation, or follow-up but are not primarily service-functionality incidents.

Examples may include:

- Prolonged admission.
- Delayed discharge.
- ER triage or waiting delay.
- Radiology pending.
- Laboratory pending.
- Equipment-related coordination.
- Operating-room delay.
- Other approved administrative issue categories.

The available category list is maintained in the application’s reference information. For each issue, the Duty Manager records the relevant details, current status, and pending action when the issue is not resolved.

Some operational counts, such as delayed discharges or prolonged ER cases, can be retrieved through Patient Flow. The reason, impact, escalation, ownership, and pending action remain a management narrative completed by the Duty Manager.

### 7.4 Patient Flow

Patient Flow provides a structured view of activity, capacity pressure, discharge performance, theatre activity, DAMA cases, utilization, and staffing.

#### Admissions and ER activity

- ER admissions.
- OPD admissions.
- Total admissions.
- ER volume.
- Prolonged ER cases and explanation.

These indicators help show the level and source of demand during the shift.

#### Discharges

- Total discharges.
- Planned discharges.
- Unplanned discharges.
- Delayed discharge count.
- Delayed discharge explanation.

These measures support bed availability, patient movement, and escalation of discharge barriers.

#### Theatre activity

- Total theatre cases.
- Pre-operative cases.
- Post-operative cases.
- Postponed cases.
- Cancelled cases.

Theatre information helps the Duty Manager understand workload, flow implications, and exceptions requiring follow-up.

#### DAMA

DAMA information records patients who leave or request to leave against medical advice. It covers ER, inpatient, and closed cases as applicable, including patient selection, reason, action taken, and retention outcome.

The application calculates DAMA totals from the entered cases and can use those totals for dashboard indicators.

#### Bed utilization

Utilization is recorded for relevant clinical areas, including inpatient, ICU, CCU, PICU, NICU, cardiovascular, and stroke services where applicable. These values help identify capacity pressure and the areas requiring management attention.

#### Staffing and coverage

- Staffing adequacy.
- Shortage type, such as Nursing, Medical, or Support Staff.
- Coverage shortages.
- Shortfall summary.

When staffing is marked Short, the Duty Manager provides the shortage classification and explanation so the next shift understands the operational impact.

### 7.5 Operations

Operations records disruption or reduced functionality in hospital support and service areas.

Information includes:

- Service functionality.
- Affected service.
- Issue type.
- Description and operational impact.
- Resolution status.
- Pending actions or issues.

Affected services include:

- Laboratory.
- Radiology.
- IT.
- CSSD.
- Pharmacy.
- Facility services.

Typical issue types include equipment breakdown, utility failure, power, air-conditioning, water, and oxygen-related issues. The Duty Manager records whether the service is fully functional, partially affected, or unavailable, together with what has been done and what remains pending.

### 7.6 Patient Experience

Patient Experience records issues that may affect service quality, reputation, regulatory follow-up, or patient satisfaction.

It includes:

- Number of complaints.
- Complaint summary when complaints exist.
- Number of OVRs.
- OVR summary when records exist.
- Government or regulatory visit status.
- Visit findings.
- Corrective or follow-up actions.

The information is entered by the Duty Manager based on the shift’s activity. Required explanations ensure that a reported count is supported by useful context.

### 7.7 Night Shift, Medical Meeting, and Early Discharge

Night functionality supports overnight control and preparation for the following operational day.

The Night Duty Manager records whether the medical meeting took place and provides a meaningful summary. When planned discharges are expected, the application supports selection of the relevant inpatient and identifies whether the discharge is Early or Planned.

The selected patient is linked to the next-day discharge process where applicable. This helps the hospital prepare discharge activities, make beds available earlier, coordinate required actions, and give the Morning team a clear starting position.

The daily Early Discharge list is expected to be available through the connected hospital process. The Duty Manager completes the patient-level selection and relevant details.

### 7.8 Summary and Submission

The Summary consolidates the report before final submission. It allows the Duty Manager to review the handover as one operational record rather than as separate screens.

Before submission, the application checks that required information has been completed. Examples include explanations for shortages, complaints, OVRs, government findings, delayed or prolonged cases, pending actions, event details, and Night information where applicable.

A report remains a Draft until the Duty Manager submits it at the end. The draft can be closed and reopened as often as needed. Closing or leaving the report does not submit it.

### 7.9 Handover Review and Acknowledgment

After submission, the report becomes available for review. The incoming Duty Manager reads the completed handover and acknowledges it.

Acknowledgment:

- Confirms that the report was reviewed.
- Records the incoming manager’s acceptance of the handover.
- Retains an acknowledgment timestamp.
- Supports accountability and continuity between shifts.

A Draft cannot be acknowledged because it has not yet been submitted. After acknowledgment is successfully recorded, the report viewer closes automatically.

### 7.10 Operations Dashboard

The Operations Dashboard provides a management and operational view across submitted handovers.

It supports:

- Date filtering.
- Shift filtering.
- Business-unit filtering.
- Duty Manager filtering.
- Operational indicators.
- Business-unit comparison.
- Major-event monitoring.
- Pending-issue monitoring.
- Acknowledgment visibility.
- Report and export functions.
- Access to related Power BI information where configured.

The dashboard allows users to move from an individual handover to a broader operational view. The intended dashboard access group should follow the approved operations access list and is separate from the general Duty Manager process where required.


## 8. Automated and Manual Information

Duty Manager combines information retrieved from connected records with information entered by the Duty Manager. The distinction matters because a retrieved count still needs operational review, while narratives, decisions, ownership, and escalation depend on the manager’s knowledge of the shift.

| Information or KPI | Source | Entry method | Purpose |
|---|---|---|---|
| Report date, business unit, shift, and Duty Manager | Report setup and user selection | Established when the report starts | Identifies the handover |
| ER admissions | Patient Flow record | Automatically retrieved where available | Shows ER contribution to admissions |
| OPD admissions | Patient Flow record | Automatically retrieved where available | Shows OPD contribution to admissions |
| Total admissions | Patient Flow record | Automatically retrieved where available | Shows total incoming patient activity |
| Total discharges | Patient Flow record | Automatically retrieved where available | Shows completed patient movement |
| Planned discharges | Patient Flow record | Automatically retrieved where available | Supports planned capacity release |
| Delayed discharge count | Patient Flow record | Automatically retrieved where available | Highlights discharge barriers |
| Delayed discharge explanation | Duty Manager knowledge | Manual narrative | Explains causes, action, and escalation |
| Prolonged ER count | Patient Flow record | Automatically retrieved where available | Highlights ER delay pressure |
| Prolonged ER explanation | Duty Manager knowledge | Manual narrative | Explains affected cases and action |
| ER volume | Shift operational information | Manual in the current application | Shows overall ER demand |
| Unplanned discharges | Shift operational information | Manual | Completes the discharge picture |
| Theatre activity | Shift operational information | Manual | Records theatre workload and exceptions |
| Bed utilization | Shift operational information | Manual in the current application | Shows capacity pressure by clinical area |
| Staffing adequacy | Duty Manager assessment | Manual | Records whether coverage is sufficient |
| Coverage shortage and shortfall | Duty Manager assessment | Manual | Identifies the affected staff group and impact |
| DAMA patients | Patient search and Duty Manager entry | Patient selected; details entered manually | Records cases, response, and retention |
| DAMA totals | Entered DAMA cases | Automatically calculated | Supports dashboard and summary indicators |
| Hospital Events | Patient sources and Duty Manager entry | Patient selected where applicable; event details manual | Records significant incidents |
| Administrative Issues | Duty Manager entry and reference categories | Manual | Records coordination and pending matters |
| Operations issues | Duty Manager entry | Manual | Records service disruption and response |
| Patient Experience | Duty Manager entry | Manual | Records complaints, OVRs, visits, and actions |
| Night medical meeting | Duty Manager entry | Manual | Records completion and key outcomes |
| Early/Planned Discharge patient | Inpatient source and Duty Manager selection | Patient retrieved; selection and reason manual | Supports next-day discharge preparation |
| Hot Issues | Duty Manager judgment | Manual | Highlights the most important priorities |
| Pending issues from previous handover | Previous submitted report | Automatically retrieved; user chooses carry-forward | Maintains continuity |
| Major incident count | Hospital Events | Automatically calculated | Summarizes high-severity events |
| Pending issue count | Administrative and Operations records | Automatically calculated | Shows unresolved workload |
| Net patient flow | Admissions and discharges | Automatically calculated | Indicates whether incoming demand exceeds completed discharge |
| Acknowledgment time | Submitted report and acknowledgment | Automatically recorded and calculated | Measures handover completion and response |

Where a Patient Flow count is retrieved, the connected source process that populates the Patient Flow record should remain aligned with the hospital’s approved KPI definition. If the exact upstream source is needed for reporting governance, the **source integration is to be confirmed** with the relevant data owner.

## 9. KPI and Operational Monitoring

The application uses operational indicators to help the Duty Manager and management understand the shift’s position. The indicators support decision-making; they do not replace review of the underlying narrative and pending actions.

### 9.1 Admissions and ER demand

Admissions show the number of patients entering hospital care, with ER and OPD contributions where available. ER volume and prolonged ER cases provide additional context on demand and delay.

**Why it matters:** High demand can affect beds, staffing, diagnostics, theatre activity, and discharge priorities.

**Population:** Core admission totals are retrieved from the Patient Flow record where available. ER volume and explanatory narratives are completed by the Duty Manager in the current application.

### 9.2 Discharges and delayed discharges

Total and Planned Discharges show completed and expected patient movement. Delayed Discharges identify cases that remain in hospital because a required action, service, decision, or arrangement is outstanding.

**Why it matters:** Discharge performance directly affects bed availability, waiting patients, and hospital flow.

**Population:** Counts are retrieved where available; reasons, escalation, and pending actions require Duty Manager explanation.

### 9.3 Prolonged ER cases

This indicator identifies patients whose ER journey has exceeded the expected operational threshold.

**Why it matters:** Prolonged ER stays may signal capacity constraints, pending diagnostics, specialty review delays, or inpatient-bed limitations.

**Population:** The count can be retrieved through Patient Flow. The operational explanation is manual.

### 9.4 Theatre activity

Theatre indicators cover total, pre-operative, post-operative, postponed, and cancelled cases.

**Why it matters:** Theatre exceptions can affect beds, patient experience, clinical scheduling, and next-shift workload.

**Population:** Entered by the Duty Manager from available shift information.

### 9.5 DAMA and retention

DAMA records identify patients leaving or considering leaving against medical advice. Retention information records the outcome of the response.

**Why it matters:** These cases have clinical, experience, documentation, and operational significance.

**Population:** Patient cases and actions are entered by the Duty Manager. Totals and retention indicators are calculated from those entries.

### 9.6 Bed utilization

Utilization records pressure across relevant clinical areas such as inpatient wards and critical-care units.

**Why it matters:** High utilization affects admissions, transfers, staffing, elective activity, and discharge planning.

**Population:** Manually recorded in the current application based on the approved operational source.

### 9.7 Staffing and coverage

Staffing is recorded as Adequate or Short. A shortage is further described by staff group and operational impact.

**Why it matters:** Staffing gaps may require redeployment, escalation, service adjustment, or management action.

**Population:** Duty Manager assessment and entry.

### 9.8 Major incidents and pending issues

The dashboard counts Major events and unresolved administrative or operational issues.

**Why it matters:** These indicators focus attention on severity and unfinished actions across submitted reports.

**Population:** Automatically calculated from the structured report entries.

### 9.9 Net patient flow

Net flow compares admissions with discharges.

**Why it matters:** A positive net inflow can indicate increasing demand on available capacity.

**Population:** Automatically calculated from the recorded admissions and discharges.

### 9.10 Acknowledgment monitoring

Acknowledgment status and elapsed time show whether the incoming Duty Manager formally received the handover.

**Why it matters:** It supports accountability and identifies incomplete handover transitions.

**Population:** Automatically recorded when acknowledgment succeeds.

### 9.11 Night-specific monitoring

Night medical-meeting information and next-day discharge planning apply to Night reports.

**Why it matters:** They prepare the hospital for Morning activity and improve visibility of expected bed release.

**Population:** Completed by the Night Duty Manager, using available inpatient and discharge information.

## 10. Business Unit and Country Handling

The application supports four hospital business units.

| Business unit | Country handling | Patient information used |
|---|---|---|
| AHJ | Saudi Arabia | KSA patient and inpatient sources |
| AMH | Egypt | Egypt patient and inpatient sources |
| ASH | Egypt | Egypt patient and inpatient sources |
| SMH | Egypt | Egypt patient and inpatient sources |

The handover process remains consistent across the four facilities. The main country-specific difference is patient search and linkage.

For AHJ, the application uses the relevant KSA outpatient and inpatient information. For AMH, ASH, and SMH, it uses the corresponding Egypt outpatient and inpatient information. ER patient information is used for ER-related events and DAMA cases.

This approach gives management a common reporting structure while preserving the correct patient context for each facility.

## 11. Data and Integration Overview

### 11.1 Solution overview

Duty Manager is delivered through Microsoft Power Platform and Power Apps. Dataverse holds the structured handover and related operational records. The application retrieves relevant patient and operational information from connected hospital sources and combines it with the Duty Manager’s shift assessment.

The overall information flow is:

**Hospital Operational and Patient Sources**  
→ **Integration and Data Processing**  
→ **Dataverse**  
→ **Duty Manager Application**  
→ **Submitted and Acknowledged Handover**  
→ **Operations Dashboard and Extracted Report**

### 11.2 Purpose of each layer

| Layer | Business purpose |
|---|---|
| Hospital operational and patient sources | Provide patient identity and available operational activity information |
| Integration and data processing | Make approved information available in the form required by the application |
| Dataverse | Store handovers, section details, patient references, statuses, actions, and acknowledgment |
| Duty Manager application | Guide the manager through review, entry, validation, submission, and acknowledgment |
| Dashboard and extracted report | Present operational visibility and support management reporting |

### 11.3 Key data areas

| Data area | What it stores from a business perspective |
|---|---|
| Handover Report | Date, shift, business unit, Duty Manager, status, hot issues, and acknowledgment |
| Patient Flow | Admissions, discharges, delays, theatre, DAMA, utilization, and staffing |
| Hospital Events | Significant events, patient, location, severity, action, and status |
| Administrative Issues | Coordination matters, current status, and pending actions |
| Operations | Service disruption, affected area, impact, resolution status, and next action |
| Patient Experience | Complaints, OVRs, regulatory visits, findings, and corrective action |
| Early Discharge | Next-day Early or Planned Discharge patients and related information |
| Alerts | Operational alerts displayed to the user |

### 11.4 Related reporting

The Operations Dashboard provides application-based monitoring, and a related Power BI link is available where configured. Reporting access and distribution should follow the approved management and operations access model.

## 12. Reporting and Export

Reporting is the current focus because the final extracted-report structure is awaiting confirmation.

### 12.1 What currently exists

The application currently provides:

- A handover report that can be generated as a PDF.
- A report viewer for submitted handovers.
- An Operations Dashboard with filters and operational indicators.
- A dashboard export of the filtered report population.
- Report status and acknowledgment information.
- Access to related Power BI information where configured.

The current outputs demonstrate that the required data can be presented and extracted. The final business format has not yet been approved.

### 12.2 Current dashboard filtering

The dashboard can organize information by:

- Date.
- Shift.
- Business unit.
- Duty Manager.

It also presents operational signals such as major events, pending issues, patient-flow measures, DAMA activity, report status, and acknowledgment.

### 12.3 Decision required

**FINAL REPORT STRUCTURE IS AWAITING CONFIRMATION.**

The business owner needs to confirm:

1. **Audience:** Who will receive or use the report?
2. **Frequency:** Is it required per shift, daily, weekly, monthly, or for a custom date range?
3. **Sections:** Which handover areas must appear?
4. **KPIs:** Which indicators and totals are required?
5. **Detail level:** Should it include patient-level information or summary information only?
6. **Filters:** Should the extracted report always reflect the dashboard filters selected by the user?
7. **Format:** Is the preferred output PDF, Excel, or both?
8. **Grouping and order:** How should facilities, dates, shifts, issues, and KPIs be organized?
9. **Management summary:** Is an executive summary, exception page, or trend section required?
10. **Branding:** What title, logo, confidentiality label, and standard footer are required?
11. **Acknowledgment:** Should the report show acknowledgment status, timestamp, and Duty Manager details?
12. **Distribution:** Will users download it on demand, or will it be distributed through an agreed reporting process?

### 12.4 Completion approach

After the approved sample or specification is received:

1. Compare the approved structure with the current report and export.
2. Adjust the layout, sections, fields, filters, and format where required.
3. Validate the result with representative business-unit and shift data.
4. Obtain formal approval from the report owner.
5. Include the approved output in final acceptance and handover.

## 13. Completed Development

Development has delivered the following business capabilities.

### Handover lifecycle

- Start a report for a business unit and shift.
- Continue an existing matching draft.
- Save work during completion.
- Close and reopen a draft without submitting it.
- Delete an unwanted draft.
- Review the complete report.
- Submit the final handover.
- Review and acknowledge the previous handover.

### Operational information

- General and Hot Issues.
- Hospital Events.
- Administrative Issues.
- Patient Flow.
- Operations and service functionality.
- Patient Experience.
- Night medical-meeting information.
- Early and Planned Discharge support.

### Patient information

- ER patient search.
- Egypt outpatient and inpatient search.
- KSA outpatient and inpatient search for AHJ.
- Patient linkage to events, DAMA cases, and Early Discharge where applicable.

### Patient Flow and monitoring

- Admissions and discharge information.
- Delayed Discharge and prolonged ER information.
- Theatre activity.
- DAMA entry, totals, and retention indicators.
- Bed-utilization capture.
- Staffing adequacy and coverage shortage.
- Dashboard operational indicators.

### Continuity and accountability

- Draft remains open until final submission.
- Submitted report becomes available for review.
- Acknowledgment and timestamp are retained.
- Relevant unresolved issues can carry forward.
- Duplicate report safeguards are applied.
- Required explanations and pending actions are validated.

### Reporting and visibility

- Handover PDF.
- Report viewer.
- Operations Dashboard.
- Date, shift, business-unit, and Duty Manager filters.
- Current export capability.
- Related Power BI access where configured.

### User experience

- Structured navigation through the handover.
- Clear status between Draft, Completed, and Acknowledged.
- Summary before submission.
- Automatic close after successful acknowledgment.
- Interface behavior suitable for the application’s supported screen sizes.

## 14. Current Outstanding Items

### Primary outstanding item

The final structure and content of the extracted or generated report must be confirmed by the business owner.

This confirmation should provide:

- An approved sample or layout.
- Required audience and reporting period.
- Required sections, fields, and KPIs.
- Required grouping and field order.
- Required level of patient detail.
- Dashboard filter behavior.
- Preferred output format.
- Branding and management-summary requirements.
- Required acknowledgment information.

After this decision, the existing report/export can be adjusted if necessary and taken through final approval.

No unrelated codebase observations should be treated as project blockers. The project status remains **Development Completed**.

## 15. Next Steps

1. Receive and confirm the required report structure.
2. Confirm the required report fields, KPIs, grouping, and layout.
3. Confirm the export format and reporting period.
4. Confirm whether selected dashboard filters must apply to the report.
5. Adjust the current report or export where required.
6. Validate the output against an approved sample and representative data.
7. Obtain final business acceptance and sign-off.
8. Proceed with final release and management handover as applicable.

## 16. Management Handover Summary

| Item | Management handover position |
|---|---|
| **Project** | Duty Manager |
| **Purpose** | Structured hospital Duty Manager shift handover and operational monitoring |
| **Hospitals / business units** | AHJ, AMH, ASH, and SMH |
| **Current status** | **Development Completed** |
| **Current phase** | Final report structure confirmation and reporting alignment |
| **Completed capabilities** | Draft-to-submission handover lifecycle; General, Events, Administrative Issues, Patient Flow, Operations, Patient Experience, Night, and Early Discharge functions; patient lookup; acknowledgment; carry-forward; dashboard; current reporting and export |
| **Primary outstanding item** | Final extracted/generated report structure confirmation |
| **Next action** | Obtain the approved report structure, adjust the existing output if required, validate it, and complete sign-off |
| **Source repository** | https://github.com/MaryamEzat/Duty-Manager |

Duty Manager provides the hospital with a consistent operational handover record and a clear transfer of accountability between shifts. The application has been developed and the required business areas are in place. The project is now waiting for the business decision that defines the final management report.

Once that decision is received, the team can align the output, validate it against the approved example, and complete final acceptance and handover.
