# Functional flow contract

- **CREATE / LOG** creates a new record with a new ID; the form starts in create mode.
- **UPDATE** edits the existing record identified by `recordId`; it never appends a row.
- **OPEN** loads the selected record by ID for detail or edit presentation.
- **ASSIGN** updates ownership on an existing responsibility/issue ID.
- **SUBMIT** changes the handover lifecycle state after readiness and final-note validation.
- **ACKNOWLEDGE** records incoming acceptance and is separate from submission.
- **CARRY FORWARD** links or creates a responsibility for a later handover only when the backend rule is defined (`TODO_BUSINESS_RULE`).

Navigation uses `js/navigation.js`; module routes and record navigation are not scattered through individual page handlers.
