# Duty Manager data-ready handoff

This folder is the redesigned Duty Manager app with the data contract from the existing working Duty Manager implementation applied around the approved pages. It runs in mock mode by default and can use Dataverse in a hosted Power Apps/model-driven context with `?dataMode=dataverse`.

## Page matrix

| Module | Current file | Integration reference |
|---|---|---|
| Home / Shift Command | `pages/home.html` | `src/duty/DutyManager.tsx` home reports, drafts, priority routing |
| Group Operations Command Center | `pages/command-center.html` | dashboard/report lifecycle and command-center snapshot logic |
| General / Shift Identity | `pages/general.html` | `Dma_handoverreports*` and `Systemusers*` |
| Hospital Events | `pages/hospital-events.html` | `Dma_hospitalevents*`, event type/code references, patient lookups |
| Administrative Issues | `pages/administrative-issues.html` | `Dma_administrativeissueentries*`, `Dma_administrativeissues*` catalog |
| Patient Flow | `pages/patient-flow.html` | `Dma_patientflowsummaries*`, `Dma_patientflowentries*`, patient lookups |
| Operations | `pages/operations.html` | `Dma_opeartions*` |
| Experience | `pages/experience.html` | `Dma_patientexperiences*` |
| Summary / Handover Review | `pages/summary.html` | readiness, final review, submit, carry-forward contracts |

## Architecture

`UI page -> controller -> service -> repository -> data provider`

`js/repositories/repository.js` selects `mockRepository` or `dataverseRepository` from `appState.dataMode`. Mock mode persists to `localStorage`; Dataverse mode uses the centralized `Xrm.WebApi` wrapper in `js/repositories/dataverse-repository.js`.

## New or changed files

- `js/repositories/repository.js`: provider selector and interface assertion.
- `js/repositories/mock-repository.js`: persistent mock CRUD and readiness logic.
- `js/repositories/dataverse-repository.js`: centralized Dataverse Web API adapter.
- `js/config/dataverse-schema.js`: known table/column/choice mappings imported from the working app.
- `js/app.js`: browser-safe boot guard.\n- `js/duty-page-bridge.js`: non-visual bridge that wires existing page buttons to the controller/service/repository layer and creates/reuses a real handover id before child records are logged.
- `pages/dm-navigation.js` and page inline legacy links: normalized to the actual `pages/*.html` filenames.

## Known Dataverse mappings

Known tables: `dma_handoverreports`, `dma_hospitalevents`, `dma_administrativeissueentries`, `dma_administrativeissues`, `dma_patientflowsummaries`, `dma_patientflowentries`, `dma_patientexperiences`, `dma_opeartions`, `dma_alerts`, `dma_eventtypes`, `dma_eventcodes`, `systemusers`, `cr301_ervisitses`, `ipd_patients`, `opd_patients`, `opd_ksapatientses`.

Known choices: business unit, shift, report status, severity, resolution status, service affected, service functionality, issue type, staff adequacy, shortage type, and yes/no regulatory visit values. The Dataverse repository maps redesigned-page field names back to the exact `dma_*` payloads used in `src/duty/DutyManager.tsx`.

Still unknown: carry-forward table and relationships, submitted timestamp column, hospital event operational state/department/MRN text columns, administrative due/priority columns, individual experience item type/workflow/follow-up columns, retention patient handover relationship, assignment ownership write policy, acknowledgement permissions, time-zone policy, and final submission-blocking business rules.

## Mock/session functions

Mock mode powers local CRUD for hospital events, administrative issues, patient flow snapshot, retention patients, operations, experience items, final reviews, command-center issues, carry-forward responsibilities, and submission readiness. Existing inline page scripts still preserve the approved modal/UI behavior while the bridge sends their values through the same data services.

## Dataverse-ready functions

Dataverse methods exist for handovers, previous handover, hospital events, administrative issues, patient flow snapshot, operational exceptions, experience aggregates, command-center snapshots, readiness, final review save, and submit. Methods with unknown schema throw clear configuration errors instead of writing invented fields.

## Power Platform handoff needs

Provide final table logical names, primary IDs, lookup schema names, choice values, ownership/assignment rules, submit/acknowledge lifecycle columns, carry-forward relationship, security roles, host runtime confirmation for `Xrm.WebApi`, and date/time-zone policy.

The original working app in `C:\Users\mariam.hisham\my-app` was inspected for mappings and was not modified.

