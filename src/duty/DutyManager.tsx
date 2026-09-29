import { createPortal } from 'react-dom'
import { Children, cloneElement, createContext, Fragment, isValidElement, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  adminFallbackOptions, businessUnits, labelFor, resolutionOptions, serviceAffectedOptions, serviceFunctionalityOptions,
  opsIssueOptions, Services, severityOptions, shiftFromValue, shiftMap, shortageOptions, staffOptions,
  type AdminIssue, type DamaEntry, type DraftRecord, type EarlyDischarge, type EventItem, type FormState, type MainView, type OpsIssue, type PatientArea, type Resolution, type Severity, type Shift, type TabKey,
} from './data'
import { createDataverseClient, PulseNavigation } from 'pulse-shared-navigation'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'
import { downloadReportPdf, type PdfField, type PdfReport, type PdfSection } from './reportPdf'
import { cleanId, compact, displayName, fallbackAlerts, formatDate, getDrafts, initialForm, list, missingFieldTab, reportCode, sameHandover, shortDate, shortTime, unwrap, validate } from './utils'

// Pulse is the container for all apps: the shared Pulse navigation opens from the "Pulse Apps" button at
// the top of our sidebar (same pattern as the other Pulse apps). One client for the app's lifetime.
const pulseClient = createDataverseClient(MicrosoftDataverseService)
// This app's Power Apps id (power.config.json appId), so Pulse highlights Duty Manager.
const DUTY_MANAGER_APP_ID = 'bb72cb69-df81-4520-ad19-da8de18c6f49'

type ReportSort = { key: 'date' | 'manager' | 'state' | 'submitted'; dir: 'asc' | 'desc' }

// Local calendar day ("YYYY-MM-DD") of a Dataverse date-time, for date filters.
function localDateKey(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

type AlertRow = { id: string; title: string; description: string; severity: string; isRead: boolean; createdOn?: string; reportId?: string }

type ReportBundle = { report: any; flow: any[]; flowEntries: any[]; events: any[]; admin: any[]; ops: any[]; experience: any[]; loading?: boolean }
const governmentVisitOptions: [string, string][] = [['999740000', 'Yes'], ['999740001', 'No']]

// Set once the user tries to submit, so every page can flag its own missing required fields.
const ValidationContext = createContext<{ show: boolean; missing: string[] }>({ show: false, missing: [] })
const reportTabs: [string, string, TabKey][] = [
  ['01', 'General / Shift Identity', 'general'],
  ['02', 'Hospital Events', 'events'],
  ['03', 'Administrative Issues', 'admin'],
  ['04', 'Patient Flow', 'flow'],
  ['05', 'Operations', 'ops'],
  ['06', 'Experience', 'experience'],
]
// Row labels validate() uses for list items, e.g. "DAMA Entry 2 Reason" belongs to row "DAMA Entry 2".
const missingItemPattern = /^(Event \d+|Admin Issue \d+|Ops Issue \d+|DAMA Entry \d+|Discharge Patient \d+|Tomorrow Discharge Plan)\b/

// Returns a checker telling whether a list row (e.g. "Event 1") has missing fields after a submit attempt.
function useMissingItem() {
  const validation = useContext(ValidationContext)
  return (item: string) => validation.show && validation.missing.some((field) => field.startsWith(`${item} `))
}

// ── Pulse feedback: toast rack + confirm dialog (the design system forbids alert()/confirm()) ──

type ToastKind = 'success' | 'alert' | 'info'

function toastKind(message: string): ToastKind {
  if (/fail|could not|cannot|unable|error|please|not deleted|not found|missing|required/i.test(message)) return 'alert'
  if (/success|saved|submitted|acknowledged|deleted|created|added|removed|updated/i.test(message)) return 'success'
  return 'info'
}

const toastTitles: Record<ToastKind, string> = { success: 'Done', alert: 'Action needed', info: 'Notice' }

function ToastRack({ message, onClose }: { message: string; onClose: () => void }) {
  const kind = toastKind(message)
  useEffect(() => {
    if (!message) return
    // Errors stay longer so they can be read; everything else uses the standard 4.5s.
    const timer = window.setTimeout(onClose, kind === 'alert' ? 8000 : 4500)
    return () => window.clearTimeout(timer)
  }, [message, kind, onClose])
  return <div className="toast-rack" aria-live="polite">
    {message && <div className={`toast toast-${kind}`} role={kind === 'alert' ? 'alert' : 'status'}>
      <svg className="toast-icon" viewBox="0 0 24 24" aria-hidden="true">
        {kind === 'success' ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></>
          : kind === 'alert' ? <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>
          : <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>}
      </svg>
      <div className="toast-body"><div className="toast-title">{toastTitles[kind]}</div><div className="toast-msg">{message}</div></div>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={onClose}>×</button>
    </div>}
  </div>
}

type ConfirmRequest = { title: string; message: string; confirmLabel: string; resolve: (ok: boolean) => void }
let openConfirmDialog: ((request: ConfirmRequest) => void) | null = null

// Promise-based replacement for window.confirm, rendered by <ConfirmHost />.
function pulseConfirm(title: string, message: string, confirmLabel = 'Delete'): Promise<boolean> {
  if (!openConfirmDialog) return Promise.resolve(false)
  return new Promise((resolve) => openConfirmDialog?.({ title, message, confirmLabel, resolve }))
}

function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  useEffect(() => {
    openConfirmDialog = setRequest
    return () => { openConfirmDialog = null }
  }, [])
  useEffect(() => {
    if (!request) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  function close(ok: boolean) {
    request?.resolve(ok)
    setRequest(null)
  }
  if (!request) return null
  return <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(event) => { if (event.target === event.currentTarget) close(false) }}>
    <div className="confirm-box">
      <div className="confirm-hdr">
        <span className="confirm-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg></span>
        <h3 id="confirm-title">{request.title}</h3>
      </div>
      <div className="confirm-body">{request.message}</div>
      <div className="confirm-actions">
        <button type="button" className="btn" onClick={() => close(false)}>Cancel</button>
        <button type="button" className="btn danger-solid" autoFocus onClick={() => close(true)}>{request.confirmLabel}</button>
      </div>
    </div>
  </div>
}

// ── Previous handover acknowledgment ──
// The latest submitted handover for the same business unit must be acknowledged before the incoming
// duty manager can work on the new report (every page except General is locked until then).
type PreviousHandover = { report: any; carryItems: any[]; loading: boolean; failed: boolean; message: string; acknowledge: () => Promise<void>; retry: () => void; markAcknowledged: (id: string, timestamp: string) => void }

function usePreviousHandover(active: boolean, form: FormState, reportId: string, acknowledgeHandover: (id: string) => Promise<void>): PreviousHandover {
  const [report, setReport] = useState<any>(null)
  const [carryItems, setCarryItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!active || !form.businessUnit || !form.reportDate) return
    let cancelled = false
    setLoading(true)
    setFailed(false)
    setMessage('')
    ;(async () => {
      try {
        // A lookup that never answers must not lock the report forever: after 15s it counts as failed.
        const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Previous handover lookup timed out')), 15000))
        const found = await Promise.race([retrievePreviousSameBuReport(form, reportId), timeout])
        const carried = found?.dma_handoverreportid ? await Promise.race([retrieveCarryForwardItems(cleanId(found.dma_handoverreportid)), timeout]).catch(() => []) : []
        if (!cancelled) { setReport(found); setCarryItems(carried) }
      } catch (error) {
        console.warn('Previous handover lookup failed', error)
        if (!cancelled) { setReport(null); setCarryItems([]); setFailed(true); setMessage('Could not retrieve the previous handover.') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, form.businessUnit, form.reportDate, reportId, attempt])

  // Uses the app-wide acknowledgment so the report viewer and Home list update too.
  async function acknowledge() {
    if (!report?.dma_handoverreportid) return
    setMessage('Acknowledging previous handover...')
    try {
      await acknowledgeHandover(report.dma_handoverreportid)
      setMessage('Previous handover acknowledged.')
    } catch (error) {
      console.warn('Previous handover acknowledgment failed', error)
      setMessage('Could not acknowledge the previous handover.')
    }
  }

  // Called when the same report is acknowledged anywhere else (e.g. from the report viewer).
  function markAcknowledged(id: string, timestamp: string) {
    setReport((current: any) => current && cleanId(current.dma_handoverreportid) === cleanId(id) ? { ...current, dma_dmacknowledgmenttimestamp: timestamp } : current)
    setMessage('Previous handover acknowledged.')
  }

  return { report, carryItems, loading, failed, message, acknowledge, retry: () => setAttempt((n) => n + 1), markAcknowledged }
}

// True while a previous handover exists and is not yet acknowledged (or is still being checked).
function acknowledgmentPending(previous: PreviousHandover) {
  if (previous.loading) return true
  return Boolean(previous.report?.dma_handoverreportid) && !previous.report.dma_dmacknowledgmenttimestamp
}

function AcknowledgeGate({ previous, openReport, goGeneral }: { previous: PreviousHandover; openReport: (id: string) => void; goGeneral: () => void }) {
  const r = previous.report
  return <main className="workflow-page ack-gate-page">
    <section className="ack-gate" role="alert">
      <span className="ack-gate-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></span>
      {previous.loading ? <>
        <h2>Checking the previous handover...</h2>
        <p>Looking for the latest submitted handover for this business unit.</p>
      </> : <>
        <h2>Acknowledge the previous handover to continue</h2>
        <p>You need to review and acknowledge <b>{r?.dma_name || 'the previous handover'}</b>{r ? ` (${labelFor(businessUnits, r.dma_businessunit)} · ${shiftFromValue(r.dma_shifttype)} shift · ${formatDate(r.dma_reportdate)})` : ''} before working on this report.</p>
        {previous.message && <p className="ack-gate-status">{previous.message}</p>}
        <div className="ack-gate-actions">
          {r?.dma_handoverreportid && <button type="button" className="btn" onClick={() => openReport(r.dma_handoverreportid)}>View previous report</button>}
          <button type="button" className="btn primary" onClick={previous.acknowledge}>Acknowledge</button>
          <button type="button" className="btn" onClick={goGeneral}>Go to General</button>
        </div>
      </>}
    </section>
  </main>
}

// ── Shared timeline pieces (Events, Admin issues, Operations) ──

type FilterOption = { value: string; label: string; count: number; tone: 'all' | 'danger' | 'warning' | 'success' | 'gold' }

// Coloured filter pills above a timeline; the active pill is filled in its tone.
function TimelineFilters({ options, value, onChange, label }: { options: FilterOption[]; value: string; onChange: (value: string) => void; label: string }) {
  return <div className="timeline-filters" role="group" aria-label={label}>
    {options.map((option) => <button type="button" key={option.value} className={`timeline-filter tone-${option.tone}${value === option.value ? ' active' : ''}`} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      {option.tone !== 'all' && <i className="filter-dot" />}{option.label}<b>{option.count}</b>
    </button>)}
  </div>
}

// ── In-app pop-ups (dropdown list, calendar) ──
// Native <select> lists and date pickers are drawn by the browser and can spill outside the app frame
// (the Power Apps iframe). These are rendered at page level (so overflow:hidden containers don't clip
// them), kept inside the viewport, opened upward when there is no room below, and they follow their
// trigger while the page scrolls.
function useFloating(open: boolean, close: () => void, minWidth: number, preferredHeight: number, maxWidth = Infinity) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const floatingRef = useRef<HTMLElement | null>(null)
  const [style, setStyle] = useState<React.CSSProperties>({})

  const position = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const gutter = 8
    const width = Math.min(Math.max(rect.width, minWidth), maxWidth, window.innerWidth - gutter * 2)
    const left = Math.min(Math.max(gutter, rect.left), window.innerWidth - width - gutter)
    const below = window.innerHeight - rect.bottom - gutter
    const above = rect.top - gutter
    const openUp = below < Math.min(preferredHeight, 220) && above > below
    const maxHeight = Math.max(140, Math.min(preferredHeight, (openUp ? above : below) - 4))
    setStyle(openUp
      ? { left, width, maxHeight, bottom: window.innerHeight - rect.top + 4 }
      : { left, width, maxHeight, top: rect.bottom + 4 })
  }, [minWidth, preferredHeight, maxWidth])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !floatingRef.current?.contains(target)) close()
    }
    // Scrolling inside the pop-up itself is ignored; anything else repositions it.
    const follow = (event: Event) => {
      if (event.target instanceof Node && floatingRef.current?.contains(event.target)) return
      position()
    }
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, true)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, true)
    }
  }, [open, close, position])

  return { triggerRef, floatingRef, style, position }
}

const Chevron = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>

type SelectOption = { value: string; label: string }

function PulseSelect({ value, options, onChange, ariaLabel, placeholder, disabled, title }: {
  value: string; options: SelectOption[]; onChange: (value: string) => void; ariaLabel: string
  placeholder?: string; disabled?: boolean; title?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const closeList = useCallback(() => setOpen(false), [])
  const { triggerRef, floatingRef, style, position } = useFloating(open, closeList, 180, 280)
  const listId = useId()
  const selectedIndex = options.findIndex((option) => option.value === value)
  const showPlaceholder = selectedIndex < 0 && Boolean(placeholder)
  const shownIndex = selectedIndex < 0 && !placeholder ? 0 : selectedIndex

  function openList() {
    if (disabled) return
    position()
    setActive(Math.max(0, selectedIndex))
    setOpen(true)
  }

  function choose(index: number) {
    onChange(options[index].value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (open) floatingRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active, floatingRef])

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); openList() }
      return
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(options.length - 1, index + 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(0, index - 1)) }
    else if (event.key === 'Home') { event.preventDefault(); setActive(0) }
    else if (event.key === 'End') { event.preventDefault(); setActive(options.length - 1) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (options[active]) choose(active) }
    else if (event.key === 'Escape' || event.key === 'Tab') setOpen(false)
  }

  return <div className="pulse-select">
    <button ref={triggerRef} type="button" className={`pulse-select-trigger${open ? ' open' : ''}${showPlaceholder ? ' is-placeholder' : ''}`} disabled={disabled} title={title}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel}
      aria-activedescendant={open ? `${listId}-${active}` : undefined} onClick={() => open ? setOpen(false) : openList()} onKeyDown={onKeyDown}>
      <span>{showPlaceholder ? placeholder : options[shownIndex]?.label ?? ''}</span>
      <Chevron />
    </button>
    {open && createPortal(<ul ref={(node) => { floatingRef.current = node }} id={listId} className="pulse-select-list" role="listbox" aria-label={ariaLabel} style={style}>
      {options.length === 0 && <li className="empty-option" aria-disabled="true">No options available</li>}
      {options.map((option, index) => <li key={option.value} id={`${listId}-${index}`} role="option" aria-selected={index === selectedIndex}
        className={`${index === active ? 'active' : ''}${index === selectedIndex ? ' selected' : ''}`}
        onMouseEnter={() => setActive(index)}
        // preventDefault keeps a wrapping <label> from re-clicking the trigger.
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => { event.preventDefault(); choose(index) }}>{option.label}</li>)}
    </ul>, document.body)}
  </div>
}

// Calendar date picker; value/onChange use "YYYY-MM-DD" like <input type="date">.
function PulseDatePicker({ value, onChange, ariaLabel, placeholder = 'Select date', allowClear }: { value: string; onChange: (value: string) => void; ariaLabel: string; placeholder?: string; allowClear?: boolean }) {
  const [open, setOpen] = useState(false)
  const closeCalendar = useCallback(() => setOpen(false), [])
  const { triggerRef, floatingRef, style, position } = useFloating(open, closeCalendar, 272, 340, 300)
  const parse = (text: string) => { const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null }
  const toValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const selected = parse(value)
  const [month, setMonth] = useState(() => { const base = selected || new Date(); return new Date(base.getFullYear(), base.getMonth(), 1) })
  const today = toValue(new Date())

  function openCalendar() {
    const base = selected || new Date()
    setMonth(new Date(base.getFullYear(), base.getMonth(), 1))
    position()
    setOpen(true)
  }

  function pick(date: Date) {
    onChange(toValue(date))
    setOpen(false)
    triggerRef.current?.focus()
  }

  // Six weeks starting on the Sunday on or before the 1st.
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const days = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i - first.getDay() + 1))
  const label = selected ? selected.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : placeholder

  return <div className="pulse-select">
    <button ref={triggerRef} type="button" className={`pulse-select-trigger pulse-date-trigger${open ? ' open' : ''}${selected ? '' : ' is-placeholder'}`}
      aria-haspopup="dialog" aria-expanded={open} aria-label={`${ariaLabel}: ${label}`} onClick={() => open ? setOpen(false) : openCalendar()}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}>
      <span>{label}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
    </button>
    {open && createPortal(<div ref={(node) => { floatingRef.current = node }} className="pulse-calendar" role="dialog" aria-label={ariaLabel} style={style}
      onMouseDown={(event) => event.preventDefault()} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus() } }}>
      <div className="pulse-calendar-head">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
        <strong>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
        <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>
      </div>
      <div className="pulse-calendar-grid" role="grid">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day} className="weekday" role="columnheader">{day}</span>)}
        {days.map((day) => {
          const key = toValue(day)
          return <button type="button" key={key} role="gridcell"
            className={`${day.getMonth() !== month.getMonth() ? 'outside' : ''}${key === value.slice(0, 10) ? ' selected' : ''}${key === today ? ' today' : ''}`}
            aria-selected={key === value.slice(0, 10)} aria-label={day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            onClick={(event) => { event.preventDefault(); pick(day) }}>{day.getDate()}</button>
        })}
      </div>
      <div className="pulse-calendar-foot">
        {allowClear && value && <button type="button" className="clear" onClick={(event) => { event.preventDefault(); onChange(''); setOpen(false); triggerRef.current?.focus() }}>Clear</button>}
        <button type="button" onClick={(event) => { event.preventDefault(); pick(new Date()) }}>Today</button>
      </div>
    </div>, document.body)}
  </div>
}
function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="btn small row-delete" aria-label={label} title={label} onClick={onClick}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
  </button>
}

// Titled detail line inside a timeline row, e.g. "Action".
function TimelineField({ title, text }: { title: string; text?: string }) {
  if (!text?.trim()) return null
  return <div className="tl-field"><span>{title}</span><p>{text}</p></div>
}

// Resolution status (Pending / In Progress / Resolved) filters, shared by Admin issues and Operations.
const statusTone: Record<string, FilterOption['tone']> = { '778000000': 'warning', '778000002': 'gold', '778000001': 'success' }
function statusFilters(statuses: string[]): FilterOption[] {
  return [
    { value: 'all', label: 'All', count: statuses.length, tone: 'all' },
    ...resolutionOptions.map(([value, label]) => ({ value, label, count: statuses.filter((status) => String(status) === value).length, tone: statusTone[value] || 'gold' })),
  ]
}

const patientLine = (name?: string, code?: string, area?: string) => name ? `${name}${code ? ` (${code})` : ''}${area ? ` · ${area}` : ''}` : ''

function scrollToMissing(field: string) {
  const item = field.match(missingItemPattern)?.[1]
  const target = (item && document.querySelector(`[data-missing-item="${item}"]`)) || document.querySelector('.has-missing, .field.has-error')
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
const outageFunctionalityOptions = serviceFunctionalityOptions.filter(([value]) => value !== '778000002')
const compactLayoutStyles = `
  .home-modern, .dashboard.command-dashboard { margin-top: 8px; }
  .editor-shell, .workflow-page { margin-top: 14px; }
  .home-hero { min-height: 108px; padding: 16px 26px; }
  .page-title { margin-bottom: 16px; }
  .page-title h1, .home-hero h1 { font-size: 30px; }
  .home-section-head { margin: 12px 0 7px; align-items: center; }
  .home-section-head h2 { font-size: 18px; }
  .current-row { min-height: 60px; padding-top: 10px; padding-bottom: 10px; }
  .current-row h3 { font-size: 14px; }
  .current-row p { margin-top: 3px; font-size: 11px; }
  .readiness-panel { padding: 14px 18px; }
  .readiness-panel > small { margin-top: 8px; }
  .readiness-panel > strong { font-size: 36px; }
  .readiness-panel p { margin-bottom: 9px; }
  .readiness-list { gap: 6px; }
  .ready-row { font-size: 11px; }
  .draft-strip { margin-top: 12px; padding: 10px 18px; }
  .draft-strip .eyebrow { margin-bottom: 5px; }
  .draft-row { padding: 7px 0; }
  .modern-filter { width: auto; }
  @media (min-width: 901px) {
    .home-modern, .editor-shell, .workflow-page, .dashboard.command-dashboard {
      width: min(1680px, calc(100vw - 320px));
    }
  }
  @media (max-height: 820px) and (min-width: 901px) {
    .home-modern, .dashboard.command-dashboard { margin-top: 4px; }
    .editor-shell, .workflow-page { margin-top: 10px; }
    .home-hero { min-height: 100px; padding-top: 14px; padding-bottom: 14px; }
  }
`

export function DutyManager() {
  const [view, setView] = useState<MainView>('home')
  const [tab, setTab] = useState<TabKey>('general')
  const [form, setForm] = useState<FormState>(initialForm)
  const [draftId, setDraftId] = useState('')
  const [reportId, setReportId] = useState('')
  const [flowSummaryId, setFlowSummaryId] = useState('')
  const [experienceId, setExperienceId] = useState('')
  const [events, setEvents] = useState<EventItem[]>([])
  const [adminIssues, setAdminIssues] = useState<AdminIssue[]>([])
  const [opsIssues, setOpsIssues] = useState<OpsIssue[]>([])
  const [damaEntries, setDamaEntries] = useState<DamaEntry[]>([])
  const [earlyDischarges, setEarlyDischarges] = useState<EarlyDischarge[]>([])
  const [drafts, setDrafts] = useState<DraftRecord[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [reportFilter, setReportFilter] = useState('all')
  const [dutyManagerFilter, setDutyManagerFilter] = useState('all')
  const [reportPage, setReportPage] = useState(1)
  const [reportDateFilter, setReportDateFilter] = useState('')
  const [reportSort, setReportSort] = useState<ReportSort>({ key: 'date', dir: 'desc' })
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
  const clearMessage = useCallback(() => setMessage(''), [])
  const [pdfOnOpen, setPdfOnOpen] = useState(false)
  const [pulseOpen, setPulseOpen] = useState(false)
  const autosaveInFlight = useRef(false)

  const discharges = form.discharges
  const dutyManagerOptions = useMemo(() => Array.from(new Set(reports.map(displayName).filter((name) => name && name !== 'N/A'))).sort(), [reports])
  const filteredReports = useMemo(() => {
    const rows = reports.filter((report) => {
      const matchesBusinessUnit = reportFilter === 'all' || String(report.dma_businessunit) === reportFilter
      const matchesDutyManager = dutyManagerFilter === 'all' || displayName(report) === dutyManagerFilter
      const matchesDate = !reportDateFilter || localDateKey(report.dma_reportdate) === reportDateFilter
      return matchesBusinessUnit && matchesDutyManager && matchesDate
    })
    const value = (report: any): string | number => {
      if (reportSort.key === 'manager') return displayName(report).toLowerCase()
      if (reportSort.key === 'state') return report.dma_dmacknowledgmenttimestamp ? 1 : 0
      if (reportSort.key === 'submitted') return new Date(report.createdon || 0).getTime()
      return new Date(report.dma_reportdate || report.createdon || 0).getTime()
    }
    const direction = reportSort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => { const x = value(a), y = value(b); return x < y ? -direction : x > y ? direction : 0 })
  }, [reports, reportFilter, dutyManagerFilter, reportDateFilter, reportSort])
  const pagedReports = useMemo(() => filteredReports.slice((reportPage - 1) * 5, reportPage * 5), [filteredReports, reportPage])
  const totalReportPages = Math.max(1, Math.ceil(filteredReports.length / 5))
  const pendingItems = useMemo(() => [...adminIssues.filter((x) => x.status !== '778000001'), ...opsIssues.filter((x) => x.statusId !== '778000001')], [adminIssues, opsIssues])
  const completion = useMemo(() => validate(form, events, adminIssues, opsIssues, damaEntries, earlyDischarges), [form, events, adminIssues, opsIssues, damaEntries, earlyDischarges])

  useEffect(() => {
    loadStartup()
  }, [])

  useEffect(() => {
    if (view === 'home') loadHomeReports()
  }, [reportFilter])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 4000)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    if (view === 'report' && !busy) saveDraft(false)
  }, [form, events, adminIssues, opsIssues, damaEntries, earlyDischarges, view])

  useEffect(() => {
    if (view !== 'report' || busy || !reportId) return
    const timer = window.setTimeout(async () => {
      try {
        await persistGeneral(form, reportId)
        const id = await persistFlow(form, reportId, flowSummaryId)
        if (id !== flowSummaryId) setFlowSummaryId(id)
      } catch (error) {
        setMessage(`Draft database save failed: ${errorMessage(error)}`)
      }
    }, 800)
    return () => window.clearTimeout(timer)
  }, [form, adminIssues, view, busy, reportId, flowSummaryId])

  useEffect(() => {
    if (view !== 'report' || busy || !reportId || !flowSummaryId) return
    const timer = window.setTimeout(() => {
      if (autosaveInFlight.current) return
      autosaveInFlight.current = true
      autosaveSections()
        .catch((error) => setMessage(`Dataverse autosave failed: ${errorMessage(error)}`))
        .finally(() => { autosaveInFlight.current = false })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [events, adminIssues, opsIssues, damaEntries, form.complaintsCount, form.complaintsSummary, form.ovrsCount, form.ovrsSummary, form.govVisit, form.govSummary, view, busy, reportId, flowSummaryId])

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
        const submittedRows = webRows.filter(isSubmittedReport)
        setReports(submittedRows)
        setReportPage(1)
        return submittedRows
      }

      const result = await Services.reports.getAll({
        select: ['dma_handoverreportid', 'dma_name', 'dma_reportdate', 'dma_businessunit', 'dma_shifttype', 'dma_reportstatus', 'statecode', 'statuscode', 'dma_hotissues', 'dma_dmacknowledgmenttimestamp', 'createdon', '_dma_dutymanager_value'],
        filter,
        orderBy: ['createdon desc'],
        top: 100,
      } as any)
      const rows = list(result)
      if (!rows.length) {
        const broadResult = await Services.reports.getAll({ filter, orderBy: ['createdon desc'], top: 100 } as any)
        const submittedRows = list(broadResult).filter(isSubmittedReport)
        setReports(submittedRows)
        setReportPage(1)
        return submittedRows
      } else {
        const submittedRows = rows.filter(isSubmittedReport)
        setReports(submittedRows)
        setReportPage(1)
        return submittedRows
      }
    } catch (error) {
      console.error('Error fetching recent reports', error)
      setReports([])
      setMessage('Could not fetch recent reports from Dataverse.')
      throw error
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

  async function startShift() {
    if (busy) return
    const baseForm = initialForm()
    const businessUnit = form.businessUnit || baseForm.businessUnit
    const latestBuReport = latestReportForBusinessUnit(reports, businessUnit)
    const nextShift = latestBuReport ? nextShiftAfter(shiftFromValue(latestBuReport.dma_shifttype)) : baseForm.shift
    const nextForm = { ...baseForm, dmName: form.dmName, dmUserId: form.dmUserId, businessUnit, shift: nextShift }
    // One draft per duty manager + business unit + shift + day: reopen it instead of creating a duplicate report.
    const existing = getDrafts().find((draft) => sameHandover(draft, nextForm))
    if (existing) {
      setMessage(`You already have a draft for ${labelFor(businessUnits, businessUnit)} · ${nextShift} shift · ${shortDate(nextForm.reportDate)}. Opening it instead of creating a duplicate.`)
      openDraft(existing)
      return
    }
    const nextDraftId = String(Date.now())
    setBusy(true)
    try {
      const nextReportId = await persistGeneral(nextForm, '')
      let nextFlowId = ''
      try {
        nextFlowId = await persistFlow(nextForm, nextReportId, '')
      } catch (error) {
        await Services.reports.delete(cleanId(nextReportId)).catch(() => undefined)
        throw new Error(`Patient-flow initialization failed and the draft was rolled back. ${errorMessage(error)}`)
      }
      setForm(nextForm)
      setEvents([])
      setAdminIssues([])
      setOpsIssues([])
      setDamaEntries([])
      setEarlyDischarges([])
      setReportId(nextReportId)
      setFlowSummaryId(nextFlowId)
      setExperienceId('')
      setDraftId(nextDraftId)
      writeDraft({ form: nextForm, draftId: nextDraftId, reportId: nextReportId, flowSummaryId: nextFlowId, experienceId: '', events: [], adminIssues: [], opsIssues: [], damaEntries: [], earlyDischarges: [] }, true)
      setView('report')
      setTab('general')
      setMessage('Shift report and patient-flow summary created successfully.')
    } catch (error) {
      setMessage(`Could not initiate shift report: ${errorMessage(error)}`)
    } finally {
      setBusy(false)
    }
  }

  function latestReportForBusinessUnit(rows: any[], businessUnit: string) {
    return rows
      .filter((row) => String(row.dma_businessunit) === String(businessUnit))
      .sort((a, b) => new Date(b.dma_reportdate || b.createdon || 0).getTime() - new Date(a.dma_reportdate || a.createdon || 0).getTime())[0]
  }

  function nextShiftAfter(shift: Shift): Shift {
    if (shift === 'Morning') return 'Evening'
    if (shift === 'Evening') return 'Night'
    return 'Morning'
  }

  function writeDraft(snapshot: { form: FormState; draftId: string; reportId: string; flowSummaryId: string; experienceId?: string; events: EventItem[]; adminIssues: AdminIssue[]; opsIssues: OpsIssue[]; damaEntries: DamaEntry[]; earlyDischarges: EarlyDischarge[] }, refresh = true) {
    const draft: DraftRecord = { ...snapshot.form, draftId: snapshot.draftId, reportId: snapshot.reportId, flowSummaryId: snapshot.flowSummaryId, experienceId: snapshot.experienceId, events: snapshot.events, adminIssues: snapshot.adminIssues, opsIssues: snapshot.opsIssues, damaEntries: snapshot.damaEntries, earlyDischarges: snapshot.earlyDischarges, timestamp: new Date().toLocaleString() }
    localStorage.setItem(`dm_handover_draft_${snapshot.draftId}`, JSON.stringify(draft))
    if (refresh) setDrafts(getDrafts())
  }

  function saveDraft(refresh = true) {
    if (view !== 'report') return
    const id = draftId || String(Date.now())
    if (!draftId) setDraftId(id)
    writeDraft({ form, draftId: id, reportId, flowSummaryId, experienceId, events, adminIssues, opsIssues, damaEntries, earlyDischarges }, refresh)
  }

  function leaveReport(nextView: MainView) {
    if (view === 'report') saveDraft(true)
    setView(nextView)
    if (nextView === 'home') loadHomeReports()
  }
  // Opens a draft, optionally straight on a given report page (e.g. from a Current shift item).
  function openDraft(draft: DraftRecord, startTab: TabKey = 'general') {
    setForm({ ...initialForm(), ...draft })
    setDraftId(draft.draftId)
    setReportId(draft.reportId || '')
    setFlowSummaryId(draft.flowSummaryId || '')
    setExperienceId(draft.experienceId || '')
    setEvents(draft.events || [])
    setAdminIssues(draft.adminIssues || [])
    setOpsIssues(draft.opsIssues || [])
    setDamaEntries(draft.damaEntries || [])
    setEarlyDischarges(draft.earlyDischarges || [])
    setView('report')
    setTab(startTab)
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

  function showDashboard(reportRows: any[] = reports) {
    if (!Array.isArray(reportRows)) reportRows = reports
    if (view === 'report') saveDraft(true)
    const activeShift = form.shift
    const submittedCount = reportRows.length
    const bus = businessUnits.map(([value, label]) => {
      const report = reportRows.find((r) => String(r.dma_businessunit) === String(value) && shiftFromValue(r.dma_shifttype) === activeShift)
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
      reports: reportRows,
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
  async function refreshDashboard() {
    const latestReports = await loadHomeReports()
    showDashboard(latestReports || [])
  }
  async function saveGeneral() {
    setBusy(true)
    try {
      const nextId = await persistGeneral(form, reportId)
      setReportId(nextId)
      const nextFlowId = await persistFlow(form, nextId, flowSummaryId)
      setFlowSummaryId(nextFlowId)
      const id = draftId || String(Date.now())
      if (!draftId) setDraftId(id)
      writeDraft({ form, draftId: id, reportId: nextId, flowSummaryId: nextFlowId, experienceId, events, adminIssues, opsIssues, damaEntries, earlyDischarges }, true)
      setMessage('General information saved.')
      return nextId
    } catch (error) {
      setMessage(`Database save failed: ${errorMessage(error)}`)
      return ''
    } finally {
      setBusy(false)
    }
  }

  async function saveFlow(currentReportId = reportId) {
    const id = await persistFlow(form, currentReportId, flowSummaryId)
    setFlowSummaryId(id)
    return id
  }
console.log('completion', saveFlow)

  async function autosaveSections() {
    const report = cleanId(reportId)
    const flow = cleanId(flowSummaryId)
    if (!report || !flow) throw new Error('The draft report and patient-flow summary must exist before section data can be saved.')

    let nextExperienceId = experienceId
    const experienceData: any = compact({
      dma_name: `${reportCode(form)} Experience`,
      dma_escalatedcomplaints: form.complaintsCount,
      dma_summaryofnewongoingcomplaints: form.complaintsSummary,
      dma_escalatedovrs: form.ovrsCount,
      dma_summaryofnewovrs: form.ovrsSummary,
      dma_governmentalregulatoryvisits: form.govVisit === 'Yes' ? 999740000 : 999740001,
      dma_authoritynamefindingssummary: form.govSummary,
      'dma_ReportID@odata.bind': `/dma_handoverreports(${report})`,
    })
    if (nextExperienceId) await Services.experience.update(cleanId(nextExperienceId), experienceData)
    else {
      nextExperienceId = resultId(await Services.experience.create(experienceData), 'dma_patientexperienceid')
      setExperienceId(nextExperienceId)
    }

    const nextEvents = events.map((row) => ({ ...row }))
    for (const event of nextEvents) {
      const payload = compact(applyPatientBind({ dma_name: `${event.typeText} - ${event.codeText}`, dma_severitylevel: Number(event.severity), dma_incidentdescription: event.desc, dma_immediateactionstaken: event.actions, dma_eventlogtimestamp: new Date().toISOString(), 'dma_ReportID@odata.bind': `/dma_handoverreports(${report})`, 'dma_EventType@odata.bind': event.typeId ? `/dma_eventtypes(${cleanId(event.typeId)})` : undefined, 'dma_EventCode@odata.bind': event.codeId ? `/dma_eventcodes(${cleanId(event.codeId)})` : undefined }, event.area, event.pId)) as any
      if (event.dataverseId) await Services.events.update(cleanId(event.dataverseId), payload)
      else event.dataverseId = resultId(await Services.events.create(payload), 'dma_hospitaleventid')
    }
    if (nextEvents.some((row, index) => row.dataverseId !== events[index]?.dataverseId)) setEvents(nextEvents)

    const nextAdmin = adminIssues.map((row) => ({ ...row }))
    for (const issue of nextAdmin) {
      const payload: any = compact(applyPatientBind({ dma_name: issue.catLabel, dma_description: issue.desc, dma_actiontaken: issue.action, dma_pendingissues: issue.pendingDetails, dma_count: 1, dma_resolutionstatus: Number(issue.status), 'dma_IssueID@odata.bind': issue.catId ? `/dma_administrativeissues(${cleanId(issue.catId)})` : undefined, 'dma_ReportID@odata.bind': `/dma_handoverreports(${report})` }, issue.area, issue.pId))
      if (issue.dataverseId) await Services.adminEntries.update(cleanId(issue.dataverseId), payload)
      else issue.dataverseId = resultId(await Services.adminEntries.create(payload), 'dma_administrativeissueentryid')
    }
    if (nextAdmin.some((row, index) => row.dataverseId !== adminIssues[index]?.dataverseId)) setAdminIssues(nextAdmin)

    const nextOps = opsIssues.map((row) => ({ ...row }))
    for (const issue of nextOps) {
      const payload: any = compact({ dma_name: `${labelFor(serviceAffectedOptions, issue.affectedId)} - ${labelFor(opsIssueOptions, issue.issueId)}`, dma_servicefunctionality: Number(issue.funcId), dma_serviceaffected: Number(issue.affectedId), dma_typeofissue: Number(issue.issueId), dma_descriptionofissue: issue.desc, dma_resolutionstatus: Number(issue.statusId), dma_pendingissues: issue.pendingDetails, 'dma_ReportID@odata.bind': `/dma_handoverreports(${report})` })
      if (issue.dataverseId) await Services.ops.update(cleanId(issue.dataverseId), payload)
      else issue.dataverseId = resultId(await Services.ops.create(payload), 'dma_opeartionid')
    }
    if (nextOps.some((row, index) => row.dataverseId !== opsIssues[index]?.dataverseId)) setOpsIssues(nextOps)

    const nextDama = damaEntries.map((row) => ({ ...row }))
    for (const entry of nextDama) {
      const payload = compact(applyPatientBind({ dma_name: entry.patientName || 'DAMA Patient', dma_erdama: entry.damaType === 'ER' ? 1 : 0, dma_inpdama: entry.damaType === 'INP' ? 1 : 0, dma_reason: entry.reason, dma_actiontaken: entry.actionTaken, 'dma_PatientFlow@odata.bind': `/dma_patientflowsummaries(${flow})` }, entry.area || (entry.damaType === 'ER' ? 'ER' : 'IPD'), entry.pId)) as any
      if (entry.dataverseId) await Services.flowEntries.update(cleanId(entry.dataverseId), payload)
      else entry.dataverseId = resultId(await Services.flowEntries.create(payload), 'dma_patientflowentryid')
    }
    if (nextDama.some((row, index) => row.dataverseId !== damaEntries[index]?.dataverseId)) setDamaEntries(nextDama)

    if (draftId) writeDraft({ form, draftId, reportId: report, flowSummaryId: flow, experienceId: nextExperienceId, events: nextEvents, adminIssues: nextAdmin, opsIssues: nextOps, damaEntries: nextDama, earlyDischarges }, false)
  }

  async function deleteSectionRow(kind: 'event' | 'admin' | 'ops' | 'dama', row: EventItem | AdminIssue | OpsIssue | DamaEntry) {
    const labels = { event: 'hospital event', admin: 'administrative issue', ops: 'operations outage', dama: 'patient case' }
    if (!await pulseConfirm(`Delete ${labels[kind]}`, `Delete this ${labels[kind]}? This action cannot be undone.`)) return
    try {
      if (row.dataverseId) {
        if (kind === 'event') await Services.events.delete(cleanId(row.dataverseId))
        if (kind === 'admin') await Services.adminEntries.delete(cleanId(row.dataverseId))
        if (kind === 'ops') await Services.ops.delete(cleanId(row.dataverseId))
        if (kind === 'dama') await Services.flowEntries.delete(cleanId(row.dataverseId))
      }
      if (kind === 'event') setEvents(events.filter((item) => item.id !== row.id))
      if (kind === 'admin') setAdminIssues(adminIssues.filter((item) => item.id !== row.id))
      if (kind === 'ops') setOpsIssues(opsIssues.filter((item) => item.id !== row.id))
      if (kind === 'dama') setDamaEntries(damaEntries.filter((item) => item.id !== row.id))
      setMessage('Record deleted from Dataverse.')
    } catch (error) {
      setMessage(`Dataverse delete failed: ${errorMessage(error)}`)
    }
  }

  async function deleteDraft(id: string) {
    const draft = getDrafts().find((item) => item.draftId === id)
    if (!draft) return
    if (!await pulseConfirm('Delete draft', 'Delete this draft and all of its linked records? This action cannot be undone.', 'Delete draft')) return
    try {
      await Promise.all((draft.events || []).filter((row) => row.dataverseId).map((row) => Services.events.delete(cleanId(row.dataverseId))))
      await Promise.all((draft.adminIssues || []).filter((row) => row.dataverseId).map((row) => Services.adminEntries.delete(cleanId(row.dataverseId))))
      await Promise.all((draft.opsIssues || []).filter((row) => row.dataverseId).map((row) => Services.ops.delete(cleanId(row.dataverseId))))
      await Promise.all((draft.damaEntries || []).filter((row) => row.dataverseId).map((row) => Services.flowEntries.delete(cleanId(row.dataverseId))))
      if (draft.experienceId) await Services.experience.delete(cleanId(draft.experienceId))
      if (draft.flowSummaryId) await Services.flow.delete(cleanId(draft.flowSummaryId))
      if (draft.reportId) await deleteCoverageShortages(cleanId(draft.reportId))
      if (draft.reportId) await Services.reports.delete(cleanId(draft.reportId))
      localStorage.removeItem(`dm_handover_draft_${id}`)
      setDrafts(getDrafts())
      setMessage('Draft and linked Dataverse records deleted.')
      await loadHomeReports()
    } catch (error) {
      setMessage(`Draft was not deleted: ${errorMessage(error)}`)
    }
  }

  async function submitReport() {
    if (acknowledgmentPending(previous)) {
      setMessage('The previous handover must be acknowledged before this report can be submitted.')
      setTab('general')
      return
    }
    const duplicate = drafts.find((d) => d.draftId !== draftId && sameHandover(d, form))
    if (duplicate) {
      setMessage(`Another draft already exists for this duty manager, business unit, shift and date (${formatDate(duplicate.reportDate)}). This report cannot be submitted until you delete one of them or change the shift or date.`)
      return
    }
    if (!completion.ok) {
      setMessage(`Please complete: ${completion.missing.join(', ')}`)
      return
    }
    setBusy(true)
    try {
      const id = await persistGeneral(form, reportId)
      setReportId(id)
      const flowId = await persistFlow(form, id, flowSummaryId)
      setFlowSummaryId(flowId)
      let nextExperienceId = experienceId
      const nextEvents = events.map((row) => ({ ...row }))
      const nextAdmin = adminIssues.map((row) => ({ ...row }))
      const nextOps = opsIssues.map((row) => ({ ...row }))
      const nextDama = damaEntries.map((row) => ({ ...row }))
      const checkpoint = () => {
        setExperienceId(nextExperienceId)
        setEvents([...nextEvents])
        setAdminIssues([...nextAdmin])
        setOpsIssues([...nextOps])
        setDamaEntries([...nextDama])
        if (draftId) writeDraft({ form, draftId, reportId: id, flowSummaryId: flowId, experienceId: nextExperienceId, events: nextEvents, adminIssues: nextAdmin, opsIssues: nextOps, damaEntries: nextDama, earlyDischarges }, false)
      }

      const experiencePayload: any = compact({ dma_name: `${reportCode(form)} Experience`, dma_escalatedcomplaints: form.complaintsCount, dma_summaryofnewongoingcomplaints: form.complaintsSummary, dma_escalatedovrs: form.ovrsCount, dma_summaryofnewovrs: form.ovrsSummary, dma_governmentalregulatoryvisits: form.govVisit === 'Yes' ? 999740000 : 999740001, dma_authoritynamefindingssummary: form.govSummary, 'dma_ReportID@odata.bind': `/dma_handoverreports(${cleanId(id)})` })
      if (nextExperienceId) await Services.experience.update(cleanId(nextExperienceId), experiencePayload)
      else {
        nextExperienceId = resultId(await Services.experience.create(experiencePayload), 'dma_patientexperienceid')
        checkpoint()
      }

      for (const event of nextEvents) {
        const payload = compact(applyPatientBind({ dma_name: `${event.typeText} - ${event.codeText}`, dma_severitylevel: Number(event.severity), dma_incidentdescription: event.desc, dma_immediateactionstaken: event.actions, dma_eventlogtimestamp: new Date().toISOString(), 'dma_ReportID@odata.bind': `/dma_handoverreports(${cleanId(id)})`, 'dma_EventType@odata.bind': event.typeId ? `/dma_eventtypes(${cleanId(event.typeId)})` : undefined, 'dma_EventCode@odata.bind': event.codeId ? `/dma_eventcodes(${cleanId(event.codeId)})` : undefined }, event.area, event.pId)) as any
        if (event.dataverseId) await Services.events.update(cleanId(event.dataverseId), payload)
        else {
          event.dataverseId = resultId(await Services.events.create(payload), 'dma_hospitaleventid')
          checkpoint()
        }
      }
      for (const issue of nextAdmin) {
        const payload: any = compact(applyPatientBind({ dma_name: issue.catLabel, dma_description: issue.desc, dma_actiontaken: issue.action, dma_pendingissues: issue.pendingDetails, dma_count: 1, dma_resolutionstatus: Number(issue.status), 'dma_IssueID@odata.bind': issue.catId ? `/dma_administrativeissues(${cleanId(issue.catId)})` : undefined, 'dma_ReportID@odata.bind': `/dma_handoverreports(${cleanId(id)})` }, issue.area, issue.pId))
        if (issue.dataverseId) await Services.adminEntries.update(cleanId(issue.dataverseId), payload)
        else {
          issue.dataverseId = resultId(await Services.adminEntries.create(payload), 'dma_administrativeissueentryid')
          checkpoint()
        }
      }
      for (const issue of nextOps) {
        const payload: any = compact({ dma_name: `${labelFor(serviceAffectedOptions, issue.affectedId)} - ${labelFor(opsIssueOptions, issue.issueId)}`, dma_servicefunctionality: Number(issue.funcId), dma_serviceaffected: Number(issue.affectedId), dma_typeofissue: Number(issue.issueId), dma_descriptionofissue: issue.desc, dma_resolutionstatus: Number(issue.statusId), dma_pendingissues: issue.pendingDetails, 'dma_ReportID@odata.bind': `/dma_handoverreports(${cleanId(id)})` })
        if (issue.dataverseId) await Services.ops.update(cleanId(issue.dataverseId), payload)
        else {
          issue.dataverseId = resultId(await Services.ops.create(payload), 'dma_opeartionid')
          checkpoint()
        }
      }
      for (const entry of nextDama) {
        const payload = compact(applyPatientBind({ dma_name: entry.patientName || 'DAMA Patient', dma_erdama: entry.damaType === 'ER' ? 1 : 0, dma_inpdama: entry.damaType === 'INP' ? 1 : 0, dma_reason: entry.reason, dma_actiontaken: entry.actionTaken, 'dma_PatientFlow@odata.bind': `/dma_patientflowsummaries(${cleanId(flowId)})` }, entry.area || (entry.damaType === 'ER' ? 'ER' : 'IPD'), entry.pId)) as any
        if (entry.dataverseId) await Services.flowEntries.update(cleanId(entry.dataverseId), payload)
        else {
          entry.dataverseId = resultId(await Services.flowEntries.create(payload), 'dma_patientflowentryid')
          checkpoint()
        }
      }
      await Services.reports.update(cleanId(id), { dma_reportstatus: 778000002, statecode: 0, statuscode: 1 } as any)
      if (draftId) {
        localStorage.removeItem(`dm_handover_draft_${draftId}`)
        setDrafts(getDrafts())
      }
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
    const clean = cleanId(id)
    const local = reports.find((x) => cleanId(x.dma_handoverreportid) === clean)
    setSelectedReport({ report: local || { dma_handoverreportid: clean, dma_name: 'Shift Report' }, flow: [], flowEntries: [], events: [], admin: [], ops: [], experience: [], loading: true })
    try {
      const xrmBundle = await retrieveReportBundleViaXrm(clean).catch((error) => {
        console.warn('Xrm report bundle lookup failed', error)
        return null
      })
      if (xrmBundle?.report) {
        setSelectedReport(xrmBundle)
        return
      }

      const [report, flow, eventRows, admin, ops, experience] = await Promise.all([
        Services.reports.get(clean), Services.flow.getAll({ filter: `_dma_reportid_value eq ${clean}` }), Services.events.getAll({ filter: `_dma_reportid_value eq ${clean}` }),
        Services.adminEntries.getAll({ filter: `_dma_reportid_value eq ${clean}` }), Services.ops.getAll({ filter: `_dma_reportid_value eq ${clean}` }), Services.experience.getAll({ filter: `_dma_reportid_value eq ${clean}` }),
      ])
      const flowRows = list(flow)
      const flowId = cleanId(flowRows[0]?.dma_patientflowsummaryid || flowRows[0]?.id || '')
      const flowEntries = flowId ? list(await Services.flowEntries.getAll({ filter: `_dma_patientflow_value eq ${flowId}` } as any).catch(() => [])) : []
      setSelectedReport({ report: unwrap(report), flow: flowRows, flowEntries, events: list(eventRows), admin: list(admin), ops: list(ops), experience: list(experience) })
    } catch {
      setSelectedReport({ report: local || { dma_handoverreportid: clean, dma_name: 'Shift Report' }, flow: [], flowEntries: [], events: [], admin: [], ops: [], experience: [] })
    }
  }

  // Single acknowledgment path for every Acknowledge button (report viewer, General page, locked-page panel):
  // saves to Dataverse, then updates everything showing that report so they agree immediately.
  async function acknowledgeHandover(id: string) {
    const timestamp = new Date().toISOString()
    await acknowledgeHandoverReport(id, timestamp)
    const same = (row: any) => cleanId(row?.dma_handoverreportid) === cleanId(id)
    previous.markAcknowledged(id, timestamp)
    setSelectedReport((current) => current && same(current.report) ? { ...current, report: { ...current.report, dma_dmacknowledgmenttimestamp: timestamp } } : current)
    setReports((rows) => rows.map((row) => same(row) ? { ...row, dma_dmacknowledgmenttimestamp: timestamp } : row))
    loadHomeReports().catch(() => undefined)
  }

  // Report viewer's Acknowledge: the viewer stays open and switches to "Acknowledged".
  async function acknowledgeReport() {
    const id = selectedReport?.report?.dma_handoverreportid
    if (!id) return
    try {
      await acknowledgeHandover(id)
      setMessage('Report acknowledged.')
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

  // Moves an alert from Done back to Open (e.g. marked done by mistake).
  function markAlertUnread(id: string) {
    const stored = JSON.parse(localStorage.getItem('dma_read_alerts') || '[]') as string[]
    localStorage.setItem('dma_read_alerts', JSON.stringify(stored.filter((item) => item !== id)))
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, isRead: false } : a))
    Services.alerts.update(cleanId(id), { dma_isread: false } as any).catch(() => undefined)
  }

  const openModule = (nextTab: TabKey) => {
    if (view !== 'report') {
      setMessage('Start or continue a handover before opening report sections.')
      return
    }
    setTab(nextTab)
    setView('report')
  }
  const completionPercent = completion.ok ? 100 : Math.max(0, Math.round(((8 - completion.missing.length) / 8) * 100))
  const isWorkflow = view === 'report' || view === 'submitted'
  const showReportNav = view === 'report'
  const homeDraft = view === 'home' ? drafts[0] : null
  const headerContext = homeDraft || form
  const headerCompletion = homeDraft ? draftCompletionPercent(homeDraft) : completionPercent
  // Another saved draft with the same manager, business unit, shift and day as the one being edited.
  const duplicateDraft = view === 'report' ? drafts.find((d) => d.draftId !== draftId && sameHandover(d, form)) : undefined
  const previous = usePreviousHandover(view === 'report', form, reportId, acknowledgeHandover)

  return <div className="dm-app">
    <style>{compactLayoutStyles}</style>
    <nav className={`app-rail ${showReportNav ? 'report-open' : 'entry-only'}`} aria-label="Duty Manager primary navigation">
      <div className="dm-mark">DM</div>
      {/* Wrapped in a div so the rail's button:nth-of-type rules (section label, entry-only) are unaffected. */}
      <div className="pulse-apps-slot">
        <button type="button" className="pulse-apps-btn" onClick={() => setPulseOpen(true)} aria-label="Pulse Apps" title="Pulse Apps" aria-expanded={pulseOpen}>
          <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 10 5-10 5L2 7l10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
          <span>Pulse Apps</span>
        </button>
      </div>
      <button className={view === 'home' ? 'active' : ''} onClick={() => leaveReport('home')} aria-label="Home / Shift Command" title="Home / Shift Command"><NavIcon name="home" /><span>Home</span></button>
      <button className={view === 'dashboard' ? 'active' : ''} onClick={() => showDashboard()} aria-label="Command Center" title="Command Center"><NavIcon name="dashboard" /><span>Dashboard</span></button>
      <button className={view === 'report' && tab === 'general' ? 'active' : ''} onClick={() => openModule('general')} aria-label="General / Shift Identity" title="General / Shift Identity"><NavIcon name="identity" /><span>General</span></button>
      <button className={view === 'report' && tab === 'events' ? 'active' : ''} onClick={() => openModule('events')} aria-label="Hospital Events" title="Hospital Events"><NavIcon name="events" /><span>Events</span></button>
      <button className={view === 'report' && tab === 'admin' ? 'active' : ''} onClick={() => openModule('admin')} aria-label="Administrative Issues" title="Administrative Issues"><NavIcon name="admin" /><span>Admin</span></button>
      <button className={view === 'report' && tab === 'flow' ? 'active' : ''} onClick={() => openModule('flow')} aria-label="Patient Flow" title="Patient Flow"><NavIcon name="flow" /><span>Patient flow</span></button>
      <button className={view === 'report' && tab === 'ops' ? 'active' : ''} onClick={() => openModule('ops')} aria-label="Operations" title="Operations"><NavIcon name="operations" /><span>Operations</span></button>
      <button className={view === 'report' && tab === 'experience' ? 'active' : ''} onClick={() => openModule('experience')} aria-label="Experience" title="Experience"><NavIcon name="experience" /><span>Experience</span></button>
      <button className={view === 'report' && tab === 'summary' ? 'active' : ''} onClick={() => openModule('summary')} aria-label="Summary / Handover Review" title="Summary / Handover Review"><NavIcon name="summary" /><span>Summary</span></button>
    </nav>
    {view === 'home' || view === 'dashboard' ? <AppHeader
      crumb={view === 'home' ? 'Shift Command' : 'Situational awareness'}

      context={view === 'home'
        ? `${labelFor(businessUnits, headerContext.businessUnit)} · ${headerContext.shift} shift · ${shortDate(headerContext.reportDate)} · ${homeDraft ? 'Draft' : 'Completion'} ${headerCompletion}%`
        : 'Group operations command center · all business units, shifts and duty managers'}
      userName={headerContext.dmName || form.dmName || ''}
      unread={alerts.filter((a) => !a.isRead).length}
      openAlerts={() => setAlertsOpen(true)}
    /> : <header className={`top ${isWorkflow ? 'workflow-top' : ''}`}>
      <button className="brand" onClick={() => leaveReport('home')}><span>DM</span><strong>Duty Manager</strong><small>Operations Handover</small></button>
      <div className="top-context">
        <span><small>Business unit</small><b>{labelFor(businessUnits, headerContext.businessUnit)}</b></span>
        <span><small>{homeDraft ? 'Active draft' : 'Shift + date'}</small><b>{headerContext.shift} - {shortDate(headerContext.reportDate)}</b></span>
        <span><small>Duty manager</small><b>{headerContext.dmName || form.dmName || 'Loading User...'}</b></span>
        {!isWorkflow && <span><small>{homeDraft ? 'Draft completion' : 'Completion'}</small><b>{headerCompletion}%</b></span>}
      </div>
      {!isWorkflow && <button className="attention-chip" onClick={() => drafts[0] ? openDraft(drafts[0]) : setMessage('Start or continue a handover to review attention items.')}>{pendingItems.length || alerts.filter((a) => !a.isRead).length} items need attention</button>}
      {!isWorkflow && (() => {
        const unread = alerts.filter((a) => !a.isRead).length
        return <button className="alert-button" onClick={() => setAlertsOpen(true)} aria-label={`Alerts, ${unread} unread`}>Alerts <b className={unread ? 'has-unread' : 'is-zero'}>{unread}</b></button>
      })()}
    </header>}
    <PulseNavigation client={pulseClient} variant="overlay" isOpen={pulseOpen} onClose={() => setPulseOpen(false)} powerAppId={DUTY_MANAGER_APP_ID} />
    <ToastRack message={message} onClose={clearMessage} />
    <ConfirmHost />
    {view === 'home' && <Home form={form} completion={completion} completionPercent={completionPercent} pendingItems={pendingItems} drafts={drafts} reports={pagedReports} reportFilter={reportFilter} setReportFilter={(value: string) => { setReportFilter(value); setReportPage(1) }} dutyManagerFilter={dutyManagerFilter} dutyManagerOptions={dutyManagerOptions} setDutyManagerFilter={(value: string) => { setDutyManagerFilter(value); setReportPage(1) }} reportPage={reportPage} totalReportPages={totalReportPages} totalResults={filteredReports.length} dateFilter={reportDateFilter} setDateFilter={(value: string) => { setReportDateFilter(value); setReportPage(1) }} sort={reportSort} setSort={(sort: ReportSort) => { setReportSort(sort); setReportPage(1) }} nextPage={() => setReportPage((p) => Math.min(totalReportPages, p + 1))} prevPage={() => setReportPage((p) => Math.max(1, p - 1))} startShift={startShift} openDraft={openDraft} deleteDraft={deleteDraft} openReport={openReport} />}
    {view === 'dashboard' && <Dashboard data={dashboard} refresh={refreshDashboard} openReport={openReport} openIssue={(row: any) => { setView('report'); setTab(row.category === 'Administrative' ? 'admin' : 'ops') }} />}
    {view === 'report' && <Editor state={{ form, updateForm, tab, setTab, busy, reportId, saveGeneral, submitReport, completion, discharges, events, setEvents: (next: EventItem[]) => { const removed = events.find((row) => !next.some((item) => item.id === row.id)); if (removed) deleteSectionRow('event', removed); else setEvents(next) }, adminIssues, setAdminIssues: (next: AdminIssue[]) => { const removed = adminIssues.find((row) => !next.some((item) => item.id === row.id)); if (removed) deleteSectionRow('admin', removed); else setAdminIssues(next) }, opsIssues, setOpsIssues: (next: OpsIssue[]) => { const removed = opsIssues.find((row) => !next.some((item) => item.id === row.id)); if (removed) deleteSectionRow('ops', removed); else setOpsIssues(next) }, damaEntries, setDamaEntries: (next: DamaEntry[]) => { const removed = damaEntries.find((row) => !next.some((item) => item.id === row.id)); if (removed) deleteSectionRow('dama', removed); else setDamaEntries(next) }, earlyDischarges, setEarlyDischarges, searchUsers, userMatches, setUserMatches, eventTypes, eventCodes, loadEventCodes, adminCatalog, pendingItems, openReport, duplicateDraft, openDraft, previous }} />}
    {view === 'submitted' && <Submitted form={form} events={events} opsIssues={opsIssues} pendingItems={pendingItems} openReport={() => reportId && openReport(reportId)} downloadPdf={() => { if (!reportId) return; setPdfOnOpen(true); openReport(reportId) }} goHome={() => setView('home')} />}
    {alertsOpen && <AlertDrawer alerts={alerts} markAlertRead={markAlertRead} markAlertUnread={markAlertUnread} openReport={(id: string) => { openReport(id); setAlertsOpen(false) }} close={() => setAlertsOpen(false)} />}
    {selectedReport && <ReportModal bundle={selectedReport} close={() => setSelectedReport(null)} acknowledge={acknowledgeReport} autoDownload={pdfOnOpen} onAutoDownloaded={() => setPdfOnOpen(false)} />}
  </div>
}

type NavIconName = 'home' | 'dashboard' | 'identity' | 'events' | 'admin' | 'flow' | 'operations' | 'experience' | 'summary'

function NavIcon({ name }: { name: NavIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const icons: Record<NavIconName, ReactNode> = {
    home: <><path {...common} d="M3 11.5 12 4l9 7.5" /><path {...common} d="M5.5 10.5V20h13v-9.5" /><path {...common} d="M9.5 20v-6h5v6" /></>,
    dashboard: <><path {...common} d="M4 19V5" /><path {...common} d="M4 19h16" /><path {...common} d="m7 15 3.5-4 3 2 4.5-6" /></>,
    identity: <><rect {...common} x="4" y="5" width="16" height="14" rx="2" /><path {...common} d="M8 10h5" /><path {...common} d="M8 14h8" /><path {...common} d="M16 9h1" /></>,
    events: <><path {...common} d="M12 4 3.5 19h17L12 4Z" /><path {...common} d="M12 9v4" /><path {...common} d="M12 16h.01" /></>,
    admin: <><path {...common} d="M8 6h13" /><path {...common} d="M8 12h13" /><path {...common} d="M8 18h13" /><path {...common} d="m3 6 1 1 2-2" /><path {...common} d="m3 12 1 1 2-2" /><path {...common} d="m3 18 1 1 2-2" /></>,
    flow: <><path {...common} d="M4 15h4l2-6 4 10 2-6h4" /><path {...common} d="M5 7h4" /><path {...common} d="M15 7h4" /></>,
    operations: <><path {...common} d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6" /><path {...common} d="M7 12V8a5 5 0 0 1 10 0v4" /><path {...common} d="M3 12h18" /></>,
    experience: <><path {...common} d="M16 11a4 4 0 1 0-8 0" /><path {...common} d="M5 20a7 7 0 0 1 14 0" /><path {...common} d="M18 8a3 3 0 0 1 2 5" /><path {...common} d="M4 13a3 3 0 0 1 2-5" /></>,
    summary: <><rect {...common} x="5" y="4" width="14" height="17" rx="2" /><path {...common} d="m8.5 13 2.3 2.3 4.7-5" /><path {...common} d="M9 8h6" /></>,
  }
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{icons[name]}</svg>
}

// Shared page header for Home and Dashboard: one compact row. The breadcrumb doubles as the page title
// (no separate bold heading), with the context line under it; action, alerts bell and user on the right.
function AppHeader({ crumb, context, actions, userName, unread, openAlerts }: {
  crumb: string; context: string; actions?: ReactNode
  userName: string; unread: number; openAlerts: () => void
}) {
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DM'
  return <header className="app-header">
    <div className="app-header-title">
      <nav className="home-breadcrumb" aria-label="Breadcrumb"><span>Home</span><span aria-hidden="true">/</span><h1>{crumb}</h1></nav>
      <p>{context}</p>
    </div>
    <div className="app-header-user">
      {actions}
      <button type="button" className="home-bell" onClick={openAlerts} aria-label={`Alerts, ${unread} unread`} title="Alerts">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        {unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
      </button>
      <div className="home-user">
        <span className="home-avatar" aria-hidden="true">{initials}</span>
        <span className="home-user-text"><strong>{userName || 'Loading user...'}</strong><small>Duty Manager</small></span>
      </div>
    </div>
  </header>
}
// Clickable table header: first click sorts this column, the next click flips the direction.
function SortHeader({ label, sortKey, sort, setSort }: { label: string; sortKey: ReportSort['key']; sort: ReportSort; setSort: (sort: ReportSort) => void }) {
  const active = sort.key === sortKey
  const next: ReportSort = { key: sortKey, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' }
  return <button type="button" className={`sort-header${active ? ' active' : ''}`} onClick={() => setSort(next)}
    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} title={`Sort by ${label.toLowerCase()}`}>
    {label}
    <svg viewBox="0 0 24 24" aria-hidden="true">{active && sort.dir === 'asc' ? <path d="m6 15 6-6 6 6" /> : active ? <path d="m6 9 6 6 6-6" /> : <><path d="m8 10 4-4 4 4" /><path d="m8 14 4 4 4-4" /></>}</svg>
  </button>
}

function Home({ form, completion, completionPercent, pendingItems, drafts, reports, reportFilter, setReportFilter, dutyManagerFilter, dutyManagerOptions, setDutyManagerFilter, reportPage, totalReportPages, totalResults, dateFilter, setDateFilter, sort, setSort, nextPage, prevPage, startShift, openDraft, deleteDraft, openReport }: any) {
  const activeDraft = drafts[0]
  const currentManager = activeDraft?.dmName || form.dmName || 'Duty Manager'
  const greeting = timeGreeting()
  const activeDraftCompletion = activeDraft ? draftCompletionPercent(activeDraft) : completionPercent
  const activeDraftLabel = activeDraft ? `${labelFor(businessUnits, activeDraft.businessUnit)} - ${activeDraft.shift || 'Morning'} - ${formatDate(activeDraft.reportDate)}` : ''
  const attentionCount = activeDraft ? draftMissingCount(activeDraft) : completion.missing.length
  const readyItems = [
    ['Shift identity', form.dmName && form.businessUnit && form.reportDate ? 'Complete' : 'Attention', form.dmName && form.businessUnit && form.reportDate ? 'ok' : 'warn'],
    ['Hospital events', 'Clear', 'ok'],
    ['Administrative issues', pendingItems.some((x: any) => 'catLabel' in x) ? 'Attention' : 'Clear', pendingItems.some((x: any) => 'catLabel' in x) ? 'attention' : 'ok'],
    ['Patient flow', completion.missing?.some((x: string) => x.toLowerCase().includes('flow')) ? 'Action required' : 'Complete', completion.missing?.some((x: string) => x.toLowerCase().includes('flow')) ? 'attention' : 'ok'],
  ]
  return <main className="home-modern">
    <section className="home-hero">
      <div>
        <h1>{greeting}, {currentManager}.</h1>
        <p>{activeDraft ? `Active draft: ${activeDraftLabel}. ${attentionCount} items need attention before responsibility can transfer.` : 'No handover draft is currently in progress. Start a shift to begin a new Duty Manager handover.'}</p>
      </div>
      <button type="button" className="btn primary hero-start" onClick={startShift}>+ Start new report</button>
    </section>

    <div className="home-section-head">
      <div>
        <h2>Current shift</h2>
        <p>Priority exceptions and named ownership for this handover.</p>
      </div>
    </div>

    <section className="home-current-grid">
      <div className="current-register">
        {activeDraft ? <article className="current-row lead">
          <div>
            <h3>{activeDraftLabel}</h3>
            <p>{activeDraft.dmName || currentManager} - draft saved {formatDate(activeDraft.timestamp)} - draft completion {activeDraftCompletion}%</p>
            <p>{attentionCount} draft readiness items require ownership before handover.</p>
          </div>
        </article> : <article className="current-row lead">
          <div>
            <h3>No current draft selected</h3>
            <p>Use Start new report above to create a new handover record.</p>
          </div>
        </article>}

        {(pendingItems.length ? pendingItems.slice(0, 2) : completion.missing.slice(0, 2).map((label: string) => ({ label }))).map((item: any, index: number) => (
          <article className="current-row" key={item.id || item.label || index}>
            <div>
              <h3>{item.catLabel || item.desc || item.label || 'Review required'}</h3>
              <p>{item.catLabel ? 'Administrative issues' : item.affectedId ? 'Operations' : 'Handover readiness'} - owner: {currentManager}</p>
            </div>
            <span className={`status-token ${index === 0 ? 'warning' : 'critical'}`}>{index === 0 ? 'Action required' : 'Escalated'}</span>
            {/* Opens the draft on the page where this item is resolved. */}
            {activeDraft && <button type="button" className="btn small current-open" onClick={() => openDraft(activeDraft, item.catLabel ? 'admin' : item.affectedId ? 'ops' : missingFieldTab(item.label || ''))}>Open</button>}
          </article>
        ))}
      </div>

      <aside className="readiness-panel">
        <div className="eyebrow">Handover readiness</div>
        <small>{activeDraft ? 'Active draft completion' : 'Report completion'}</small>
        <strong>{activeDraftCompletion}%</strong>
        <div className="readiness-bar"><i style={{ width: `${activeDraftCompletion}%` }} /></div>
        <p>{activeDraft ? activeDraftLabel : `${completion.missing.length} readiness areas require action before transfer.`}</p>
        <div className="readiness-list">
          {readyItems.map(([label, state, tone]) => <div className={`ready-row ${tone}`} key={label}><span>{label}</span><b>{state}</b></div>)}
        </div>
      </aside>
    </section>

    {drafts.length > 0 && <section className="draft-strip">
      <div className="eyebrow">Unfinished drafts</div>
      {drafts.slice(0, 5).map((d: DraftRecord, index: number) => <div className="draft-row" key={d.draftId}>
        <span>{labelFor(businessUnits, d.businessUnit)} - {d.shift || 'Morning'} - {formatDate(d.reportDate)} - {d.dmName || 'Duty Manager'}{index === 0 && <em className="draft-current"> · Current draft</em>}</span>
        <div className="row-actions">
          <button className="btn danger small" onClick={() => deleteDraft(d.draftId)}>Delete</button>
          <button className={`btn small${index === 0 ? ' primary' : ''}`} onClick={() => openDraft(d)}>Continue</button>
        </div>
      </div>)}
    </section>}

    <div className="home-section-head">
      <div>
        <h2>Recent handovers</h2>
        <p>Submitted handovers available for operational review.</p>
      </div>
      <div className="home-filter modern-filter recent-filters">
        <div className="recent-filter">
          <strong>Report date</strong>
          <PulseDatePicker ariaLabel="Filter by report date" value={dateFilter} onChange={setDateFilter} placeholder="Any date" allowClear />
        </div>
        <div className="recent-filter">
          <strong>Business unit</strong>
          <PulseSelect ariaLabel="Filter by business unit" value={reportFilter} onChange={setReportFilter}
            options={[{ value: 'all', label: 'All business units' }, ...businessUnits.map(([value, label]) => ({ value, label }))]} />
        </div>
        <div className="recent-filter">
          <strong>Duty manager</strong>
          <PulseSelect ariaLabel="Filter by duty manager" value={dutyManagerFilter} onChange={setDutyManagerFilter}
            options={[{ value: 'all', label: 'All duty managers' }, ...dutyManagerOptions.map((name: string) => ({ value: name, label: name }))]} />
        </div>
      </div>
    </div>

    {reports.length === 0 ? <Empty title="No reports found." text={dateFilter ? 'No handovers match this date. Clear the date filter to see more.' : 'No handover reports were returned from Dataverse for this filter.'} /> : <section className="handover-ledger">
      <div className="ledger-head">
        <SortHeader label="Shift" sortKey="date" sort={sort} setSort={setSort} />
        <SortHeader label="Duty manager" sortKey="manager" sort={sort} setSort={setSort} />
        <SortHeader label="Transfer state" sortKey="state" sort={sort} setSort={setSort} />
        <span>Carry-over / exceptions</span>
        <SortHeader label="Submitted" sortKey="submitted" sort={sort} setSort={setSort} />
        <span>Action</span>
      </div>
      {reports.map((r: any) => {
        const acknowledged = Boolean(r.dma_dmacknowledgmenttimestamp)
        return <div className="ledger-row" key={r.dma_handoverreportid}>
          <b>{labelFor(businessUnits, r.dma_businessunit)} - {shiftFromValue(r.dma_shifttype)} - {shortDate(r.dma_reportdate)}</b>
          <span>{displayName(r)}</span>
          <span><i className={`status-token ${acknowledged ? 'ok' : 'warning'}`}>{acknowledged ? 'Acknowledged' : 'Submitted'}</i></span>
          <span>{r.dma_hotissues || 'None'}</span>
          <span>{shortTime(r.createdon)}</span>
          <button className="btn" onClick={() => openReport(r.dma_handoverreportid)}>Review</button>
        </div>
      })}
      <div className="pager">
        <button className="btn" disabled={reportPage <= 1} onClick={prevPage}>Previous</button>
        <span>Page {reportPage} of {totalReportPages} · {totalResults} result{totalResults === 1 ? '' : 's'}</span>
        <button className="btn" disabled={reportPage >= totalReportPages} onClick={nextPage}>Next</button>
      </div>
    </section>}
  </main>
}

function timeGreeting(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 22) return 'Good evening'
  return 'Good night'
}

function draftValidation(draft: DraftRecord) {
  return validate(draft, draft.events || [], draft.adminIssues || [], draft.opsIssues || [], draft.damaEntries || [], draft.earlyDischarges || [])
}

function draftMissingCount(draft: DraftRecord) {
  return draftValidation(draft).missing.length
}

function draftCompletionPercent(draft: DraftRecord) {
  const result = draftValidation(draft)
  return result.ok ? 100 : Math.max(0, Math.round(((8 - result.missing.length) / 8) * 100))
}

function dateKey(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function Dashboard({ data, refresh, openReport, openIssue }: any) {
  const [dateFilter, setDateFilter] = useState(data?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10))
  const [shiftFilter, setShiftFilter] = useState(data?.shift || 'Morning')
  const [buFilter, setBuFilter] = useState('All')
  const [dmFilter, setDmFilter] = useState('All')
  const [queueFilter, setQueueFilter] = useState<'all' | 'incidents' | 'unresolved'>('all')
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [exportStatus, setExportStatus] = useState('')
  const reportPool = data?.reports?.length ? data.reports : (data?.bus || []).map((b: any) => b.report).filter(Boolean)
  const dmOptions = Array.from(new Set(reportPool.map((report: any) => displayName(report)).filter((name: string) => name && name !== 'N/A'))).sort() as string[]
  const filteredReports = reportPool.filter((report: any) => {
    const reportDate = dateKey(report?.dma_reportdate || report?.createdon)
    return reportDate === dateFilter && shiftFromValue(report?.dma_shifttype) === shiftFilter && (dmFilter === 'All' || displayName(report) === dmFilter)
  })
  const busRows = businessUnits.map(([value, label]) => {
    const report = filteredReports.find((row: any) => String(row.dma_businessunit) === String(value))
    const fallback = (data?.bus || []).find((row: any) => String(row.value) === String(value))
    const acknowledgedRow = Boolean(report?.dma_dmacknowledgmenttimestamp)
    return {
      value,
      label,
      report,
      status: report ? (acknowledgedRow ? 'acknowledged' : 'submitted') : 'unsubmitted',
      dm: report ? displayName(report) : '-',
      statusLabel: report ? (acknowledgedRow ? 'Acknowledged' : 'Submitted') : 'Pending',
      sla: report ? 'Submitted On Time' : 'Pending',
      escalation: report ? 'Not required' : fallback?.escalation || 'Submission overdue',
    }
  })
  const visibleBus = busRows.filter((b: any) => (buFilter === 'All' || b.label === buFilter) && (dmFilter === 'All' || (b.report && b.dm === dmFilter)))
  const expectedCount = visibleBus.length
  const pendingBus = visibleBus.filter((b: any) => b.status === 'unsubmitted')
  const acknowledged = visibleBus.filter((b: any) => b.status === 'acknowledged').length
  const submittedCount = visibleBus.filter((b: any) => b.report).length
  const majorCount = visibleBus.reduce((sum: number, b: any) => sum + Number(b.report?.dma_majorincidents || 0), 0)
  const filteredAging = (data?.aging || []).filter((row: any) => (buFilter === 'All' || row.bu === buFilter) && (dmFilter === 'All' || row.owner === dmFilter))
  const incidentRows = filteredReports
    .filter((report: any) => (buFilter === 'All' || labelFor(businessUnits, report.dma_businessunit) === buFilter) && Number(report.dma_majorincidents || 0) > 0)
    .map((report: any) => ({ id: `incident-${report.dma_handoverreportid}`, reportId: report.dma_handoverreportid, issue: report.dma_name || 'Major incident report', bu: labelFor(businessUnits, report.dma_businessunit), owner: displayName(report), category: 'Major incident', age: 'Current shift' }))
  const queueRows = queueFilter === 'incidents' ? incidentRows : filteredAging
  const queueLabel = queueFilter === 'incidents' ? 'Showing major incidents' : queueFilter === 'unresolved' ? 'Showing unresolved issues' : 'Showing all issues'
  const blockerCount = Math.max(filteredAging.length, visibleBus.reduce((sum: number, b: any) => sum + Number(b.report?.dma_pendingissues || 0), 0))
  const actionRequired = pendingBus.length + blockerCount
  function exportDashboardReport() {
    const exportRows = filteredReports
      .filter((report: any) => buFilter === 'All' || labelFor(businessUnits, report.dma_businessunit) === buFilter)
      .map((report: any) => {
        const created = report.createdon ? new Date(report.createdon) : null
        const acknowledgedAt = report.dma_dmacknowledgmenttimestamp ? new Date(report.dma_dmacknowledgmenttimestamp) : null
        const acknowledgmentMinutes = created && acknowledgedAt && !Number.isNaN(created.getTime()) && !Number.isNaN(acknowledgedAt.getTime())
          ? Math.max(0, Math.round((acknowledgedAt.getTime() - created.getTime()) / 60000))
          : ''
        return {
          'Report ID': report.dma_handoverreportid || '',
          'Report Name': report.dma_name || '',
          'Report Date/Time': report.dma_reportdate || '',
          'Created Date/Time': report.createdon || '',
          'Business Unit': labelFor(businessUnits, report.dma_businessunit),
          'Shift': shiftFromValue(report.dma_shifttype),
          'Duty Manager': displayName(report),
          'Report Status': report.dma_dmacknowledgmenttimestamp ? 'Acknowledged' : 'Submitted',
          'Acknowledged Date/Time': report.dma_dmacknowledgmenttimestamp || '',
          'Minutes to Acknowledge': acknowledgmentMinutes,
          'Hot Issues': report.dma_hotissues || '',
          'Major Incidents': report.dma_majorincidents || 0,
          'Pending Issues': report.dma_pendingissues || 0,
          'ER DAMA': report.dma_erdama || 0,
          'INP DAMA': report.dma_inpdama || 0,
        }
      })
    if (!exportRows.length) {
      setExportStatus('No records match the selected filters.')
      return
    }
    const columns = Object.keys(exportRows[0])
    const escapeCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const csv = `\uFEFF${columns.map(escapeCell).join(',')}\r\n${exportRows.map((row: Record<string, unknown>) => columns.map((column) => escapeCell(row[column])).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `duty-manager-operations-${dateFilter || 'all-dates'}-${shiftFilter.toLowerCase()}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    setExportStatus(`${exportRows.length} report${exportRows.length === 1 ? '' : 's'} exported.`)
    window.setTimeout(() => setExportStatus(''), 4000)
  }
  async function syncDashboard() {
    if (syncing) return
    setSyncing(true)
    setSyncError('')
    try {
      await refresh()
    } catch (error) {
      setSyncError(`Sync failed: ${errorMessage(error)}`)
    } finally {
      setSyncing(false)
    }
  }
  function showQueue(filter: 'all' | 'incidents' | 'unresolved') {
    setQueueFilter(filter)
    window.setTimeout(() => document.getElementById('executive-issue-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  function handleQueueRow(row: any) {
    if (row.reportId) openReport(row.reportId)
    else openIssue(row)
  }
  return <section className="dashboard command-dashboard">
    <div className="command-head no-title">
      <div className="command-controls">
        <label><span>Date</span><PulseDatePicker ariaLabel="Date" value={dateFilter} onChange={setDateFilter} /></label>
        <label><span>Shift</span><PulseSelect ariaLabel="Shift" value={shiftFilter} onChange={setShiftFilter} options={['Morning', 'Evening', 'Night'].map((shift) => ({ value: shift, label: shift }))} /></label>
        <label><span>Business unit</span><PulseSelect ariaLabel="Business unit" value={buFilter} onChange={setBuFilter} options={[{ value: 'All', label: 'All' }, ...businessUnits.map(([, label]) => ({ value: label, label }))]} /></label>
        <label><span>Duty manager</span><PulseSelect ariaLabel="Duty manager" value={dmFilter} onChange={setDmFilter} options={[{ value: 'All', label: 'All' }, ...dmOptions.map((name) => ({ value: name, label: name }))]} /></label>
        <span className="updated-pill">Updated {data?.updated || 'not yet'}</span>
        <button className="btn export-report" onClick={exportDashboardReport}>Export Excel</button>
        <button className="btn sync" onClick={syncDashboard} disabled={syncing}>{syncing ? 'Syncing...' : 'Sync now'}</button>
      </div>
    </div>
    {(syncError || exportStatus) && <div className={`dashboard-action-status ${syncError ? 'error' : ''}`}>{syncError || exportStatus}</div>}

    <section className="command-signal-grid">
      <button type="button" className="signal-card dark is-clickable" onClick={() => showQueue('incidents')} aria-label={`System attention: ${majorCount} major incidents. View incidents`}>
        <small>System attention</small>
        <strong>{majorCount} major incidents</strong>
        <p>{majorCount ? 'Major event escalation active' : 'No major incidents'}</p>
      </button>
      <button type="button" className="signal-card is-clickable" onClick={() => showQueue('unresolved')} aria-label={`Active blockers: ${blockerCount} unresolved issues. View unresolved issues`}>
        <small>Active blockers</small>
        <strong>{blockerCount} unresolved issues</strong>
        <p>{blockerCount ? `${blockerCount} issue${blockerCount === 1 ? '' : 's'} require ownership` : 'No active blockers require ownership'}</p>
      </button>
      <article className="signal-card soft">
        <small>Reporting</small>
        <strong>{submittedCount}/{expectedCount} submitted</strong>
        <p>{pendingBus.length ? `${pendingBus.length} BUs pending` : 'All selected BUs submitted'}</p>
      </article>
    </section>

    <div className="command-section-title">
      <h2>Business unit operations network</h2>
      <p>Handover state and supported operational signals.</p>
    </div>
    <div className="command-network">
      <section className="network-table-card">
        <div className="network-head">
          <span>Unit / Duty Manager</span><span>Handover State</span><span>Staff</span><span>Incidents</span><span>Flow</span><span>Peak Capacity</span><span>ER DAMA</span><span>Pending</span>
        </div>
        {visibleBus.length === 0 && <div className="network-filter-empty"><strong>No records found</strong><span>No business-unit reports match the selected date, shift, business unit, and duty manager filters.</span></div>}
        {visibleBus.map((b: any) => {
          const submittedRow = Boolean(b.report)
          const stateClass = b.status === 'acknowledged' ? 'ok' : b.status === 'submitted' ? 'info' : 'critical'
          return <article className={`network-row ${b.status}`} id={`network-row-${b.label}`} key={b.value}>
            <div><strong>{b.label}</strong><small>{submittedRow ? b.dm : `${shiftFilter} report not submitted`}</small></div>
            <span className={`status-token ${stateClass}`}>{b.status === 'unsubmitted' ? 'Report overdue' : b.statusLabel}</span>
            <b>{submittedRow ? 'Adequate' : 'Overdue by'}</b>
            <b>{b.report?.dma_majorincidents || 0}</b>
            <b>{submittedRow ? `${b.report?.dma_admissions ?? 0} -> ${b.report?.dma_discharges ?? 0}` : 'Overdue'}</b>
            <b>{b.report?.dma_inputilization ? `ICU ${b.report.dma_inputilization}%` : submittedRow ? 'Stable' : 'Pending report'}</b>
            <b>{b.report?.dma_erdama != null ? `${b.report.dma_erdama}%` : submittedRow ? '0%' : 'Pending report'}</b>
            <b>{b.status === 'unsubmitted' ? '' : Number(b.report?.dma_pendingissues || 0)}</b>
          </article>
        })}
      </section>
    </div>

    <section className="command-pipeline">
      <div><small>Expected</small><b>{expectedCount}</b></div>
      <span>{'->'}</span>
      <div><small>Submitted</small><b>{submittedCount}</b></div>
      <span>{'->'}</span>
      <div><small>Acknowledged</small><b>{acknowledged}</b></div>
      <span>{'->'}</span>
      <div className="action"><small>Action required</small><b>{actionRequired}</b></div>
    </section>

    <section className="executive-queue" id="executive-issue-queue">
      <div className="queue-head">
        <div><div className="eyebrow">Aging & escalation</div><h2>Executive issue queue</h2><p>{queueLabel}</p></div>
      </div>
      <table>
        <thead><tr><th>Issue</th><th>BU</th><th>Owner</th><th>Operational Status</th><th>Age</th><th>Action</th></tr></thead>
        <tbody>{queueRows.length ? queueRows.map((row: any) => <tr key={row.id}><td>{row.issue}</td><td>{row.bu}</td><td>{row.owner}</td><td><span className="status-token warning">{row.category}</span></td><td>{row.age}</td><td><button className="btn small" onClick={() => handleQueueRow(row)}>Open issue</button></td></tr>) : <tr><td colSpan={6} className="empty-cell">No records found for the selected filters.</td></tr>}</tbody>
      </table>
    </section>
  </section>
}
// Alert descriptions arrive as one run-on string with embedded app links, e.g.
// "Affected Service: Lab Outage Type: Partial ... https://apps.powerapps.com/...".
// Drop the links and put each "Label: value" part on its own line.
function alertLines(description?: string) {
  const text = String(description || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim()
  if (!text) return []
  // Scan left to right for known labels (a generic "Word Word:" rule would break "Lab Outage Type:" apart);
  // the longest-first list makes "Fault Description" win over "Description".
  const labelPattern = new RegExp(`(?:^|\\s)(${ALERT_LABELS.join('|')}):`, 'gi')
  const hits = [...text.matchAll(labelPattern)]
  const lines: { label: string; value: string }[] = []
  const lead = text.slice(0, hits[0]?.index ?? text.length).trim()
  if (lead) lines.push({ label: '', value: lead })
  hits.forEach((hit, i) => {
    const start = (hit.index ?? 0) + hit[0].length
    const end = hits[i + 1]?.index ?? text.length
    const value = text.slice(start, end).trim()
    if (value) lines.push({ label: hit[1], value })
  })
  return lines
}

// Labels used in flow-generated alert descriptions (longest first so "Fault Description" wins over "Description").
const ALERT_LABELS = [
  'Service Functionality', 'Service Affected', 'Affected Service', 'Fault Description', 'Pending Details', 'Resolution Status',
  'Unresolved for', 'Business Unit', 'Duty Manager', 'Outage Type', 'Issue Type', 'Event Type', 'Event Code', 'Created On',
  'Reported By', 'Description', 'Category', 'Severity', 'Patient', 'Status', 'Report', 'Shift',
]

// Open / Done switch at the top of the drawer: done alerts live in their own view (with Reopen)
// instead of staying greyed out in the same list or sitting at the bottom.
function AlertDrawer({ alerts, markAlertRead, markAlertUnread, openReport, close }: any) {
  const open = alerts.filter((a: AlertRow) => !a.isRead)
  const done = alerts.filter((a: AlertRow) => a.isRead)
  const [view, setView] = useState<'open' | 'done'>('open')
  const item = (a: AlertRow) => <div className={`alert-item${a.isRead ? ' is-done' : ''}`} key={a.id}>
    <span className={`alert-dot ${a.isRead ? 'done' : a.severity}`}></span>
    <div className="alert-copy">
      <strong className={`alert-title ${a.severity}`}>{a.title}</strong>
      {alertLines(a.description).length > 0 && <dl className="alert-lines">{alertLines(a.description).map((line, index) => <div key={index}>{line.label && <dt>{line.label}</dt>}<dd>{line.value}</dd></div>)}</dl>}
      <small>{formatDate(a.createdOn)}</small>
      <div className="alert-row-actions">
        {a.reportId && <button className="alert-cta" onClick={() => openReport(a.reportId)}>Open Report</button>}
        {a.isRead
          ? <button className="alert-reopen" onClick={() => markAlertUnread(a.id)}>Reopen</button>
          : <button className="alert-done" onClick={() => markAlertRead(a.id)}>Mark done</button>}
      </div>
    </div>
  </div>
  return <div className="drawer-backdrop" onClick={close}><aside className="alert-drawer" onClick={(event) => event.stopPropagation()}>
    <div className="alert-drawer-head"><div><span>Operations</span><h2>Duty Manager Alerts</h2><small>{open.length} open · {done.length} done</small></div><button className="icon-close" onClick={close} aria-label="Close alerts">x</button></div>
    {alerts.length === 0 ? <Empty title="No alerts" text="Connected alert rows will appear here." /> : <>
      <div className="alert-switch" role="tablist" aria-label="Alert status">
        <button type="button" role="tab" aria-selected={view === 'open'} className={view === 'open' ? 'active' : ''} onClick={() => setView('open')}>Open <b>{open.length}</b></button>
        <button type="button" role="tab" aria-selected={view === 'done'} className={view === 'done' ? 'active' : ''} onClick={() => setView('done')}>Done <b>{done.length}</b></button>
      </div>
      <div className="alert-drawer-list" role="tabpanel">
        {view === 'open'
          ? (open.length === 0 ? <div className="alert-all-clear">All caught up. There are no open alerts.</div> : open.map(item))
          : (done.length === 0 ? <div className="alert-all-clear neutral">No alerts have been marked done yet.</div> : done.map(item))}
      </div>
    </>}
  </aside></div>
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
  const [showErrors, setShowErrors] = useState(false)
  // Every page except General stays locked until the previous handover is acknowledged.
  const ackPending = acknowledgmentPending(state.previous)
  const locked = ackPending && active !== 'general'
  const missing: string[] = state.completion.missing
  const pageMissing = missing.filter((field) => missingFieldTab(field) === active)
  const pageInfo = reportTabs.find(([, , key]) => key === active)
  return <ValidationContext.Provider value={{ show: showErrors, missing }}><div className="editor-shell">
    <nav className="nav-tabs">{tabs.map(([key, label]) => <button key={key} className={`${active === key ? 'active' : ''}${ackPending && key !== 'general' ? ' locked' : ''}`} title={ackPending && key !== 'general' ? 'Acknowledge the previous handover first' : undefined} onClick={() => state.setTab(key)}>{label}</button>)}</nav>
    {showErrors && active !== 'summary' && pageMissing.length > 0 && <div className="page-missing-banner" role="alert">
      <div>
        <strong>{pageMissing.length} required {pageMissing.length === 1 ? 'field is' : 'fields are'} missing on this page{pageInfo ? ` (${pageInfo[1]})` : ''}</strong>
        <div className="missing-chip-list">{pageMissing.map((field) => <button type="button" className="missing-chip" key={field} title="Show on page" onClick={() => scrollToMissing(field)}>{field}</button>)}</div>
      </div>
      <button type="button" className="btn small" onClick={() => state.setTab('summary')}>Back to Summary</button>
    </div>}
    {active === 'general' && <GeneralTab form={state.form} updateForm={state.updateForm} reportId={state.reportId} searchUsers={state.searchUsers} userMatches={state.userMatches} setUserMatches={state.setUserMatches} openReport={state.openReport} adminIssues={state.adminIssues} setAdminIssues={state.setAdminIssues} opsIssues={state.opsIssues} setOpsIssues={state.setOpsIssues} setTab={state.setTab} duplicateDraft={state.duplicateDraft} openDraft={state.openDraft} previous={state.previous} />}
    {state.previous.failed && <div className="page-missing-banner ack-check-failed" role="alert"><div><strong>Couldn't check the previous handover</strong><p>Acknowledgment of the previous shift could not be verified, so this report is not locked. Retry before submitting.</p></div><button type="button" className="btn small" onClick={state.previous.retry}>Retry</button></div>}
    {locked && <AcknowledgeGate previous={state.previous} openReport={state.openReport} goGeneral={() => state.setTab('general')} />}
    {!locked && active === 'events' && <EventsTab businessUnit={state.form.businessUnit} events={state.events} setEvents={state.setEvents} eventTypes={state.eventTypes} eventCodes={state.eventCodes} loadEventCodes={state.loadEventCodes} />}
    {!locked && active === 'admin' && <AdminTab form={state.form} updateForm={state.updateForm} adminIssues={state.adminIssues} setAdminIssues={state.setAdminIssues} adminCatalog={state.adminCatalog} />}
    {!locked && active === 'flow' && <FlowTab form={state.form} updateForm={state.updateForm} reportId={state.reportId} discharges={state.discharges} damaEntries={state.damaEntries} setDamaEntries={state.setDamaEntries} earlyDischarges={state.earlyDischarges} setEarlyDischarges={state.setEarlyDischarges} />}
    {!locked && active === 'ops' && <OpsTab opsIssues={state.opsIssues} setOpsIssues={state.setOpsIssues} />}
    {!locked && active === 'experience' && <ExperienceTab form={state.form} updateForm={state.updateForm} />}
    {!locked && active === 'summary' && <SummaryTab form={state.form} updateForm={state.updateForm} completion={state.completion} pendingItems={state.pendingItems} submitReport={state.submitReport} busy={state.busy} setTab={state.setTab} showErrors={showErrors} onSubmitAttempt={() => setShowErrors(true)} />}
  </div></ValidationContext.Provider>
}
function GeneralTab({ form, updateForm, searchUsers, userMatches, setUserMatches, openReport, adminIssues, setAdminIssues, opsIssues, setOpsIssues, setTab, duplicateDraft, openDraft, previous }: any) {
  // Previous same-BU handover state lives in DutyManager so every report page can require its acknowledgment.
  const { report: previousReport, carryItems, loading: previousLoading, message: previousMessage, acknowledge: acknowledgePrevious } = previous as PreviousHandover
  const previousAcknowledged = Boolean(previousReport?.dma_dmacknowledgmenttimestamp)
  const [reportDatePart = '', reportTimePart = ''] = String(form.reportDate || '').split('T')
  function updateMobileReportDate(nextDate: string, nextTime: string) {
    updateForm({ reportDate: `${nextDate || reportDatePart}T${nextTime || reportTimePart || '00:00'}` })
  }

  function carryForward(item: any) {
    const carrySource = previousReport
      ? `${labelFor(businessUnits, previousReport.dma_businessunit)} - ${shiftFromValue(previousReport.dma_shifttype)} - ${formatDate(previousReport.dma_reportdate)}${previousReport.dma_name ? ` (${previousReport.dma_name})` : ''}`
      : 'Previous same-BU handover'
    if (item.kind === 'admin') {
      if (adminIssues.some((issue: AdminIssue) => issue.id === item.targetId)) return
      setAdminIssues([...adminIssues, {
        id: item.targetId,
        catId: '',
        catLabel: item.title,
        status: String(item.status || '778000000') as Resolution,
        desc: item.description,
        action: item.action || '',
        pendingDetails: item.pending || item.description || 'Carried forward from previous shift',
        carrySource,
      }])
      setTab('admin')
      return
    }
    if (opsIssues.some((issue: OpsIssue) => issue.id === item.targetId)) return
    setOpsIssues([...opsIssues, {
      id: item.targetId,
      funcId: String(item.funcId || '778000000'),
      affectedId: String(item.affectedId || '778000000'),
      issueId: String(item.issueId || '778000000'),
      statusId: String(item.status || '778000000') as Resolution,
      desc: item.description,
      pendingDetails: item.pending || item.description || 'Carried forward from previous shift',
      carrySource,
    }])
    setTab('ops')
  }

  function carriedAlready(item: any) {
    return item.kind === 'admin'
      ? adminIssues.some((issue: AdminIssue) => issue.id === item.targetId)
      : opsIssues.some((issue: OpsIssue) => issue.id === item.targetId)
  }

  return <main className="workflow-page general-page">
    <PageTitle step="01" eyebrow="Shift Identity" title="General" subtitle="Confirm the reporting context and accept responsibility for the incoming shift." />
    {duplicateDraft && <div className="page-missing-banner duplicate-draft-banner" role="alert">
      <div>
        <strong>A draft for this handover already exists</strong>
        <p>{labelFor(businessUnits, duplicateDraft.businessUnit)} · {duplicateDraft.shift} shift · {formatDate(duplicateDraft.reportDate)} · {duplicateDraft.dmName || 'Duty Manager'}. Change the business unit, shift or date, or continue the existing draft. This report can't be submitted while both exist.</p>
      </div>
      <button type="button" className="btn small" onClick={() => openDraft(duplicateDraft)}>Open existing draft</button>
    </div>}
    <section className="identity-card">
      <div className="identity-card-head"><span>Shift identity</span></div>
      <div className="identity-fields">
        <Field label="Duty Manager" required="Duty Manager"><div className="lookup-wrap"><input value={form.dmName} onChange={(e) => searchUsers(e.target.value)} onBlur={() => setTimeout(() => setUserMatches([]), 150)} />{userMatches.length > 0 && <div className="lookup-results">{userMatches.map((u: any) => <button className="lookup-item" key={u.systemuserid} onClick={() => { updateForm({ dmName: u.fullname, dmUserId: u.systemuserid }); setUserMatches([]) }}>{u.fullname}</button>)}</div>}</div></Field>
        <SelectField label="Business Unit" required="Business Unit" value={form.businessUnit} options={businessUnits} onChange={(businessUnit: string) => updateForm({ businessUnit })} />
        <div className="report-date-fields"><Field label="Report Date" required="Report Date"><PulseDatePicker ariaLabel="Report date" value={reportDatePart} onChange={(date) => updateMobileReportDate(date, reportTimePart)} /></Field><Field label="Report Time"><input type="time" value={reportTimePart.slice(0, 5)} onChange={(e) => updateMobileReportDate(reportDatePart, e.target.value)} /></Field></div>
        <Field label="Shift" required="Shift"><PulseSelect ariaLabel="Shift" value={form.shift} onChange={(shift) => updateForm({ shift: shift as Shift })} options={['Morning', 'Evening', 'Night'].map((shift) => ({ value: shift, label: shift }))} /></Field>
      </div>
    </section>
    <div className="page-section-title"><h2>Incoming responsibility</h2><p>Context carried from the previous Duty Manager.</p></div>
    <section className="takeover-grid">
      <div className="carry-register">
        <div className="carry-ack previous-handover-row">
          <div>
            <h3>{previousReport?.dma_name || 'Previous handover'}</h3>
            <p>{previousLoading ? 'Retrieving the latest submitted handover from the same business unit...' : previousReport ? `${labelFor(businessUnits, previousReport.dma_businessunit)} - ${shiftFromValue(previousReport.dma_shifttype)} - ${formatDate(previousReport.dma_reportdate)}${previousMessage ? ` - ${previousMessage}` : ''}` : previousMessage || 'No previous handover found for this business unit.'}</p>
          </div>
          <span className={`status-token ${previousAcknowledged ? 'ok' : previousReport ? 'warning' : 'info'}`}>{previousAcknowledged ? 'Acknowledged' : previousReport ? 'Needs acknowledgment' : 'No report'}</span>
          <div className="carry-actions">
            {previousReport?.dma_handoverreportid && <button className="btn" onClick={() => openReport(previousReport.dma_handoverreportid)}>View previous report</button>}
            {previousReport?.dma_handoverreportid && !previousAcknowledged && <button className="btn primary" onClick={acknowledgePrevious}>Acknowledge</button>}
          </div>
        </div>
        <div className="carry-label">Carried forward responsibilities</div>
        {previousLoading ? <div className="carry-row"><div><h3>Loading carried responsibilities</h3><p>Checking unresolved issues from the previous same-BU handover.</p></div><span className="status-token info">Loading</span><div><strong>Previous shift</strong><small>Source</small></div><button className="btn" disabled>Loading</button></div> : carryItems.length === 0 ? <div className="carry-row"><div><h3>No carried responsibilities found</h3><p>No unresolved administrative or operations issues were found on the previous same-BU handover.</p></div><span className="status-token ok">Clear</span><div><strong>Previous shift</strong><small>Source</small></div></div> : carryItems.map((item) => <div className="carry-row" key={item.id}><div><h3>{item.title}</h3><p>{item.description || item.pending || 'No details recorded.'}</p></div><span className="status-token warning">{item.kind === 'admin' ? 'Administrative' : 'Operations'}</span><div><strong>{item.age}</strong><small>{labelFor(resolutionOptions, item.status)}</small></div><button className="btn" disabled={carriedAlready(item)} onClick={() => carryForward(item)}>{carriedAlready(item) ? 'Carried' : 'Carry over'}</button></div>)}
      </div>
      <aside className="takeover-state"><div className="eyebrow">Takeover state</div><h2>{previousAcknowledged ? 'Responsibility accepted' : 'Acknowledgment pending'}</h2><p>{previousAcknowledged ? 'Previous-shift context has been acknowledged. Carried items remain visible for ownership.' : 'Review and acknowledge the previous same-BU handover before responsibility transfer.'}</p><div className="takeover-check"><span>Reporting context</span><b>Complete</b></div><div className={previousAcknowledged ? 'takeover-check' : 'takeover-check warn'}><span>Previous handover</span><b>{previousAcknowledged ? 'Acknowledged' : previousReport ? 'Required' : 'Not found'}</b></div><div className={carryItems.length ? 'takeover-check warn' : 'takeover-check'}><span>Carried responsibility</span><b>{carryItems.length ? `${carryItems.length} item${carryItems.length === 1 ? '' : 's'}` : 'Clear'}</b></div></aside>
    </section>
  </main>
}

function EventsTab({ businessUnit, events, setEvents, eventTypes, eventCodes, loadEventCodes }: any) {
  const isMissing = useMissingItem()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<EventItem>({ id: '', typeId: '', typeText: '', codeId: '', codeText: '', severity: '778000001', desc: '', actions: '', area: patientAreaOptions(businessUnit)[0][0], pName: '', pCode: '', pId: '' })
  const validation = useSaveErrors((d: EventItem) => {
    const e: Record<string, string> = {}
    if (!d.typeId) e.typeId = 'Select the critical event type.'
    if (!d.codeId) e.codeId = d.typeId ? 'Select the specific code.' : 'Select an event type first, then the code.'
    if (!d.area) e.area = REQUIRED
    if (!d.pId || !d.pName) e.patient = 'Search and select the patient.'
    if (!d.desc.trim()) e.desc = 'Describe the incident.'
    if (!d.actions.trim()) e.actions = 'Record the immediate actions taken.'
    return e
  }, draft)
  const errors = validation.errors
  const areaOptions = eventAreaOptions(draft.typeText, businessUnit)
  const reset = () => setDraft({ id: '', typeId: '', typeText: '', codeId: '', codeText: '', severity: '778000001', desc: '', actions: '', area: patientAreaOptions(businessUnit)[0][0], pName: '', pCode: '', pId: '' })
  useEffect(() => {
    setDraft((current) => {
      const allowed = eventAreaOptions(current.typeText, businessUnit)
      return allowed.some(([area]) => area === current.area) ? current : { ...current, area: allowed[0][0], pName: '', pCode: '', pId: '' }
    })
  }, [businessUnit])
  const closeModal = () => { reset(); validation.reset(); setAdding(false) }
  function editEvent(item: EventItem) {
    setDraft({ ...item, pCode: item.pCode || '' })
    if (item.typeId) loadEventCodes(item.typeId)
    setAdding(true)
  }
  function changeType(typeId: string) {
    const t = eventTypes.find((x: any) => x.dma_eventtypeid === typeId)
    const typeText = t?.dma_name || ''
    const nextArea = eventAreaOptions(typeText, businessUnit)[0][0]
    setDraft({ ...draft, typeId, typeText, codeId: '', codeText: '', area: nextArea, pName: '', pCode: '', pId: '' })
    if (typeId) loadEventCodes(typeId)
  }
  function save() {
    if (!validation.check()) return
    const item = { ...draft, id: draft.id || `event-${Date.now()}`, typeText: draft.typeText || 'Event', codeText: draft.codeText || 'Code', pCode: draft.pCode || '' }
    setEvents(draft.id ? events.map((event: EventItem) => event.id === draft.id ? item : event) : [...events, item])
    closeModal()
  }
  const [severityFilter, setSeverityFilter] = useState('all')
  const major = events.filter((e: EventItem) => e.severity === '778000002').length
  const moderate = events.filter((e: EventItem) => e.severity === '778000001').length
  const low = Math.max(0, events.length - major - moderate)
  const severityFilters: FilterOption[] = [
    { value: 'all', label: 'All', count: events.length, tone: 'all' },
    { value: '778000002', label: 'Major', count: major, tone: 'danger' },
    { value: '778000001', label: 'Moderate', count: moderate, tone: 'warning' },
    { value: '778000000', label: 'Low', count: low, tone: 'success' },
  ]
  const visibleEvents = severityFilter === 'all' ? events.length : events.filter((e: EventItem) => e.severity === severityFilter).length
  return <main className="workflow-page events-page">
    <PageTitle step="02" eyebrow="Clinical Situation Awareness" title="Hospital events" subtitle="Time-ordered clinical events, severity and accountable ownership." action={<button className="btn primary" onClick={() => setAdding(true)}>Log hospital event</button>} />
    {adding && <ModalShell title={draft.id ? 'Edit Hospital Event' : 'Add Hospital Event'} tone="event" onClose={closeModal}>
      <div className="grid report-grid two">
        <Field label="Critical Event Type *" error={errors.typeId}><PulseSelect ariaLabel="Critical event type" placeholder="Select" value={draft.typeId} onChange={changeType} options={eventTypes.map((x: any) => ({ value: x.dma_eventtypeid, label: x.dma_name }))} /></Field>
        <Field label="Specific Code *" error={errors.codeId}><PulseSelect ariaLabel="Specific code" placeholder={draft.typeId ? 'Select' : 'Select event type first'} disabled={!draft.typeId} title={!draft.typeId ? 'Select a Critical Event Type first' : 'Select the specific event code'} value={draft.codeId} onChange={(codeId) => { const c = eventCodes.find((x: any) => x.dma_eventcodeid === codeId); setDraft({ ...draft, codeId, codeText: c?.dma_name || '' }) }} options={eventCodes.map((x: any) => ({ value: x.dma_eventcodeid, label: x.dma_name }))} /></Field>
        <SeverityBubbles value={draft.severity} onChange={(severity: Severity) => setDraft({ ...draft, severity })} />
        <Field label="Context (Area) *" error={errors.area}><PulseSelect ariaLabel="Context area" value={draft.area || areaOptions[0][0]} onChange={(area) => setDraft({ ...draft, area: area as PatientArea, pName: '', pCode: '', pId: '' })} options={areaOptions.map(([value, label]) => ({ value, label }))} /></Field>
      </div>
      <div className="grid report-grid two">
        <PatientLookup key={draft.area || areaOptions[0][0]} area={(draft.area || areaOptions[0][0]) as PatientArea} label="Patient Search *" error={errors.patient} value={draft.pName ? `${draft.pName}${draft.pCode ? ` (${draft.pCode})` : ''}` : ''} onSelect={(p) => setDraft({ ...draft, area: p.area, pName: p.name, pCode: p.code, pId: p.id })} />
        <Field label="Patient Code"><input className="auto-filled-input" value={draft.pCode || ''} readOnly aria-readonly="true" tabIndex={-1} placeholder="Auto-filled from patient search" /></Field>
      </div>
      <Field label="Incident Description *" error={errors.desc}><TextArea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="Details of the event..." /></Field>
      <Field label="Immediate Actions Taken *" error={errors.actions}><TextArea value={draft.actions} onChange={(e) => setDraft({ ...draft, actions: e.target.value })} placeholder="Steps taken to mitigate issue..." /></Field>
      <div className="modal-actions"><button className="btn" onClick={closeModal}>Cancel</button><button className="btn primary" onClick={save}>{draft.id ? 'Save Event' : 'Add Event'}</button></div>
    </ModalShell>}
    <section className="event-summary-strip two-cells"><div><small>Shift event register</small><b>{events.length}<span>events this shift</span></b></div><div><small>Operational state</small><b>{events.length}<span>active events</span></b></div></section>
    <div className="page-section-title"><h2>Clinical event timeline</h2><p>Chronological event record for this shift.</p></div>
    {events.length > 0 && <TimelineFilters label="Filter events by severity" options={severityFilters} value={severityFilter} onChange={setSeverityFilter} />}
    <section className="event-timeline">{events.length === 0 ? <Empty title="No hospital events recorded" text="Clinical events logged during this shift will appear in the timeline." /> : visibleEvents === 0 ? <Empty title="No events at this severity" text="Choose another filter to see the rest of the timeline." /> : events.map((e: EventItem, index: number) => (severityFilter === 'all' || e.severity === severityFilter) && <article className={`timeline-row pulse-row${isMissing(`Event ${index + 1}`) ? ' has-missing' : ''}`} data-missing-item={`Event ${index + 1}`} key={e.id}>
      <time>{shortTime(new Date().toISOString()) || `0${index}:00`}</time>
      <span className={`timeline-dot ${severityClass(e.severity)}`} title={labelFor(severityOptions, e.severity)} />
      <div className="tl-body">
        <h3 className="tl-title">{patientLine(e.pName, e.pCode, e.area) || `${e.typeText} - ${e.codeText}`}</h3>
        {e.pName && <div className="tl-sub">{e.typeText} - {e.codeText}</div>}
        <p className="tl-desc">{e.desc}</p>
        <TimelineField title="Action" text={e.actions} />
      </div>
      <div className="row-actions compact"><button className="btn small" onClick={() => editEvent(e)}>Update</button><DeleteButton label="Delete event" onClick={() => setEvents(events.filter((x: EventItem) => x.id !== e.id))} /></div>
    </article>)}</section>
  </main>
}
function AdminTab({ form, updateForm, adminIssues, setAdminIssues, adminCatalog }: any) {
  const isMissing = useMissingItem()
  const adminAreas = patientAreaOptions(form.businessUnit)
  const [draft, setDraft] = useState<AdminIssue>({ id: '', catId: '', catLabel: '', status: '778000000', desc: '', action: '', pendingDetails: '', area: adminAreas[0][0], pName: '', pCode: '', pId: '' })
  const [adding, setAdding] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const validation = useSaveErrors((d: AdminIssue) => {
    const e: Record<string, string> = {}
    if (!d.catId) e.catId = 'Select the issue category.'
    if (!d.status) e.status = REQUIRED
    if (!d.area) e.area = REQUIRED
    if (!d.pId || !d.pName) e.patient = 'Search and select the patient.'
    if (d.status !== '778000001' && !d.pendingDetails.trim()) e.pendingDetails = 'Add a summary or the pending action plan.'
    return e
  }, draft)
  const errors = validation.errors
  const delayed = form.delayedDischargesCount
  const prolonged = form.prolongedERAdmissionsCount
  useEffect(() => {
    setDraft((current) => adminAreas.some(([area]) => area === current.area) ? current : { ...current, area: adminAreas[0][0], pName: '', pCode: '', pId: '' })
  }, [form.businessUnit])
  function resetAdminDraft() { setDraft({ id: '', catId: '', catLabel: '', status: '778000000', desc: '', action: '', pendingDetails: '', area: adminAreas[0][0], pName: '', pCode: '', pId: '' }) }
  function editAdminIssue(issue: AdminIssue) { setDraft({ ...issue }); setAdding(true) }
  function closeAdminModal() { resetAdminDraft(); validation.reset(); setAdding(false) }
  function save() {
    if (!validation.check()) return
    const catLabel = labelFor(adminCatalog, draft.catId)
    const item = { ...draft, id: draft.id || `admin-${Date.now()}`, catLabel }
    setAdminIssues(draft.id ? adminIssues.map((issue: AdminIssue) => issue.id === draft.id ? item : issue) : [...adminIssues, item])
    closeAdminModal()
  }
  return <main className="workflow-page admin-page"><PageTitle step="03" eyebrow="Operational Constraints" title="Administrative issues" subtitle="Delayed discharges, prolonged ER admissions and issue ownership." action={<button className="btn primary" onClick={() => setAdding(true)}>Log administrative issue</button>} />
    <section className="admin-metrics"><div><small>Current load</small><b>{adminIssues.length}<span>Open issues</span></b><p>active this shift</p></div><div><small>Operational pressure</small><div className="metric-cluster"><b>{delayed}<span>Delayed discharges</span></b><b>{prolonged}<span>Prolonged ER</span></b><b>{Math.max(0, adminIssues.length - delayed - prolonged)}<span>Other blockers</span></b></div></div><div><small>Duty Manager attention</small><b>{adminIssues.filter((i: AdminIssue) => i.status !== '778000001').length} actions due</b><p>Requires intervention before handover</p></div></section>
    <div className="inline-edit-fields"><Field label="Delayed discharge narrative"><TextArea value={form.delayedDischargesNarrative} onChange={(e) => updateForm({ delayedDischargesNarrative: e.target.value })} /></Field><Field label="Prolonged ER narrative"><TextArea value={form.prolongedERNarrative} onChange={(e) => updateForm({ prolongedERNarrative: e.target.value })} /></Field></div>
    {adding && <ModalShell title={draft.id ? 'Edit Administrative Issue' : 'Add Administrative Issue'} tone="admin" onClose={closeAdminModal}><div className="grid report-grid two"><SelectField label="Issue Category *" error={errors.catId} value={draft.catId} options={adminCatalog} placeholder="Select" onChange={(catId: string) => setDraft({ ...draft, catId })} /><SelectField label="Resolution Status *" error={errors.status} value={draft.status} options={resolutionOptions} onChange={(status: Resolution) => setDraft({ ...draft, status })} /><SelectField label="Patient Area *" error={errors.area} value={draft.area || adminAreas[0][0]} options={adminAreas} onChange={(area: PatientArea) => setDraft({ ...draft, area, pName: '', pCode: '', pId: '' })} /><PatientLookup key={draft.area || adminAreas[0][0]} area={(draft.area || adminAreas[0][0]) as PatientArea} label="Patient Search *" error={errors.patient} value={draft.pName ? `${draft.pName}${draft.pCode ? ` (${draft.pCode})` : ''}` : ''} onSelect={(p) => setDraft({ ...draft, area: p.area, pName: p.name, pCode: p.code, pId: p.id })} /></div><Field label="Description"><TextArea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} /></Field><Field label="Action Taken"><TextArea value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} /></Field>{draft.status !== '778000001' && <Field label="Summary / Pending Details *" error={errors.pendingDetails}><TextArea value={draft.pendingDetails} onChange={(e) => setDraft({ ...draft, pendingDetails: e.target.value })} placeholder="Overall summary or pending action plan..." /></Field>}<div className="modal-actions"><button className="btn" onClick={closeAdminModal}>Cancel</button><button className="btn primary" onClick={save}>{draft.id ? 'Save Issue' : 'Add Issue'}</button></div></ModalShell>}
    <div className="movement-head admin-timeline-head"><div><h2>Administrative issue timeline</h2></div><p>Current-shift constraints, ownership and follow-up.</p></div>
    {adminIssues.length > 0 && <TimelineFilters label="Filter administrative issues by status" options={statusFilters(adminIssues.map((i: AdminIssue) => i.status))} value={statusFilter} onChange={setStatusFilter} />}
    <section className="event-timeline admin-timeline">{adminIssues.length === 0 ? <Empty title="No administrative issues recorded" text="Administrative constraints logged during this shift will appear here." /> : !adminIssues.some((i: AdminIssue) => statusFilter === 'all' || String(i.status) === statusFilter) ? <Empty title="No issues with this status" text="Choose another filter to see the rest of the timeline." /> : adminIssues.map((i: AdminIssue, index: number) => (statusFilter === 'all' || String(i.status) === statusFilter) && <article className={`timeline-row admin-timeline-row pulse-row${isMissing(`Admin Issue ${index + 1}`) ? ' has-missing' : ''}`} data-missing-item={`Admin Issue ${index + 1}`} key={i.id}>
      <time>{String(index + 1).padStart(2, '0')}</time>
      <span className={`timeline-dot ${i.status === '778000001' ? 'low' : 'warning'}`} title={labelFor(resolutionOptions, i.status)} />
      <div className="tl-body">
        <h3 className="tl-title">{patientLine(i.pName, i.pCode, i.area) || i.catLabel}</h3>
        {i.pName && <div className="tl-sub">{i.catLabel}</div>}
        <p className="tl-desc">{i.desc || 'No description entered.'}</p>
        <TimelineField title="Action" text={i.action} />
        {i.status !== '778000001' && <TimelineField title="Pending details" text={i.pendingDetails} />}
      </div>
      <div className="row-actions compact"><button className="btn small" onClick={() => editAdminIssue(i)}>Update</button><DeleteButton label="Delete administrative issue" onClick={() => setAdminIssues(adminIssues.filter((x: AdminIssue) => x.id !== i.id))} /></div>
    </article>)}</section>
  </main>
}
function damaSummaryFromEntries(entries: DamaEntry[]): Partial<FormState> {
  const count = (type: DamaEntry['damaType'], retainedOnly = false) => entries.filter((row) => row.damaType === type && (!retainedOnly || row.retained)).length
  return {
    erDama: count('ER'), erDamaRetention: count('ER', true),
    inpDama: count('INP'), inpDamaRetention: count('INP', true),
    closedDama: count('Closed'), closedDamaRetention: count('Closed', true),
  }
}

function FlowTab({ form, updateForm, reportId, discharges, damaEntries, setDamaEntries, earlyDischarges, setEarlyDischarges }: any) {
  const isMissing = useMissingItem()
  const validation = useContext(ValidationContext)
  const staffMissing = validation.show && ['Staff Coverage', 'Coverage Shortage', 'Shortfall Summary'].some((field) => validation.missing.includes(field))
  const [entry, setEntry] = useState<DamaEntry>({ id: '', damaType: 'ER', patientName: '', patientCode: '', reason: '', actionTaken: '', retained: false })
  const [editingFlow, setEditingFlow] = useState(false)
  const [retentionType, setRetentionType] = useState<DamaEntry['damaType'] | null>(null)
  const [addingEarlyDischarge, setAddingEarlyDischarge] = useState(false)
  const [earlyDischargeMasterId, setEarlyDischargeMasterId] = useState('')
  const [nightFlowStatus, setNightFlowStatus] = useState('')
  const [refreshingFlow, setRefreshingFlow] = useState(false)
  const [flowRefreshStatus, setFlowRefreshStatus] = useState('')
  function saveEntry(type: DamaEntry['damaType']) {
    if (!entry.pId || !entry.patientName) return
    const item: DamaEntry = { ...entry, damaType: type, id: entry.id || `dama-${Date.now()}`, actionTaken: entry.retained ? 'Retained' : 'Not retained' }
    const rows = entry.id ? damaEntries.map((row: DamaEntry) => row.id === entry.id ? item : row) : [...damaEntries, item]
    setDamaEntries(rows)
    updateForm(damaSummaryFromEntries(rows))
    setEntry({ id: '', damaType: type, patientName: '', patientCode: '', reason: '', actionTaken: '', retained: false })
    setRetentionType(null)
  }
  function setEarlyRows(rows: EarlyDischarge[]) {
    setEarlyDischarges(rows)
  }
  async function syncNightEarlyDischarges(showStatus = false) {
    if (form.shift !== 'Night') return
    if (showStatus) setNightFlowStatus('Refreshing tomorrow discharge plan...')
    try {
      const synced = await syncEarlyDischargesViaXrm(form.reportDate)
      setEarlyDischargeMasterId(synced.masterId)
      if (synced.rows.length || synced.masterId) {
        setEarlyRows(synced.rows)
        if (showStatus) setNightFlowStatus(synced.masterId ? 'Night discharge plan refreshed.' : 'No draft discharge plan was found for tomorrow.')
      } else if (showStatus) {
        setNightFlowStatus('No draft discharge plan was found for tomorrow.')
      }
    } catch (error) {
      console.warn('Night discharge plan refresh failed', error)
      if (showStatus) setNightFlowStatus('Could not refresh the night discharge plan.')
    }
  }
  async function saveEarlyDischarge(draft: { type: EarlyDischarge['type'] | ''; patientCode: string; reason: string }) {
    if (!draft.type || !draft.patientCode.trim()) {
      setNightFlowStatus('Choose a discharge type and patient code.')
      return
    }
    if (earlyDischarges.some((row: EarlyDischarge) => row.code.toLowerCase() === draft.patientCode.trim().toLowerCase())) {
      setNightFlowStatus('This patient is already in tomorrow discharge plan.')
      return
    }
    try {
      let masterId = earlyDischargeMasterId
      if (!masterId) {
        const synced = await syncEarlyDischargesViaXrm(form.reportDate)
        masterId = synced.masterId
        setEarlyDischargeMasterId(masterId)
        if (synced.rows.length) setEarlyRows(synced.rows)
      }
      if (!masterId) {
        setNightFlowStatus('No draft Early Discharge master record found for tomorrow. The automated flow must create it first.')
        return
      }
      const dischargeType: EarlyDischarge['type'] = draft.type
      const row = await createEarlyDischargeViaXrm(masterId, { type: dischargeType, patientCode: draft.patientCode, reason: draft.reason })
      const rows = [...earlyDischarges, row]
      setEarlyRows(rows)
      await triggerEarlyDischargeRollup(masterId)
      setAddingEarlyDischarge(false)
      setNightFlowStatus('Patient added to tomorrow discharge plan.')
    } catch (error) {
      console.warn('Could not add early discharge patient', error)
      setNightFlowStatus(error instanceof Error ? error.message : 'Could not add patient to tomorrow discharge plan.')
    }
  }
  async function deleteEarlyDischarge(row: EarlyDischarge) {
    if (!await pulseConfirm('Remove patient', `Remove ${row.name || 'this patient'} from tomorrow's discharge plan? This action cannot be undone.`, 'Remove')) return
    const rows = earlyDischarges.filter((item: EarlyDischarge) => item.id !== row.id)
    setEarlyRows(rows)
    if (!row.id.startsWith('local-')) {
      try {
        await deleteEarlyDischargeViaXrm(row.id)
        if (earlyDischargeMasterId) await triggerEarlyDischargeRollup(earlyDischargeMasterId)
        setNightFlowStatus('Patient removed from tomorrow discharge plan.')
      } catch (error) {
        console.warn('Could not delete early discharge patient', error)
        setNightFlowStatus('Patient removed locally, but Dataverse delete failed.')
      }
    }
  }
  async function refreshAutoCounts(showStatus = true) {
    if (!reportId || String(reportId).startsWith('local-')) return
    if (showStatus) {
      setRefreshingFlow(true)
      setFlowRefreshStatus('Refreshing census...')
    }
    try {
      const patch = await retrievePatientFlowSummary(reportId)
      if (Object.keys(patch).length) updateForm(patch)
      if (showStatus) setFlowRefreshStatus(Object.keys(patch).length ? 'Patient flow refreshed from Dataverse.' : 'No linked patient-flow summary was found.')
    } catch (error) {
      console.warn('Could not refresh patient flow counts', error)
      if (showStatus) setFlowRefreshStatus('Could not refresh auto-counts.')
    } finally {
      if (showStatus) setRefreshingFlow(false)
    }
  }
  useEffect(() => {
    if (!reportId || String(reportId).startsWith('local-')) return
    refreshAutoCounts(false)
  }, [reportId, form.reportDate, form.shift])
  useEffect(() => {
    if (form.shift !== 'Night') return
    syncNightEarlyDischarges(false)
  }, [form.shift, form.reportDate])
  useEffect(() => {
    if (!nightFlowStatus) return
    const timeout = window.setTimeout(() => setNightFlowStatus(''), 8000)
    return () => window.clearTimeout(timeout)
  }, [nightFlowStatus])
  const damaCounts = [
    { type: 'ER' as DamaEntry['damaType'], label: 'ER', cases: damaEntries.filter((row: DamaEntry) => row.damaType === 'ER').length, retained: damaEntries.filter((row: DamaEntry) => row.damaType === 'ER' && row.retained).length },
    { type: 'INP' as DamaEntry['damaType'], label: 'Inpatient', cases: damaEntries.filter((row: DamaEntry) => row.damaType === 'INP').length, retained: damaEntries.filter((row: DamaEntry) => row.damaType === 'INP' && row.retained).length },
    { type: 'Closed' as DamaEntry['damaType'], label: 'Closed', cases: damaEntries.filter((row: DamaEntry) => row.damaType === 'Closed').length, retained: damaEntries.filter((row: DamaEntry) => row.damaType === 'Closed' && row.retained).length },
  ]
  const retentionTotal = damaCounts.reduce((sum, item) => sum + item.retained, 0)
  const flowStatus = form.staffAdequacy === '778000000' ? 'Pressure' : 'Stable'
  return <main className="workflow-page flow-page">
    <PageTitle step="04" eyebrow="Patient Flow" title="Patient flow" subtitle="Live census, movement, theatre flow and retention signals for the current shift." action={<div className="flow-title-actions"><button className="btn" onClick={() => refreshAutoCounts()} disabled={refreshingFlow}>{refreshingFlow ? 'Refreshing...' : 'Refresh counts'}</button><button className="btn primary" onClick={() => setEditingFlow(true)}>Update patient flow</button></div>} />
    <section className="flow-status-strip">
      <div className={`flow-status-cell${staffMissing ? ' has-missing' : ''}`} data-missing-item="Staff">
        <small>Flow status</small>
        <b>{flowStatus}</b>
        <p>{form.staffAdequacy === '778000000' ? form.shortfallSummary || 'Staff coverage requires attention' : 'No current pressure'}</p>
        <span className="staff-chip">Staff coverage <strong>{labelFor(staffOptions, form.staffAdequacy)}</strong></span>
      </div>
      <div className="flow-status-cell flow-metrics">
        <small>Inbound</small>
        <div className="flow-metric-grid">
          <b>{form.admissions}<span>Total admissions</span></b>
          <b>{form.erAdmissions}<span>ER admissions <i className="auto-source-pill">Auto</i> - volume {form.erVolume}</span></b>
          <b>{form.opdAdmissions}<span>OPD admissions <i className="auto-source-pill">Auto</i></span></b>
          <b className="er-volume-metric">{form.erVolume}<span>Total ER volume <a className="er-dashboard-link" href="https://app.powerbi.com/singleSignOn?experience=power-bi&ru=https%3A%2F%2Fapp.powerbi.com%2Fgroups%2F3f5475b1-b4ad-4bcd-8909-7c94862de69c%2Freports%2Fde88cd1b-5c29-4599-a594-57de388f3015%2Fb2d5c8b0b26932ebac9b%3Fexperience%3Dpower-bi%26noSignUpCheck%3D1" target="_blank" rel="noreferrer" aria-label="View ER dashboard in Power BI">↗ View</a></span></b>
        </div>
      </div>
      <div className="flow-status-cell flow-metrics">
        <small>Outbound</small>
        <div className="flow-metric-grid">
          <b>{discharges}<span>Total discharges <i className="auto-source-pill">Auto</i></span></b>
          <b>{form.plannedDischarges}<span>Planned <i className="auto-source-pill">Auto</i></span></b>
          <b>{form.unplannedDischarges}<span>Unplanned</span></b>
        </div>
        <div className="net-flow">Admissions <span>{'->'}</span> In hospital <span>{'->'}</span> Discharges <strong>Net flow {form.admissions - discharges}</strong></div>
      </div>
      <div className="flow-status-cell watch">
        <small>Watch</small>
        <b>{retentionTotal}<span>DAMA retained</span></b>
        <p>{retentionTotal ? 'Retention cases require active ownership.' : 'No retention cases recorded this shift.'}</p>
      </div>
    </section>
    {flowRefreshStatus && <div className="flow-refresh-note">{flowRefreshStatus}</div>}
    <div className="movement-head"><div><h2>Today's movement</h2></div><p>Throughput and exceptions requiring operational awareness.</p></div>
    <div className="flow-work-grid">
      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <section className="theatre-flow-card">
        <div className="flow-card-head">
          <h2>Theatre flow</h2>
          <span><strong>{form.totalORCases}</strong> total cases <em>Current shift</em></span>
        </div>
        <div className="theatre-stage">
          <div><small>Pre-op</small><b>{form.preoperative}</b></div>
          <span className="flow-arrow">{'->'}</span>
          <div><small>Post-op</small><b>{form.postoperative}</b></div>
        </div>
        <div className="theatre-exceptions">
          <small>Exceptions</small>
          <div className="theatre-exception-metrics">
            <span className="postponed">Postponed <b>{form.postponedORCases}</b></span>
            <span className="cancelled">Cancelled <b>{form.cancelledORCases}</b></span>
          </div>
          {!form.postponedORCases && !form.cancelledORCases && <p>No theatre activity recorded for this shift.</p>}
        </div>
        </section>
        {form.shift === 'Night' && <NightDischargeCard form={form} earlyDischarges={earlyDischarges} status={nightFlowStatus} dismissStatus={() => setNightFlowStatus('')} refresh={() => syncNightEarlyDischarges(true)} add={() => { setNightFlowStatus(''); setAddingEarlyDischarge(true) }} remove={deleteEarlyDischarge} />}
      </div>
      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <section className="retention-watch-card">
        <div className="flow-card-head">
          <h2>Retention watch</h2>
          <span>Log only when required</span>
        </div>
        <div className="retention-summary-grid">
          {damaCounts.map((item) => <div className={`retention-summary-item${damaEntries.some((row: DamaEntry, index: number) => row.damaType === item.type && isMissing(`DAMA Entry ${index + 1}`)) ? ' has-missing' : ''}`} key={item.type}><strong>{item.label}</strong><div><span><b>{item.cases}</b> cases</span><span><b>{item.retained}</b> retained</span></div><button className="btn small" onClick={() => { setEntry({ id: '', damaType: item.type, patientName: '', patientCode: '', reason: '', actionTaken: '', retained: false }); setRetentionType(item.type) }}>Add case</button></div>)}
        </div>
        {damaEntries.length > 0 && <div className="retention-table retention-case-register"><div className="retention-head"><span>Patient</span><span>Area</span><span>Status</span><span>Action</span></div>{damaEntries.map((row: DamaEntry, index: number) => <div className={`retention-row${isMissing(`DAMA Entry ${index + 1}`) ? ' has-missing' : ''}`} data-missing-item={`DAMA Entry ${index + 1}`} key={row.id}><strong>{row.patientName || row.patientCode}</strong><span>{row.damaType === 'INP' ? 'Inpatient' : row.damaType}</span><b>{row.retained ? 'Retained' : 'Case'}</b><button className="btn small" onClick={() => { setEntry({ ...row }); setRetentionType(row.damaType) }}>Edit</button></div>)}</div>}
        <p>Retained patients require active ownership before handover.</p>
        </section>
        {form.shift === 'Night' && <NightUtilizationCard form={form} />}
      </div>
    </div>
    {editingFlow && <FlowUpdateModal form={form} updateForm={updateForm} discharges={discharges} close={() => setEditingFlow(false)} />}
    {retentionType && <RetentionPatientModal businessUnit={form.businessUnit} type={retentionType} entry={entry} setEntry={setEntry} saveEntry={() => saveEntry(retentionType)} close={() => setRetentionType(null)} />}
    {addingEarlyDischarge && <EarlyDischargeModal save={saveEarlyDischarge} close={() => setAddingEarlyDischarge(false)} />}
  </main>
}

function FlowUpdateModal({ form, updateForm, discharges, close }: any) {
  const validation = useSaveErrors((f: FormState) => {
    const e: Record<string, string> = {}
    if (f.staffAdequacy === '778000000' && !(f.shortageTypes || []).length) e.shortage = 'Select at least one shortage type.'
    if (f.staffAdequacy === '778000000' && !String(f.shortfallSummary || '').trim()) e.shortfall = 'Describe the impact of the staff shortage.'
    return e
  }, form)
  const errors = validation.errors
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  function toggleShortage(value: string) {
    const current = form.shortageTypes || []
    updateForm({ shortageTypes: current.includes(value) ? current.filter((item: string) => item !== value) : [...current, value] })
  }

  function saveFlowContext() {
    if (!validation.check()) return
    close()
  }

  return <div className="modal flow-popup-backdrop" role="dialog" aria-modal="true">
    <div className="flow-popup flow-update-popup">
      <div className="flow-popup-head">
        <div><h2>Update patient flow</h2><p>Update the current-shift patient flow values.</p></div>
        <button className="flow-popup-close" onClick={close} aria-label="Close">x</button>
      </div>
      <div className="flow-popup-body">
      <div className="flow-popup-section">Staff coverage</div>
      <div className="flow-popup-grid single">
        <label className="flow-popup-field"><span>Staff coverage</span><PulseSelect ariaLabel="Staff coverage" value={form.staffAdequacy} onChange={(staffAdequacy) => updateForm({ staffAdequacy })} options={staffOptions.map(([value, label]) => ({ value, label }))} /></label>
      </div>
      {form.staffAdequacy === '778000000' && <div className="flow-shortage-panel">
        <div className={`flow-popup-field${errors.shortage ? ' has-error' : ''}`}><span>Coverage shortage <span className="req-mark" aria-hidden="true">*</span></span><div className="bubble-row">{shortageOptions.map(([value, label]) => <button type="button" key={value} className={`shortage-bubble ${form.shortageTypes?.includes(value) ? 'active' : ''}`} onClick={() => toggleShortage(value)}>{label}</button>)}</div><FieldError message={errors.shortage} /></div>
        <label className={`flow-popup-field${errors.shortfall ? ' has-error' : ''}`}><span>Shortfall summary <span className="req-mark" aria-hidden="true">*</span></span><TextArea error={errors.shortfall} value={form.shortfallSummary} onChange={(e) => updateForm({ shortfallSummary: e.target.value })} placeholder="Describe the impact of the staff shortage..." /></label>
      </div>}
      <div className="flow-popup-section">Inbound</div>
      <div className="flow-popup-grid">
        <FlowNumber label="ER admissions" value={form.erAdmissions} readOnly onChange={(erAdmissions) => updateForm({ erAdmissions })} />
        <FlowNumber label="OPD admissions" value={form.opdAdmissions} readOnly onChange={(opdAdmissions) => updateForm({ opdAdmissions })} />
        <FlowNumber label="Total ER volume" value={form.erVolume} onChange={(erVolume) => updateForm({ erVolume })} />
      </div>
      <div className="flow-popup-section">Outbound</div>
      <div className="flow-popup-grid">
        <FlowNumber label="Planned discharges" value={form.plannedDischarges} readOnly onChange={() => undefined} />
        <FlowNumber label="Unplanned discharges" value={form.unplannedDischarges} onChange={(unplannedDischarges) => updateForm({ unplannedDischarges })} />
        <FlowNumber label="Total discharges" value={discharges} readOnly onChange={() => undefined} />
      </div>
      <div className="flow-popup-section">Theatre flow</div>
      <div className="flow-popup-grid">
        <FlowNumber label="Total cases" value={form.totalORCases} onChange={(totalORCases) => updateForm({ totalORCases })} />
        <FlowNumber label="Pre-op" value={form.preoperative} onChange={(preoperative) => updateForm({ preoperative })} />
        <FlowNumber label="Post-op" value={form.postoperative} onChange={(postoperative) => updateForm({ postoperative })} />
        <FlowNumber label="Postponed" value={form.postponedORCases} onChange={(postponedORCases) => updateForm({ postponedORCases })} />
        <FlowNumber label="Cancelled" value={form.cancelledORCases} onChange={(cancelledORCases) => updateForm({ cancelledORCases })} />
      </div>
      {form.shift === 'Night' && <>
        <div className="flow-popup-section">Unit utilization</div>
        <div className="flow-popup-grid">
          <FlowNumber label="Ward utilization" value={form.inpUtilization} onChange={(inpUtilization) => updateForm({ inpUtilization })} />
          <FlowNumber label="ICU utilization" value={form.icuUtilization} onChange={(icuUtilization) => updateForm({ icuUtilization })} />
          <FlowNumber label="CCU utilization" value={form.ccuUtilization} onChange={(ccuUtilization) => updateForm({ ccuUtilization })} />
          <FlowNumber label="PICU utilization" value={form.picuUtilization} onChange={(picuUtilization) => updateForm({ picuUtilization })} />
          <FlowNumber label="NICU utilization" value={form.nicuUtilization} onChange={(nicuUtilization) => updateForm({ nicuUtilization })} />
          <FlowNumber label="CPU utilization" value={form.cxUtilization} onChange={(cxUtilization) => updateForm({ cxUtilization })} />
          <FlowNumber label="Stroke utilization" value={form.strokeUtilization} onChange={(strokeUtilization) => updateForm({ strokeUtilization })} />
        </div>
      </>}
      </div>
      <div className="flow-popup-actions">
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={saveFlowContext}>Save context</button>
      </div>
    </div>
  </div>
}

function FlowNumber({ label, value, readOnly, onChange }: { label: string; value: number; readOnly?: boolean; onChange: (value: number) => void }) {
  return <label className={`flow-popup-field ${readOnly ? 'auto-field' : ''}`}><span>{label}{readOnly && <i>Auto</i>}</span><input type="number" min="0" readOnly={readOnly} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>
}

function RetentionPatientModal({ businessUnit, type, entry, setEntry, saveEntry, close }: any) {
  const area: PatientArea = type === 'ER' ? 'ER' : isKsaBusinessUnit(businessUnit) ? 'IPD_KSA' : 'IPD'
  const label = type === 'INP' ? 'inpatient' : type === 'ER' ? 'the ER' : 'closed cases'
  const validation = useSaveErrors((d: DamaEntry) => {
    const e: Record<string, string> = {}
    if (!d.pId || !d.patientName) e.patient = 'Search and select the patient.'
    if (!(d.damaType === type && d.reason.trim())) e.reason = 'Add the reason, context or retention notes.'
    return e
  }, entry)
  const errors = validation.errors
  return <div className="modal flow-popup-backdrop" role="dialog" aria-modal="true">
    <div className="flow-popup retention-popup">
      <div className="flow-popup-head">
        <div><h2>{entry.id ? 'Edit patient case' : 'Add patient case'}</h2><p>Record a patient case in {label} and update retention when it changes.</p></div>
        <button className="flow-popup-close" onClick={close} aria-label="Close">x</button>
      </div>
      <div className="flow-popup-stack">
        <PatientLookup key={area} area={area} label="Patient / MRN *" error={errors.patient} value={entry.damaType === type && entry.area === area ? entry.patientName : ''} onSelect={(p) => setEntry({ ...entry, damaType: type, area: p.area, patientName: p.name, patientCode: p.code, pId: p.id })} />
        <Field label="Retained"><PulseSelect ariaLabel="Retained" value={entry.retained ? 'Yes' : 'No'} onChange={(choice) => setEntry({ ...entry, damaType: type, retained: choice === 'Yes' })} options={[{ value: 'No', label: 'No - case only' }, { value: 'Yes', label: 'Yes - retained' }]} /></Field>
        <Field label="Case notes *" error={errors.reason}><TextArea value={entry.damaType === type ? entry.reason : ''} onChange={(e) => setEntry({ ...entry, damaType: type, reason: e.target.value })} placeholder="Reason, context or retention notes..." /></Field>
      </div>
      <div className="flow-popup-actions">
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={() => { if (validation.check()) saveEntry() }}>{entry.id ? 'Save changes' : 'Save patient'}</button>
      </div>
    </div>
  </div>
}

function NightDischargeCard({ form, earlyDischarges, status, dismissStatus, refresh, add, remove }: any) {
  const isMissing = useMissingItem()
  const validation = useContext(ValidationContext)
  const planMissing = validation.show && validation.missing.includes('Tomorrow Discharge Plan')
  return <section className={`early-discharge-card${planMissing ? ' has-missing' : ''}`} data-missing-item="Tomorrow Discharge Plan">
    <div className="flow-card-head">
      <div><h2>Tomorrow's discharges</h2><span><strong>{earlyDischarges.length}</strong> patients for {targetDischargeDate(form.reportDate) || 'tomorrow'}</span></div>
      <div className="night-flow-actions"><button className="btn small" onClick={refresh}>Refresh</button><button className="btn small primary" onClick={add}>Add patient</button></div>
    </div>
    {status && <div style={{ padding: '10px 18px 0' }} role="status"><span className="night-status-chip">{status}<button type="button" onClick={dismissStatus} aria-label="Dismiss discharge status" title="Dismiss" style={{ marginLeft: 10, padding: 0, border: 0, background: 'transparent', color: 'inherit', fontWeight: 900, cursor: 'pointer' }}>x</button></span></div>}
    <div className="early-discharge-list">
      {earlyDischarges.length === 0 ? <div className="early-discharge-empty"><strong>Build tomorrow's discharge list</strong><span>No patients are planned yet. Use Add patient above to add an inpatient as an early or planned discharge.</span></div> : earlyDischarges.map((row: EarlyDischarge, index: number) => <article className={`early-discharge-row${isMissing(`Discharge Patient ${index + 1}`) ? ' has-missing' : ''}`} data-missing-item={`Discharge Patient ${index + 1}`} key={row.id}>
        <div><strong>{row.name || 'Unnamed patient'}</strong><p>{row.code || 'No MRN'} - {row.reason || 'No reason recorded'}</p></div>
        <span className={`status-token ${row.type === 'Early' ? 'warning' : 'ok'}`}>{row.type}</span>
        <DeleteButton label="Delete discharge patient" onClick={() => remove(row)} />
      </article>)}
    </div>
  </section>
}

function NightUtilizationCard({ form }: any) {
  const utilization = [
    ['Ward', form.inpUtilization, '51 beds'],
    ['ICU', form.icuUtilization, '21 beds'],
    ['CCU', form.ccuUtilization, '6 beds'],
    ['PICU', form.picuUtilization, '2 beds'],
    ['NICU', form.nicuUtilization, '4 beds'],
    ['CPU', form.cxUtilization, '0 beds'],
    ['Stroke', form.strokeUtilization, '0 beds'],
  ]
  return <aside className="night-util-card">
    <div className="flow-card-head"><h2>Unit utilization</h2><span>Night review</span></div>
    <div className="night-util-grid">
      {utilization.map(([label, value, capacity]) => <div className="night-util-tile" key={String(label)}>
        <small>{label}</small>
        <b>{value}%</b>
        <span>{capacity}</span>
      </div>)}
    </div>
  </aside>
}

function EarlyDischargeModal({ save, close }: any) {
  const [draft, setDraft] = useState<{ type: EarlyDischarge['type'] | ''; patientCode: string; reason: string }>({ type: '', patientCode: '', reason: '' })
  const [patientLookup, setPatientLookup] = useState<{ state: 'idle' | 'searching' | 'found' | 'missing' | 'error'; patient?: any; message?: string }>({ state: 'idle' })
  useEffect(() => {
    const code = draft.patientCode.trim()
    if (code.length < 2) {
      setPatientLookup({ state: 'idle' })
      return
    }
    let cancelled = false
    setPatientLookup({ state: 'searching' })
    const timeout = window.setTimeout(async () => {
      try {
        const patient = await findInpatientByCodeViaXrm(code)
        if (cancelled) return
        setPatientLookup(patient ? { state: 'found', patient } : { state: 'missing', message: 'No patient was found in the Inpatient List for this code.' })
      } catch (error) {
        if (cancelled) return
        setPatientLookup({ state: 'error', message: error instanceof Error ? error.message : 'Could not validate this patient code.' })
      }
    }, 450)
    return () => { cancelled = true; window.clearTimeout(timeout) }
  }, [draft.patientCode])
  const validation = useSaveErrors((d: typeof draft) => {
    const e: Record<string, string> = {}
    if (!d.type) e.type = 'Select early or planned discharge.'
    if (!d.patientCode.trim()) e.patient = 'Enter the inpatient code or MRN.'
    else if (patientLookup.state === 'searching') e.patient = 'Still checking the Inpatient List, try again in a moment.'
    else if (patientLookup.state !== 'found') e.patient = patientLookup.message || 'Enter a valid inpatient code or MRN.'
    if (!d.reason.trim()) e.reason = 'Add the discharge planning notes.'
    return e
  }, draft)
  const errors = validation.errors
  return <div className="modal flow-popup-backdrop" role="dialog" aria-modal="true">
    <div className="flow-popup early-discharge-popup">
      <div className="flow-popup-head">
        <div><h2>Add discharge patient</h2><p>Add a patient to tomorrow early or planned discharge list.</p></div>
        <button className="flow-popup-close" onClick={close} aria-label="Close">x</button>
      </div>
      <div className="flow-popup-stack">
        <label className={`flow-popup-field${errors.type ? ' has-error' : ''}`}><span>Discharge type <span className="req-mark" aria-hidden="true">*</span></span><PulseSelect ariaLabel="Discharge type" placeholder="Select type" value={draft.type} onChange={(type) => setDraft({ ...draft, type: type as EarlyDischarge['type'] })} options={[{ value: 'Early', label: 'Early' }, { value: 'Planned', label: 'Planned' }]} /><FieldError message={errors.type} /></label>
        <label className={`flow-popup-field${errors.patient ? ' has-error' : ''}`}><span>Patient / MRN <span className="req-mark" aria-hidden="true">*</span></span><input value={draft.patientCode} onChange={(e) => setDraft({ ...draft, patientCode: e.target.value })} placeholder="Enter inpatient code or MRN" autoFocus /><FieldError message={errors.patient} /></label>
        {patientLookup.state === 'searching' && <div className="night-status-chip" role="status">Checking the Inpatient List...</div>}
        {patientLookup.state === 'found' && <div className="night-status-chip" role="status"><strong>{patientLookup.patient.and_patientname || 'Patient found'}</strong>&nbsp;-&nbsp;{patientLookup.patient.and_name || draft.patientCode.trim()}</div>}
        {(patientLookup.state === 'missing' || patientLookup.state === 'error') && <div className="night-status-chip" role="alert">{patientLookup.message}</div>}
        <label className={`flow-popup-field${errors.reason ? ' has-error' : ''}`}><span>Reason <span className="req-mark" aria-hidden="true">*</span></span><TextArea error={errors.reason} maxLength={300} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="Discharge planning notes..." /></label>
      </div>
      <div className="flow-popup-actions">
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={() => { if (validation.check()) save(draft) }}>Save patient</button>
      </div>
    </div>
  </div>
}

function OpsTab({ opsIssues, setOpsIssues }: any) {
  const isMissing = useMissingItem()
  const emptyOpsDraft = (): OpsIssue => ({ id: '', funcId: '', affectedId: '', issueId: '', statusId: '' as Resolution, desc: '', pendingDetails: '' })
  const [draft, setDraft] = useState<OpsIssue>(emptyOpsDraft)
  const [adding, setAdding] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const pendingOps = opsIssues.filter((o: OpsIssue) => o.statusId !== '778000001')
  const carriedOps = opsIssues.filter((o: OpsIssue) => String(o.id || '').startsWith('carry-ops-'))
  const pendingCarriedOps = carriedOps.filter((o: OpsIssue) => o.statusId !== '778000001')
  const validation = useSaveErrors((d: OpsIssue) => {
    const e: Record<string, string> = {}
    if (!d.funcId) e.funcId = 'Select the service functionality.'
    if (!d.affectedId) e.affectedId = 'Select the affected service.'
    if (!d.issueId) e.issueId = 'Select the type of issue.'
    if (!d.statusId) e.statusId = 'Select the resolution status.'
    if (!d.desc.trim()) e.desc = 'Describe the issue.'
    if (d.statusId && d.statusId !== '778000001' && !d.pendingDetails.trim()) e.pendingDetails = 'Add a summary or the pending details.'
    return e
  }, draft)
  const errors = validation.errors
  function resetOpsDraft() { setDraft(emptyOpsDraft()) }
  function closeOpsModal() { resetOpsDraft(); validation.reset(); setAdding(false) }
  function updateOpsIssue(issue: OpsIssue) { setDraft({ ...issue, funcId: issue.funcId === '778000002' ? '' : issue.funcId }); setAdding(true) }
  function save() {
    if (!validation.check()) return
    const item = { ...draft, id: draft.id || `ops-${Date.now()}` }
    setOpsIssues(draft.id ? opsIssues.map((issue: OpsIssue) => issue.id === draft.id ? item : issue) : [...opsIssues, item])
    closeOpsModal()
  }
  return <main className="workflow-page ops-page"><PageTitle step="05" eyebrow="Operations" title="Operations" subtitle="Shift-reported operational exceptions and accountable follow-up." action={<button className="btn primary" onClick={() => setAdding(true)}>Log operational exception</button>} /><section className="ops-summary"><div><small>Shift operations</small><b>{opsIssues.length ? 'Exceptions logged' : 'Clear this shift'}</b><p>{carriedOps.length ? `${carriedOps.length} carried over from previous shift` : opsIssues.length ? 'Operational interruptions recorded' : 'No operational interruptions logged'}</p></div><div><small>Open exceptions</small><b>{pendingOps.length}</b><p>Unresolved partial or total outages</p></div><div><small>Duty Manager attention</small><b>{pendingOps.length}</b><p>Pending exceptions requiring follow-up</p></div></section>
    {adding && <ModalShell title={draft.id ? 'Update Operations Outage' : 'Log Operations Outage'} tone="ops" onClose={closeOpsModal}><div className="grid report-grid two"><SelectField label="Service Functionality *" error={errors.funcId} value={draft.funcId} options={outageFunctionalityOptions} placeholder="Select" onChange={(funcId: string) => setDraft({ ...draft, funcId })} /><SelectField label="Service Affected *" error={errors.affectedId} value={draft.affectedId} options={serviceAffectedOptions} placeholder="Select" onChange={(affectedId: string) => setDraft({ ...draft, affectedId })} /><SelectField label="Type of Issue *" error={errors.issueId} value={draft.issueId} options={opsIssueOptions} placeholder="Select" onChange={(issueId: string) => setDraft({ ...draft, issueId })} /><SelectField label="Resolution Status *" error={errors.statusId} value={draft.statusId} options={resolutionOptions} placeholder="Select" onChange={(statusId: Resolution) => setDraft({ ...draft, statusId })} /></div><Field label="Description of Issue *" error={errors.desc}><TextArea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} /></Field>{draft.statusId && draft.statusId !== '778000001' && <Field label="Summary / Pending Details *" error={errors.pendingDetails}><TextArea value={draft.pendingDetails} onChange={(e) => setDraft({ ...draft, pendingDetails: e.target.value })} /></Field>}<div className="modal-actions"><button className="btn" onClick={closeOpsModal}>Cancel</button><button className="btn primary" onClick={save}>{draft.id ? 'Save Update' : 'Save Operations Outage'}</button></div></ModalShell>}
    <div className={`previous-placeholder ops-tone ${pendingCarriedOps.length ? 'has-carry' : ''}`}>{pendingCarriedOps.length ? `${pendingCarriedOps.length} pending operations outage${pendingCarriedOps.length === 1 ? '' : 's'} carried over from the previous shift. Update the item to resolve it.` : 'No pending operations outages carried over from previous shifts.'}</div>
    <div className="movement-head ops-timeline-head"><div><h2>Operational exception timeline</h2></div><p>Current-shift interruptions and accountable follow-up.</p></div>
    {opsIssues.length > 0 && <TimelineFilters label="Filter operational exceptions by status" options={statusFilters(opsIssues.map((o: OpsIssue) => o.statusId))} value={statusFilter} onChange={setStatusFilter} />}
    <section className="event-timeline ops-timeline">{opsIssues.length === 0 ? <Empty title="All systems fully functional" text="No active outages have been logged for this handover." /> : !opsIssues.some((o: OpsIssue) => statusFilter === 'all' || String(o.statusId) === statusFilter) ? <Empty title="No exceptions with this status" text="Choose another filter to see the rest of the timeline." /> : opsIssues.map((o: OpsIssue, index: number) => (statusFilter === 'all' || String(o.statusId) === statusFilter) && <article className={`timeline-row ops-timeline-row pulse-row${isMissing(`Ops Issue ${index + 1}`) ? ' has-missing' : ''}`} data-missing-item={`Ops Issue ${index + 1}`} key={o.id}>
      <time>{labelFor(serviceFunctionalityOptions, o.funcId)}</time>
      <span className={`timeline-dot ${o.statusId === '778000001' ? 'low' : 'warning'}`} title={labelFor(resolutionOptions, o.statusId)} />
      <div className="tl-body">
        <h3 className="tl-title">{labelFor(serviceAffectedOptions, o.affectedId)} - {labelFor(opsIssueOptions, o.issueId)}</h3>
        {String(o.id || '').startsWith('carry-ops-') && <div className="tl-sub">Carried over from previous shift</div>}
        <p className="tl-desc">{o.desc || 'No issue description recorded.'}</p>
        {o.statusId !== '778000001' && <TimelineField title="Pending details" text={o.pendingDetails} />}
      </div>
      <div className="row-actions compact"><button className="btn small" onClick={() => updateOpsIssue(o)}>Update</button><DeleteButton label="Delete operational exception" onClick={() => setOpsIssues(opsIssues.filter((x: OpsIssue) => x.id !== o.id))} /></div>
    </article>)}</section>
  </main>
}
function ExperienceTab({ form, updateForm }: any) {
  const hasFollowUp = Boolean(form.complaintsCount || form.ovrsCount || form.govVisit === 'Yes')
  return <main className="workflow-page experience-page">
    <PageTitle step="06" eyebrow="Experience" title="Experience" subtitle="Patient concerns, variance reports and regulatory follow-up for the current shift." />
    <section className="experience-summary"><div><small>Experience status</small><b>{hasFollowUp ? 'Active follow-up' : 'No active concerns'}</b><p>{hasFollowUp ? 'Experience items require documented follow-up.' : 'No unresolved patient or family experience issues logged.'}</p></div><div><small>Experience attention</small><b>{form.complaintsCount}</b><p>Escalated complaints</p></div><div><small>Governance signals</small><div className="metric-cluster"><b>{form.ovrsCount}<span>Escalated OVRs</span></b><b>{form.govVisit === 'Yes' ? 1 : 0}<span>Regulatory visits</span></b></div></div></section>
    <div className="movement-head experience-register-head"><div><h2>Experience and governance record</h2></div><p>Current-shift concerns, variance reports and authority activity.</p></div>
    <section className="experience-register">
      <ExperiencePanel title="Escalated complaints" subtitle="Patient dissatisfaction cases" state={form.complaintsCount ? `${form.complaintsCount} logged` : 'None logged'}><NumberField label="Number of Complaints *" value={form.complaintsCount} onChange={(complaintsCount: number) => updateForm({ complaintsCount })} />{form.complaintsCount > 0 && <Field label="Summary of Complaints *" required="Summary of Complaints"><TextArea value={form.complaintsSummary} onChange={(e) => updateForm({ complaintsSummary: e.target.value })} placeholder="Describe patient complaints clearly..." /></Field>}</ExperiencePanel>
      <ExperiencePanel title="Escalated OVRs" subtitle="Official variance reports" state={form.ovrsCount ? `${form.ovrsCount} logged` : 'None logged'}><NumberField label="Number of OVRs *" value={form.ovrsCount} onChange={(ovrsCount: number) => updateForm({ ovrsCount })} />{form.ovrsCount > 0 && <Field label="Summary of OVRs *" required="Summary of OVRs"><TextArea value={form.ovrsSummary} onChange={(e) => updateForm({ ovrsSummary: e.target.value })} placeholder="Describe incident / OVR details..." /></Field>}</ExperiencePanel>
      <ExperiencePanel title="Regulatory & Government" subtitle="Authority visits during shift" state={form.govVisit === 'Yes' ? 'Visit logged' : 'No visits'}><Field label="Government / Regulatory Visit"><PulseSelect ariaLabel="Government or regulatory visit" value={form.govVisit} onChange={(govVisit) => updateForm({ govVisit })} options={[{ value: 'No', label: 'No Visits' }, { value: 'Yes', label: 'Yes, Visited' }]} /></Field>{form.govVisit === 'Yes' && <Field label="Authority Name & Findings Summary *" required="Authority Name & Findings Summary"><TextArea value={form.govSummary} onChange={(e) => updateForm({ govSummary: e.target.value })} placeholder="Include authority name, purpose of visit, and findings..." /></Field>}</ExperiencePanel>
    </section>
  </main>
}
function SummaryTab({ form, updateForm, completion, pendingItems, submitReport, busy, setTab, showErrors, onSubmitAttempt }: any) {
  const carriedPending = pendingItems.filter((item: any) => String(item.id || '').startsWith('carry-'))
  const missing: string[] = completion.missing
  const [bannerOpen, setBannerOpen] = useState(true)
  const bannerRef = useRef<HTMLDivElement>(null)
  const finalReviewRef = useRef<HTMLElement>(null)
  const missingBySection = reportTabs.map(([code, label, key]) => ({ code, label, key, fields: missing.filter((field) => missingFieldTab(field) === key) }))

  function handleSubmit() {
    if (completion.ok) {
      submitReport()
      return
    }
    onSubmitAttempt()
    setBannerOpen(true)
    // The message renders just above the Submit button; nudge it into view if the page is short on space.
    window.setTimeout(() => bannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0)
  }

  return <main className="workflow-page summary-page">
    <PageTitle step="07" eyebrow="Handover Review" title="Summary" subtitle="Review readiness, unresolved responsibilities and transfer state before handover." />
    <section className="summary-hero">
      <div>
        <small>Handover readiness</small>
        <h2>{completion.ok ? 'Ready to submit' : 'Review required'}</h2>
        <p>Readiness follows required-field validation across the handover modules. Complete the review below before submitting.</p>
      </div>
      <div>
        <small>Final transfer action</small>
        <p>{completion.ok ? 'All required fields are complete.' : `${missing.length} required ${missing.length === 1 ? 'field is' : 'fields are'} still missing across the handover pages.`}</p>
        <strong className="summary-action-note">{completion.ok ? 'Ready for final transfer.' : 'Submit is at the end of this page.'}</strong>
      </div>
    </section>
    <section className="summary-readiness">
      <div className="summary-card-head"><h2>Section readiness</h2><span>Required-field review across the handover</span></div>
      <div className="readiness-grid">
        {missingBySection.map((section) => <div className={`ready-line ${section.fields.length ? 'is-missing' : 'is-complete'}`} key={section.key}><span>{section.code} - {section.label}</span>{section.fields.length ? <button type="button" className="ready-line-link" onClick={() => setTab(section.key)}>{section.fields.length} missing - fix</button> : <b>Complete</b>}</div>)}
      </div>
    </section>
    <div className="summary-main-grid">
      <section className="card final-review" style={{ paddingBottom: 20 }} ref={finalReviewRef}>
        <div className="section-header"><h2>Final review</h2><span>Current shift handover</span></div>
        <Field label="Final handover note - Hot issues during shift *" required="Hot Issues Summary"><TextArea value={form.hotIssues} onChange={(e) => updateForm({ hotIssues: e.target.value })} /></Field>
        <p className="field-help">Capture only issues requiring incoming Duty Manager awareness.</p>
        {form.shift === 'Night' && <div className="grid night-summary-fields"><Field label="Night Medical Meeting"><PulseSelect ariaLabel="Night medical meeting" value={form.nightMedicalMeeting} onChange={(nightMedicalMeeting) => updateForm({ nightMedicalMeeting })} options={[{ value: '778000000', label: 'Done' }, { value: '778000001', label: 'Not Done' }]} /></Field><Field label="Meeting Summary" required="Night Meeting Summary"><TextArea value={form.nightSummary} onChange={(e) => updateForm({ nightSummary: e.target.value })} /></Field></div>}
      </section>
      <aside className="transfer-state"><div className="transfer-head"><h2>Final transfer state</h2><span>Outgoing handover</span></div><div><span>Report state</span><b>{completion.ok ? 'Ready' : 'Review required'}</b></div><div><span>Submission</span><b>Not submitted</b></div><div><span>Incoming responsibility</span><b>Pending assignment</b></div><div><span>Acknowledgment</span><b>Not yet acknowledged</b></div></aside>
    </div>
    <section className="summary-carry-card">
      <div className="summary-card-head"><h2>Pending issues from previous shifts</h2><span>Carry-over register</span></div>
      <div className="summary-carry-list">
        {carriedPending.length === 0 ? <div className="summary-carry-empty"><strong>No responsibilities carried forward</strong><p>No pending items from previous shifts are assigned to this handover.</p></div> : carriedPending.map((item: any) => <div className="summary-carry-item" key={item.id}><div><strong>{item.catLabel || item.desc || 'Carried responsibility'}</strong><p>From {carryIssueOrigin(item)}</p></div><span>{labelFor(resolutionOptions, item.status || item.statusId)}</span></div>)}
      </div>
    </section>
    {showErrors && bannerOpen && missing.length > 0 && <div className="page-missing-banner summary-missing-banner" role="alert" ref={bannerRef}>
      <div className="summary-missing-body">
        <strong>{missing.length} required {missing.length === 1 ? 'field is' : 'fields are'} missing. Complete them before submitting.</strong>
        {missingBySection.filter((section) => section.fields.length).map((section) => <div className="summary-missing-group" key={section.key}>
          <span>{section.code} - {section.label}</span>
          <div className="missing-chip-list">{section.fields.map((field) => <b key={field}>{field}</b>)}</div>
          <button type="button" className="btn small" onClick={() => setTab(section.key)}>Go to page</button>
        </div>)}
        {missing.some((field) => missingFieldTab(field) === 'summary') && <div className="summary-missing-group">
          <span>07 - Summary (this page)</span>
          <div className="missing-chip-list">{missing.filter((field) => missingFieldTab(field) === 'summary').map((field) => <b key={field}>{field}</b>)}</div>
          <button type="button" className="btn small" onClick={() => finalReviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Show field</button>
        </div>}
      </div>
      <button type="button" className="summary-missing-close" aria-label="Close" onClick={() => setBannerOpen(false)}>x</button>
    </div>}
    <section className="summary-submit-bar">
      <div><small>Final transfer action</small><p>{completion.ok ? 'All required fields are complete. Ready for final transfer.' : `${missing.length} required ${missing.length === 1 ? 'field' : 'fields'} to complete before submission.`}</p></div>
      <button className="btn primary summary-submit-btn" disabled={busy} onClick={handleSubmit}>{busy ? 'Submitting...' : 'Submit Shift Report'}</button>
    </section>
  </main>
}
function carryIssueOrigin(item: any) {
  if (String(item.id || '').startsWith('carry-admin-')) return `Administrative issues - ${item.catLabel || 'Operational constraint'}`
  if (String(item.id || '').startsWith('carry-ops-')) return `Operations - ${labelFor(serviceAffectedOptions, item.affectedId)} / ${labelFor(opsIssueOptions, item.issueId)}`
  return item.catLabel ? `Administrative issues - ${item.catLabel}` : 'Previous-shift issue'
}
function isKsaBusinessUnit(businessUnit?: string) {
  return labelFor(businessUnits, businessUnit || '') === 'AHJ'
}

function patientAreaOptions(businessUnit?: string): [PatientArea, string][] {
  return isKsaBusinessUnit(businessUnit)
    ? [['ER', 'ER'], ['OPD_KSA', 'OPD KSA'], ['IPD_KSA', 'IPD KSA']]
    : [['OPD_EG', 'OPD EG'], ['IPD', 'IPD EG']]
}

function eventAreaOptions(typeText?: string, businessUnit?: string): [PatientArea, string][] {
  if (typeText === 'ER Code') return [['ER', 'ER']]
  if (typeText === 'Hospital Code') return isKsaBusinessUnit(businessUnit) ? [['IPD_KSA', 'IPD KSA']] : [['IPD', 'IPD EG']]
  return patientAreaOptions(businessUnit)
}
function ModalShell({ title, tone, onClose, children }: any) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])
  const parts = Children.toArray(children)
  const footerIndex = parts.findIndex((child) => isValidElement<{ className?: string }>(child) && child.props.className === 'modal-actions')
  const footer = footerIndex >= 0 ? parts[footerIndex] : null
  const body = footerIndex >= 0 ? parts.filter((_, index) => index !== footerIndex) : parts
  return <div className="modal" role="dialog" aria-modal="true"><div className={`modal-content form-modal tone-${tone || 'default'}`}><div className="modal-title-row"><h3>{title}</h3><button className="icon-close" onClick={onClose} aria-label="Close">x</button></div><div className="form-modal-body">{body}</div>{footer}</div></div>
}
function ExperiencePanel({ title, subtitle, state, children }: any) { return <section className="experience-card"><div className="experience-head"><div><h3>{title}</h3><small>{subtitle}</small></div>{state && <span className="experience-state">{state}</span>}</div><div className="experience-body">{children}</div></section> }
function SeverityBubbles({ value, onChange }: { value: Severity; onChange: (value: Severity) => void }) {
  return <Field label="Severity Level *"><div className="severity-bubbles">{severityOptions.map(([optionValue, optionLabel]) => <button key={optionValue} className={`severity-bubble ${severityClass(optionValue)} ${String(value) === String(optionValue) ? 'active' : ''}`} onClick={() => onChange(optionValue as Severity)}>{optionLabel}</button>)}</div></Field>
}

function severityClass(value: string | number) {
  if (String(value) === '778000002') return 'major'
  if (String(value) === '778000001') return 'moderate'
  return 'low'
}

function PatientLookup({ area, label, value, error, onSelect }: { area: PatientArea; label: string; value: string; error?: string; onSelect: (patient: { id: string; name: string; code: string; area: PatientArea }) => void }) {
  const [query, setQuery] = useState(value || '')
  const [matches, setMatches] = useState<any[]>([])

  useEffect(() => { setQuery(value || '') }, [value])

  async function change(next: string) {
    setQuery(next)
    setMatches(await searchPatients(area, next))
  }

  return <Field label={label} error={error}><div className="lookup-wrap"><input value={query} placeholder="Search by Name or MRN..." onChange={(e) => change(e.target.value)} onBlur={() => setTimeout(() => setMatches([]), 150)} />{matches.length > 0 && <div className="lookup-results">{matches.map((p) => <button className="lookup-item" key={p.id} onClick={() => { onSelect(p); setQuery(`${p.name}${p.code ? ` (${p.code})` : ''}`); setMatches([]) }}>{p.name || 'Unnamed Patient'} {p.code ? `- ${p.code}` : ''}</button>)}</div>}</div></Field>
}
function Submitted({ form, events, opsIssues, pendingItems, openReport, downloadPdf, goHome }: any) {
  const majorEvents = events.filter((e: EventItem) => e.severity === '778000002')
  const outageNotice = opsIssues.some((o: OpsIssue) => ['778000000', '778000004'].includes(o.affectedId))
  return <main className="workflow-page submitted-page">
    <PageTitle step="08" eyebrow="Transfer Complete" title={`${form.shift} shift report submitted`} subtitle={`${labelFor(businessUnits, form.businessUnit)} - ${formatDate(form.reportDate)} - ${reportCode(form)}`} />
    <section className="submitted-hero">
      <div className="submitted-confirmation">
        <div className="submitted-check" aria-hidden="true">✓</div>
        <div>
          <small>Submission complete</small>
          <h2>Report sent for incoming acknowledgment</h2>
          <p>The outgoing handover has been submitted through the existing Duty Manager flow. No more data entry is required for this report.</p>
          <span className="submitted-receipt">Submitted report code: {reportCode(form)}</span>
        </div>
      </div>
      <div className="submitted-actions">
        <button className="btn primary" onClick={openReport}>View full report</button>
        <button className="btn" onClick={downloadPdf}>Download PDF</button>
        <button className="btn" onClick={goHome}>Home</button>
      </div>
    </section>

    <section className="submitted-grid">
      <div className="submitted-summary">
        <div><small>Hospital events</small><b>{events.length}</b></div>
        <div><small>Operations outages</small><b>{opsIssues.length}</b></div>
        <div><small>Pending issues</small><b>{pendingItems.length}</b></div>
      </div>
      <aside className="transfer-state submitted-state">
        <h2>Final transfer state</h2>
        <div><span>Report state</span><b>Submitted</b></div>
        <div><span>Incoming responsibility</span><b>Pending acknowledgment</b></div>
        <div><span>Report code</span><b>{reportCode(form)}</b></div>
      </aside>
    </section>

    <section className="submitted-notifications">
      <div className="section-header"><div><h2>Notifications</h2><p>Routing generated by the existing handover submission rules.</p></div></div>
      <div className="notification-list">
        <span>Incoming DM - report ready</span>
        {majorEvents.map((e: EventItem) => <span key={e.id}>Medical Director - {e.codeText} major event</span>)}
        {outageNotice && <span>Biomedical - Lab/Radiology outage</span>}
      </div>
    </section>
  </main>
}

// Generates the document PDF (see reportPdf.ts). `auto` downloads once the report has finished loading.
function DownloadPdfButton({ bundle, auto, onAutoDone }: { bundle: ReportBundle; auto?: boolean; onAutoDone?: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  async function download() {
    setState('busy')
    try {
      await downloadReportPdf(buildReportPdf(bundle))
      setState('idle')
    } catch (error) {
      console.error('PDF generation failed', error)
      setState('failed')
    }
  }
  useEffect(() => {
    if (!auto || bundle.loading) return
    onAutoDone?.()
    download()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, bundle.loading])
  return <button className="btn" disabled={state === 'busy' || bundle.loading} onClick={download}>
    {state === 'busy' ? 'Preparing PDF...' : state === 'failed' ? 'PDF failed - try again' : 'Download PDF'}
  </button>
}

function ReportModal({ bundle, close, acknowledge, autoDownload, onAutoDownloaded }: any) {
  const r = bundle.report || {}
  const flow = bundle.flow?.[0] || {}
  const flowEntries = bundle.flowEntries || []
  const reportShift = shiftFromValue(r.dma_shifttype)
  const isNightReport = reportShift === 'Night'
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])
  return <div className="modal report-modal-backdrop"><div className="modal-content wide report-modal">
    <header className="report-modal-head">
      <div>
        <div className="eyebrow">Submitted handover report</div>
        <h2>{r.dma_name || 'Shift Report'}</h2>
        <p>{labelFor(businessUnits, r.dma_businessunit)} - {reportShift} - {formatDate(r.dma_reportdate)}</p>
      </div>
      <div className="report-print-meta" aria-label="Report details">
        <span><small>Business unit</small><b>{labelFor(businessUnits, r.dma_businessunit)}</b></span>
        <span><small>Shift</small><b>{reportShift}</b></span>
        <span><small>Report date</small><b>{formatDate(r.dma_reportdate)}</b></span>
        <span><small>Duty manager</small><b>{displayName(r)}</b></span>
        <span><small>Report state</small><b>{r.dma_dmacknowledgmenttimestamp ? 'Acknowledged' : 'Submitted'}</b></span>
        <span><small>Acknowledgment</small><b>{r.dma_dmacknowledgmenttimestamp ? formatDate(r.dma_dmacknowledgmenttimestamp) : 'Pending'}</b></span>
      </div>
      <aside className="transfer-state report-transfer report-transfer-head">
        <h2>Transfer state</h2>
        <div><span>Report state</span><b>{r.dma_dmacknowledgmenttimestamp ? 'Acknowledged' : 'Submitted'}</b></div>
        <div><span>Acknowledgment</span><b>{r.dma_dmacknowledgmenttimestamp ? formatDate(r.dma_dmacknowledgmenttimestamp) : 'Pending'}</b></div>
        <div><span>Duty Manager</span><b>{displayName(r)}</b></div>
      </aside>
      <button className="icon-close report-close" onClick={close} aria-label="Close">x</button>
    </header>

    <div className="report-modal-scroll">
    <section className="report-modal-summary">
      <div><small>Patient flow</small><b>{bundle.flow.length}</b></div>
      <div><small>Hospital events</small><b>{bundle.events.length}</b></div>
      <div><small>Administrative</small><b>{bundle.admin.length}</b></div>
      <div><small>Operations</small><b>{bundle.ops.length}</b></div>
      <div><small>Experience</small><b>{bundle.experience.length}</b></div>
    </section>
    {bundle.loading && <div className="report-loading">Loading full report details...</div>}

    <section className="report-modal-body">
      <div className="report-modal-main">
        <section className="report-surface">
          <div className="surface-head"><h3>Executive summary</h3><p>Outgoing handover note</p></div>
          <p className="executive-note">{r.dma_hotissues || 'No hot issues recorded.'}</p>
        </section>

        <section className="report-surface">
          <div className="surface-head"><h3>Patient flow</h3><p>{bundle.flow.length} summary records attached</p></div>
          {/* Grouped the same way as the Update patient flow popup, so related values read together. */}
          {bundle.flow.length === 0 ? <Empty title="No patient flow summary" text="No patient flow summary is attached to this handover." /> : <div className="report-flow-groups">
            <ReportGroup title="Staff coverage">
              <ReportMetric label="Staff coverage" value={formattedChoice(flow, 'dma_staffadequacy', staffOptions, 'Not recorded')} />
              <ReportMetric label="Shortfall summary" value={flow.dma_shortfallsummary || 'None'} wide />
            </ReportGroup>
            <ReportGroup title="Inbound">
              <ReportMetric label="ER admissions" value={flow.dma_eradmissions ?? 0} />
              <ReportMetric label="OPD admissions" value={flow.dma_opdadmissions ?? 0} />
              <ReportMetric label="Total admissions" value={flow.dma_admissions ?? 0} />
              <ReportMetric label="Total ER volume" value={<>{flow.dma_ervolume ?? 0} <a className="er-dashboard-link" href="https://app.powerbi.com/singleSignOn?experience=power-bi&ru=https%3A%2F%2Fapp.powerbi.com%2Fgroups%2F3f5475b1-b4ad-4bcd-8909-7c94862de69c%2Freports%2Fde88cd1b-5c29-4599-a594-57de388f3015%2Fb2d5c8b0b26932ebac9b%3Fexperience%3Dpower-bi%26noSignUpCheck%3D1" target="_blank" rel="noreferrer">↗ View</a></>} />
            </ReportGroup>
            <ReportGroup title="Outbound">
              <ReportMetric label="Planned discharges" value={flow.dma_planneddischarges ?? 0} />
              <ReportMetric label="Unplanned discharges" value={flow.dma_unplanneddischarges ?? 0} />
              <ReportMetric label="Total discharges" value={flow.dma_discharges ?? 0} />
            </ReportGroup>
            <ReportGroup title="Theatre flow">
              <ReportMetric label="Total OR cases" value={flow.dma_totalorcases ?? 0} />
              <ReportMetric label="Pre-op" value={flow.dma_preoperative ?? 0} />
              <ReportMetric label="Post-op" value={flow.dma_postoperative ?? 0} />
              <ReportMetric label="Postponed" value={flow.dma_postponedorcases ?? 0} />
              <ReportMetric label="Cancelled" value={flow.dma_cancelledorcases ?? 0} />
            </ReportGroup>
            <ReportGroup title="DAMA / retention">
              <ReportMetric label="ER cases / retained" value={`${flow.dma_erdama ?? 0} / ${flow.dma_erdamaretention ?? 0}`} />
              <ReportMetric label="Inpatient cases / retained" value={`${flow.dma_inpdama ?? 0} / ${flow.dma_inpdamaretention ?? 0}`} />
              <ReportMetric label="Closed cases / retained" value={`${flow.dma_closeddama ?? 0} / ${flow.dma_closeddamaretention ?? 0}`} />
            </ReportGroup>
            {isNightReport && <ReportGroup title="Unit utilization">
              <ReportMetric label="Ward (INP)" value={`${flow.dma_inputilization ?? 0}%`} />
              <ReportMetric label="ICU" value={`${flow.dma_icuutilization ?? 0}%`} />
              <ReportMetric label="CCU" value={`${flow.dma_ccuutilization ?? 0}%`} />
              <ReportMetric label="PICU" value={`${flow.dma_picuutilization ?? 0}%`} />
              <ReportMetric label="NICU" value={`${flow.dma_nicuutilization ?? 0}%`} />
              <ReportMetric label="Stroke" value={`${flow.dma_strokeutilization ?? 0}%`} />
            </ReportGroup>}
            <ReportGroup title="Narratives">
              <ReportMetric label="Delayed discharges" value={flow.dma_delayeddischargesnarrative || 'None'} wide />
              <ReportMetric label="Prolonged ER stays" value={flow.dma_prolongedernarrative || 'None'} wide />
            </ReportGroup>
          </div>}
          {flowEntries.length > 0 && <div className="report-record-list nested"><div className="surface-subhead">DAMA / retention entries</div>{flowEntries.map((entry: any, index: number) => <article className="report-record" key={entry.dma_patientflowentryid || index}><div><strong>{entry.dma_name || entry.dma_erpatientname || entry.dma_ipdpatientsname || 'Patient flow entry'}</strong><p>{entry.dma_reason || 'No reason recorded.'} {entry.dma_actiontaken ? `Action: ${entry.dma_actiontaken}` : ''}</p></div><span className="status-token info">{entry.dma_erdama ? 'ER DAMA' : entry.dma_inpdama ? 'INP DAMA' : 'Flow entry'}</span></article>)}</div>}
        </section>

        {isNightReport && <section className="report-surface">
          <div className="surface-head"><h3>Night shift review</h3><p>Night-only handover fields</p></div>
          <div className="report-detail-grid night-report-grid">
            <ReportMetric label="Night medical meeting" value={reportChoiceLabel([['778000000', 'Done'], ['778000001', 'Not done']], r.dma_nightmedicalmeeting, 'Not recorded')} />
            <ReportMetric label="Meeting summary" value={r.dma_nightmedicalmeetingsummary || 'None'} wide />
          </div>
        </section>}

        <section className="report-surface">
          <div className="surface-head"><h3>Hospital events</h3><p>{bundle.events.length} records attached</p></div>
          {bundle.events.length === 0 ? <Empty title="No events logged" text="No hospital events are attached to this handover." /> : <div className="report-record-list">{bundle.events.map((e: any, index: number) => <article className="report-record" key={e.dma_hospitaleventid || index}><div><strong>{e.dma_name || e.dma_eventtypename || 'Hospital Event'}</strong><p><b>Description:</b> {e.dma_incidentdescription || 'Not recorded'}<br /><b>Immediate action:</b> {e.dma_immediateactionstaken || 'Not recorded'}<br /><b>Time:</b> {formatDate(e.dma_eventlogtimestamp || e.dma_eventtime)}</p></div><span className="status-token warning">{formattedChoice(e, 'dma_severitylevel', severityOptions, 'Logged')}</span></article>)}</div>}
        </section>

        <section className="report-surface">
          <div className="surface-head"><h3>Administrative issues</h3><p>{bundle.admin.length} records attached</p></div>
          {bundle.admin.length === 0 ? <Empty title="No administrative issues logged" text="No administrative issue entries are attached to this handover." /> : <div className="report-record-list">{bundle.admin.map((x: any, index: number) => <article className="report-record" key={x.dma_administrativeissueentryid || index}><div><strong>{x.dma_IssueID?.dma_name || x.dma_issueidname || x.dma_name || 'Administrative issue'}</strong><p><b>Description:</b> {x.dma_description || 'Not recorded'}<br /><b>Action taken:</b> {x.dma_actiontaken || 'Not recorded'}<br /><b>Pending details:</b> {x.dma_pendingissues || 'None'}</p></div><span className="status-token critical">{formattedChoice(x, 'dma_resolutionstatus', resolutionOptions, 'Pending')}</span></article>)}</div>}
        </section>

        <section className="report-surface">
          <div className="surface-head"><h3>Operations</h3><p>{bundle.ops.length} records attached</p></div>
          {bundle.ops.length === 0 ? <Empty title="No operations outages logged" text="No operations outage records are attached to this handover." /> : <div className="report-record-list">{bundle.ops.map((x: any, index: number) => <article className="report-record" key={x.dma_opeartionid || index}><div><strong>{x.dma_name || `${formattedChoice(x, 'dma_serviceaffected', serviceAffectedOptions, 'Service')} - ${formattedChoice(x, 'dma_typeofissue', opsIssueOptions, 'Issue')}`}</strong><p><b>Functionality:</b> {formattedChoice(x, 'dma_servicefunctionality', serviceFunctionalityOptions, 'Not recorded')}<br /><b>Service affected:</b> {formattedChoice(x, 'dma_serviceaffected', serviceAffectedOptions, 'Not recorded')}<br /><b>Issue type:</b> {formattedChoice(x, 'dma_typeofissue', opsIssueOptions, 'Not recorded')}<br /><b>Description:</b> {x.dma_descriptionofissue || 'Not recorded'}<br /><b>Pending details:</b> {x.dma_pendingissues || 'None'}</p></div><span className="status-token critical">{formattedChoice(x, 'dma_resolutionstatus', resolutionOptions, 'Pending')}</span></article>)}</div>}
        </section>

        <section className="report-surface">
          <div className="surface-head"><h3>Experience</h3><p>{bundle.experience.length} records attached</p></div>
          {bundle.experience.length === 0 ? <Empty title="No experience records logged" text="No patient experience or governance records are attached to this handover." /> : <div className="report-detail-grid experience-report-grid">{bundle.experience.map((x: any, index: number) => <Fragment key={x.dma_patientexperienceid || index}><ReportMetric label="Escalated complaints" value={x.dma_escalatedcomplaints ?? 0} /><ReportMetric label="Escalated OVRs" value={x.dma_escalatedovrs ?? 0} /><ReportMetric label="Government / regulatory visits" value={formattedChoice(x, 'dma_governmentalregulatoryvisits', governmentVisitOptions, 'No')} /><ReportMetric label="Complaint summary" value={x.dma_summaryofnewongoingcomplaints || 'None'} wide /><ReportMetric label="OVR summary" value={x.dma_summaryofnewovrs || 'None'} wide /><ReportMetric label="Authority findings" value={x.dma_authoritynamefindingssummary || 'None'} wide /></Fragment>)}</div>}
        </section>
      </div>

    </section>
    </div>

    <footer className="report-modal-actions">
      <button className="btn primary" onClick={acknowledge} disabled={Boolean(r.dma_dmacknowledgmenttimestamp)}>{r.dma_dmacknowledgmenttimestamp ? 'Acknowledged' : 'Acknowledge'}</button>
      <DownloadPdfButton bundle={bundle} auto={autoDownload} onAutoDone={onAutoDownloaded} />
      <button className="btn" onClick={close}>Close</button>
    </footer>
  </div></div>
}

// Document-style content for the downloaded PDF: plain labels and values only (no app buttons such as "View").
function buildReportPdf(bundle: ReportBundle): PdfReport {
  const r = bundle.report || {}
  const flow = bundle.flow?.[0] || {}
  const shift = shiftFromValue(r.dma_shifttype)
  const isNight = shift === 'Night'
  const bu = labelFor(businessUnits, r.dma_businessunit)
  const name = r.dma_name || 'Shift Report'
  const text = (value: unknown, fallback = 'None') => { const s = String(value ?? '').trim(); return s || fallback }
  const num = (value: unknown) => String(value ?? 0)
  const acknowledged = r.dma_dmacknowledgmenttimestamp ? formatDate(r.dma_dmacknowledgmenttimestamp) : 'Pending'

  // Same groups as the report viewer and the Update patient flow popup.
  const flowGroups: { heading: string; fields: PdfField[] }[] = bundle.flow.length ? [
    { heading: 'Staff coverage', fields: [['Staff coverage', formattedChoice(flow, 'dma_staffadequacy', staffOptions, 'Not recorded')], ['Shortfall summary', text(flow.dma_shortfallsummary)]] },
    { heading: 'Inbound', fields: [['ER admissions', num(flow.dma_eradmissions)], ['OPD admissions', num(flow.dma_opdadmissions)], ['Total admissions', num(flow.dma_admissions)], ['Total ER volume', num(flow.dma_ervolume)]] },
    { heading: 'Outbound', fields: [['Planned discharges', num(flow.dma_planneddischarges)], ['Unplanned discharges', num(flow.dma_unplanneddischarges)], ['Total discharges', num(flow.dma_discharges)]] },
    { heading: 'Theatre flow', fields: [['Total OR cases', num(flow.dma_totalorcases)], ['Pre-op', num(flow.dma_preoperative)], ['Post-op', num(flow.dma_postoperative)], ['Postponed', num(flow.dma_postponedorcases)], ['Cancelled', num(flow.dma_cancelledorcases)]] },
    { heading: 'DAMA / retention', fields: [['ER cases / retained', `${num(flow.dma_erdama)} / ${num(flow.dma_erdamaretention)}`], ['Inpatient cases / retained', `${num(flow.dma_inpdama)} / ${num(flow.dma_inpdamaretention)}`], ['Closed cases / retained', `${num(flow.dma_closeddama)} / ${num(flow.dma_closeddamaretention)}`]] },
    ...(isNight ? [{ heading: 'Unit utilization', fields: [['Ward (INP)', `${num(flow.dma_inputilization)}%`], ['ICU', `${num(flow.dma_icuutilization)}%`], ['CCU', `${num(flow.dma_ccuutilization)}%`], ['PICU', `${num(flow.dma_picuutilization)}%`], ['NICU', `${num(flow.dma_nicuutilization)}%`], ['Stroke', `${num(flow.dma_strokeutilization)}%`]] as PdfField[] }] : []),
    { heading: 'Narratives', fields: [['Delayed discharges', text(flow.dma_delayeddischargesnarrative)], ['Prolonged ER stays', text(flow.dma_prolongedernarrative)]] },
  ] : []

  const sections: PdfSection[] = [
    { heading: 'Executive summary', note: 'Outgoing handover note', text: text(r.dma_hotissues, 'No hot issues recorded.') },
    bundle.flow.length
      ? { heading: 'Patient flow', note: `${bundle.flow.length} summary record${bundle.flow.length === 1 ? '' : 's'}`, groups: flowGroups }
      : { heading: 'Patient flow', records: [], empty: 'No patient flow summary is attached to this handover.' },
  ]
  if (bundle.flowEntries.length) sections.push({
    heading: 'DAMA / retention cases', note: `${bundle.flowEntries.length} record${bundle.flowEntries.length === 1 ? '' : 's'}`,
    records: bundle.flowEntries.map((entry: any) => ({
      title: entry.dma_name || entry.dma_erpatientname || entry.dma_ipdpatientsname || 'Patient case',
      badge: entry.dma_erdama ? 'ER DAMA' : entry.dma_inpdama ? 'Inpatient DAMA' : 'Case',
      fields: [['Reason', text(entry.dma_reason, 'Not recorded')], ['Action taken', text(entry.dma_actiontaken, 'Not recorded')]],
    })),
  })
  if (isNight) sections.push({
    heading: 'Night shift review',
    fields: [
      ['Night medical meeting', reportChoiceLabel([['778000000', 'Done'], ['778000001', 'Not done']], r.dma_nightmedicalmeeting, 'Not recorded')],
      ['Meeting summary', text(r.dma_nightmedicalmeetingsummary)],
    ],
  })
  sections.push(
    {
      heading: 'Hospital events', note: `${bundle.events.length} record${bundle.events.length === 1 ? '' : 's'}`, empty: 'No hospital events are attached to this handover.',
      records: bundle.events.map((e: any) => ({
        title: e.dma_name || e.dma_eventtypename || 'Hospital event',
        badge: formattedChoice(e, 'dma_severitylevel', severityOptions, ''),
        fields: [['Time', formatDate(e.dma_eventlogtimestamp || e.dma_eventtime)], ['Description', text(e.dma_incidentdescription, 'Not recorded')], ['Immediate action', text(e.dma_immediateactionstaken, 'Not recorded')]],
      })),
    },
    {
      heading: 'Administrative issues', note: `${bundle.admin.length} record${bundle.admin.length === 1 ? '' : 's'}`, empty: 'No administrative issues are attached to this handover.',
      records: bundle.admin.map((x: any) => ({
        title: x.dma_IssueID?.dma_name || x.dma_issueidname || x.dma_name || 'Administrative issue',
        badge: formattedChoice(x, 'dma_resolutionstatus', resolutionOptions, ''),
        fields: [['Description', text(x.dma_description, 'Not recorded')], ['Action taken', text(x.dma_actiontaken, 'Not recorded')], ['Pending details', text(x.dma_pendingissues)]],
      })),
    },
    {
      heading: 'Operations', note: `${bundle.ops.length} record${bundle.ops.length === 1 ? '' : 's'}`, empty: 'No operations outages are attached to this handover.',
      records: bundle.ops.map((x: any) => ({
        title: x.dma_name || `${formattedChoice(x, 'dma_serviceaffected', serviceAffectedOptions, 'Service')} - ${formattedChoice(x, 'dma_typeofissue', opsIssueOptions, 'Issue')}`,
        badge: formattedChoice(x, 'dma_resolutionstatus', resolutionOptions, ''),
        fields: [
          ['Functionality', formattedChoice(x, 'dma_servicefunctionality', serviceFunctionalityOptions, 'Not recorded')],
          ['Service affected', formattedChoice(x, 'dma_serviceaffected', serviceAffectedOptions, 'Not recorded')],
          ['Issue type', formattedChoice(x, 'dma_typeofissue', opsIssueOptions, 'Not recorded')],
          ['Description', text(x.dma_descriptionofissue, 'Not recorded')],
          ['Pending details', text(x.dma_pendingissues)],
        ],
      })),
    },
  )
  const experience = bundle.experience[0]
  sections.push(experience ? {
    heading: 'Patient experience',
    fields: [
      ['Escalated complaints', num(experience.dma_escalatedcomplaints)],
      ['Escalated OVRs', num(experience.dma_escalatedovrs)],
      ['Government / regulatory visits', formattedChoice(experience, 'dma_governmentalregulatoryvisits', governmentVisitOptions, 'No')],
      ['Complaint summary', text(experience.dma_summaryofnewongoingcomplaints)],
      ['OVR summary', text(experience.dma_summaryofnewovrs)],
      ['Authority findings', text(experience.dma_authoritynamefindingssummary)],
    ],
  } : { heading: 'Patient experience', records: [], empty: 'No patient experience records are attached to this handover.' })

  return {
    // File name: the report's own name, safe for Windows paths.
    fileName: `${name} - Handover Report`.replace(/[\\/:*?"<>|]+/g, '-'),
    title: name,
    subtitle: `${bu} · ${shift} shift · ${formatDate(r.dma_reportdate)}`,
    meta: [
      ['Business unit', bu], ['Shift', shift],
      ['Report date', formatDate(r.dma_reportdate)], ['Duty manager', displayName(r)],
      ['Report state', r.dma_dmacknowledgmenttimestamp ? 'Acknowledged' : 'Submitted'], ['Acknowledged', acknowledged],
    ],
    counts: [
      ['Hospital events', String(bundle.events.length)], ['Administrative issues', String(bundle.admin.length)],
      ['Operations', String(bundle.ops.length)], ['DAMA cases', String(bundle.flowEntries.length)],
    ],
    sections,
  }
}

// A titled cluster of related report values (e.g. "Inbound", "Theatre flow").
function ReportGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="report-group">
    <h4>{title}</h4>
    <div className="report-group-grid">{children}</div>
  </section>
}

function ReportMetric({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return <div className={`report-metric ${wide ? 'wide' : ''}`}><small>{label}</small><b>{value}</b></div>
}

function reportChoiceLabel(options: [string, string][], value: unknown, fallback = 'Not recorded') {
  if (value === null || value === undefined || value === '') return fallback
  const label = options.find(([key]) => String(key) === String(value))?.[1]
  return label || fallback
}

function formattedChoice(row: any, field: string, options: [string, string][], fallback = 'Not recorded') {
  return row?.[`${field}@OData.Community.Display.V1.FormattedValue`] || row?.[`${field}name`] || reportChoiceLabel(options, row?.[field], fallback)
}

// Dataverse memo columns behind these notes hold 2000 characters (early-discharge reason: 300).
const TEXT_LIMIT = 2000

// Textarea that stops at the column limit, shows a live counter and a friendly note once the limit is hit.
// `error` (a popup's save-time message) is shown on the counter line, right under the box.
function TextArea({ maxLength = TEXT_LIMIT, placeholder, value, error, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; error?: string }) {
  const length = String(value || '').length
  const atLimit = length >= maxLength
  const nearLimit = !atLimit && length >= maxLength * 0.9
  const hint = `Up to ${maxLength.toLocaleString()} characters`
  // Divs, not spans: `.field > span` is the label style and would squash this wrapper.
  return <div className="textarea-wrap">
    <textarea {...props} value={value} maxLength={maxLength} aria-invalid={error ? true : undefined} placeholder={placeholder ? `${placeholder} (${hint.toLowerCase()})` : hint} />
    <div className={`textarea-meta${error ? ' has-error' : atLimit ? ' at-limit' : nearLimit ? ' near-limit' : ''}`} aria-live="polite">
      <div className="textarea-note" role={error ? 'alert' : undefined}>{error || (atLimit ? `You've reached the ${maxLength.toLocaleString()}-character limit. Shorten the text to add more.` : nearLimit ? `Almost at the limit - ${(maxLength - length).toLocaleString()} characters left.` : '')}</div>
      <div className="textarea-count">{length.toLocaleString()} / {maxLength.toLocaleString()}</div>
    </div>
  </div>
}

// Renders a label, colouring its required marker ("Name *") red.
function LabelText({ text }: { text: string }) {
  const match = text.match(/^(.*?)\s*\*\s*$/)
  if (!match) return <>{text}</>
  return <>{match[1]} <span className="req-mark" aria-hidden="true">*</span></>
}

// `required` is the validate() label for this field; it is highlighted once a submit has been attempted.
// `error` is a popup's own save-time message, shown as text under the input.
function Field({ label, required, error, children }: { label: string; required?: string; error?: string; children: React.ReactNode }) {
  const validation = useContext(ValidationContext)
  const hasError = Boolean(error) || Boolean(required && validation.show && validation.missing.includes(required))
  // A TextArea child shows the error on its own counter line; other inputs get it right underneath.
  const parts = Children.toArray(children)
  const textAreaIndex = error ? parts.findIndex((child) => isValidElement(child) && child.type === TextArea) : -1
  const content = textAreaIndex >= 0 ? parts.map((child, index) => index === textAreaIndex && isValidElement<{ error?: string }>(child) ? cloneElement(child, { error }) : child) : children
  return <label className={`field${hasError ? ' has-error' : ''}`}><span><LabelText text={label} /></span>{content}{textAreaIndex < 0 && <FieldError message={error} />}</label>
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <em className="field-error" role="alert">{message}</em>
}

const REQUIRED = 'This field is required.'

// Popup validation: errors appear only after the first save attempt, then update live as fields are filled.
function useSaveErrors<T>(validate: (value: T) => Record<string, string>, value: T) {
  const [attempted, setAttempted] = useState(false)
  const errors = attempted ? validate(value) : {}
  return {
    errors,
    // Returns true when the record is valid and may be saved.
    check: () => { setAttempted(true); return Object.keys(validate(value)).length === 0 },
    reset: () => setAttempted(false),
  }
}

function SelectField({ label, value, options, placeholder, required, error, onChange }: { label: string; value: string; options: [string, string][]; placeholder?: string; required?: string; error?: string; onChange: (value: any) => void }) {
  return <Field label={label} required={required} error={error}><PulseSelect ariaLabel={label.replace(/\s*\*\s*$/, '')} placeholder={placeholder} value={value} onChange={onChange} options={options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel }))} /></Field>
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Field label={label}><input type="number" min="0" value={value} onChange={(e) => onChange(Number(e.target.value))} /></Field>
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><strong>{title}</strong><span>{text}</span></div>
}

function PageTitle({ step, eyebrow, title, subtitle, action }: { step: string; eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <header className="page-title"><div><div className="eyebrow">{step} · {eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>
}










type HostUser = { id: string; name: string; upn: string; aadObjectId: string }

function reportPayload(source: FormState, includeDraftStatus = false) {
  const payload: any = compact({
    dma_name: reportCode(source),
    dma_reportdate: source.reportDate ? new Date(source.reportDate).toISOString() : new Date().toISOString(),
    dma_businessunit: Number(source.businessUnit),
    dma_shifttype: shiftMap[source.shift],
    dma_reportstatus: includeDraftStatus ? 778000001 : undefined,
    dma_hotissues: source.hotIssues || 'Draft Report initiated',
    dma_nightmedicalmeeting: source.shift === 'Night' ? Number(source.nightMedicalMeeting) : undefined,
    dma_nightmedicalmeetingsummary: source.shift === 'Night' ? source.nightSummary : undefined,
  })
  if (source.dmUserId) payload['dma_DutyManager@odata.bind'] = `/systemusers(${cleanId(source.dmUserId)})`
  return payload
}

async function persistGeneral(source: FormState, existingId: string) {
  const payload = reportPayload(source, !existingId)
  if (existingId) {
    await Services.reports.update(cleanId(existingId), payload)
    return cleanId(existingId)
  }
  const created = unwrap<any>(await Services.reports.create(payload))
  const id = cleanId(created?.dma_handoverreportid || created?.id)
  if (!id) throw new Error('Dataverse did not return the new handover report ID.')
  return id
}

function patientFlowPayload(source: FormState) {
  return compact({
    dma_name: `${reportCode(source)} Flow`,
    dma_staffadequacy: Number(source.staffAdequacy), dma_ervolume: source.erVolume,
    dma_unplanneddischarges: source.unplannedDischarges,
    dma_totalorcases: source.totalORCases, dma_preoperative: source.preoperative, dma_postoperative: source.postoperative, dma_postponedorcases: source.postponedORCases, dma_cancelledorcases: source.cancelledORCases,
    dma_erdama: source.erDama, dma_erdamaretention: source.erDamaRetention, dma_inpdama: source.inpDama, dma_inpdamaretention: source.inpDamaRetention,
    dma_closeddama: source.closedDama, dma_closeddamaretention: source.closedDamaRetention, dma_shortagetype: source.shortageTypes[0] ? Number(source.shortageTypes[0]) : undefined,
    dma_shortfallsummary: source.shortfallSummary, dma_inputilization: source.inpUtilization, dma_icuutilization: source.icuUtilization, dma_ccuutilization: source.ccuUtilization,
    dma_picuutilization: source.picuUtilization, dma_nicuutilization: source.nicuUtilization, dma_cxutilization: source.cxUtilization, dma_strokeutilization: source.strokeUtilization,
    dma_delayeddischargesnarrative: source.delayedDischargesNarrative,
    dma_prolongedernarrative: source.prolongedERNarrative,
  })
}

async function persistFlow(source: FormState, reportId: string, existingId: string) {
  if (!reportId) throw new Error('A handover report ID is required before patient flow can be saved.')
  const payload: any = patientFlowPayload(source)
  if (existingId) {
    await Services.flow.update(cleanId(existingId), payload)
    await syncCoverageShortages(reportId, source)
    return cleanId(existingId)
  }
  payload['dma_ReportID@odata.bind'] = `/dma_handoverreports(${cleanId(reportId)})`
  const created = unwrap<any>(await Services.flow.create(payload))
  const id = cleanId(created?.dma_patientflowsummaryid || created?.id)
  if (!id) throw new Error('Dataverse did not return the new patient-flow summary ID.')
  await syncCoverageShortages(reportId, source)
  return id
}

async function coverageShortageRows(reportId: string) {
  const report = cleanId(reportId)
  if (!report) return []
  return list<any>(await Services.coverageShortages.getAll({
    select: ['dma_coverageshortageid', 'dma_name', 'dma_shortagetype'],
    filter: `_dma_reportid_value eq ${report}`,
    orderBy: ['createdon asc'],
  } as any))
}

async function syncCoverageShortages(reportId: string, source: FormState) {
  const report = cleanId(reportId)
  if (!report) throw new Error('The handover report must exist before coverage shortages can be saved.')
  const desired = new Set(source.staffAdequacy === '778000000' ? (source.shortageTypes || []).map(String) : [])
  const existing = await coverageShortageRows(report)
  const retainedTypes = new Set<string>()

  for (const row of existing) {
    const type = String(row.dma_shortagetype ?? '')
    if (!desired.has(type) || retainedTypes.has(type)) {
      await Services.coverageShortages.delete(cleanId(row.dma_coverageshortageid))
    } else {
      retainedTypes.add(type)
    }
  }

  for (const type of desired) {
    if (retainedTypes.has(type)) continue
    await Services.coverageShortages.create({
      dma_name: `${reportCode(source)} - ${labelFor(shortageOptions, type)}`,
      dma_shortagetype: Number(type),
      'dma_ReportID@odata.bind': `/dma_handoverreports(${report})`,
    } as any)
  }
}

async function deleteCoverageShortages(reportId: string) {
  const rows = await coverageShortageRows(reportId)
  await Promise.all(rows.map((row) => Services.coverageShortages.delete(cleanId(row.dma_coverageshortageid))))
}

// User-facing text only; the full stack goes to the console for debugging.
function errorMessage(error: unknown) {
  if (error instanceof Error) {
    console.error(error)
    return error.message
  }
  try { return JSON.stringify(error) } catch { return String(error || 'Unknown error') }
}

function isSubmittedReport(row: any) {
  const status = Number(row?.dma_reportstatus)
  return status === 778000002 || status === 778000000
}

function resultId(result: unknown, primaryKey: string) {
  const record = unwrap<any>(result)
  const id = cleanId(record?.[primaryKey] || record?.id)
  if (!id) throw new Error(`Dataverse did not return ${primaryKey}.`)
  return id
}

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
      // The host's systemuserid belongs to the app's environment, not DT New, so only the name is reused.
      if (user?.userName) {
        return { id: '', name: user.userName, upn: '', aadObjectId: '' }
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

// Xrm.WebApi always talks to the hosting environment, but the data lives in DT New (see dataverse.ts).
// Returning null routes every read/write through the cross-environment Services instead.
function getXrmWebApi(): any {
  return null
}

async function retrieveHandoverReportsViaXrm(filterValue = 'all') {
  const api = getXrmWebApi()
  if (!api) return []
  let query = '?$select=dma_handoverreportid,dma_name,dma_reportdate,dma_shifttype,dma_reportstatus,statecode,statuscode,dma_hotissues,createdon,dma_businessunit,dma_dmacknowledgmenttimestamp,_dma_dutymanager_value&$top=100&$orderby=createdon desc'
  if (filterValue !== 'all') query += `&$filter=dma_businessunit eq ${filterValue}`
  const result = await api.retrieveMultipleRecords('dma_handoverreport', query)
  return result?.entities || []
}

async function retrievePreviousSameBuReport(form: FormState, currentReportId?: string) {
  if (!form.businessUnit || !form.reportDate) return null
  const api = getXrmWebApi()
  const currentDate = new Date(form.reportDate)
  const cleanCurrentId = cleanId(currentReportId || '')
  const beforeFilter = Number.isNaN(currentDate.getTime()) ? '' : ` and dma_reportdate lt ${currentDate.toISOString()}`
  const excludeCurrent = cleanCurrentId ? ` and dma_handoverreportid ne ${cleanCurrentId}` : ''
  const filter = `dma_businessunit eq ${form.businessUnit}${beforeFilter}${excludeCurrent}`

  if (api) {
    const query = `?$select=dma_handoverreportid,dma_name,dma_reportdate,dma_shifttype,createdon,dma_businessunit,dma_dmacknowledgmenttimestamp,_dma_dutymanager_value&$filter=${filter}&$orderby=dma_reportdate desc,createdon desc&$top=1`
    const result = await api.retrieveMultipleRecords('dma_handoverreport', query)
    return result?.entities?.[0] || null
  }

  const result = await Services.reports.getAll({
    select: ['dma_handoverreportid', 'dma_name', 'dma_reportdate', 'dma_shifttype', 'createdon', 'dma_businessunit', 'dma_dmacknowledgmenttimestamp', '_dma_dutymanager_value'],
    filter,
    orderBy: ['dma_reportdate desc', 'createdon desc'],
    top: 1,
  } as any)
  return list(result)[0] || null
}

async function retrieveCarryForwardItems(previousReportId: string) {
  const report = cleanId(previousReportId)
  if (!report) return []
  const api = getXrmWebApi()
  let adminRows: any[] = []
  let opsRows: any[] = []

  if (api) {
    const [admin, ops] = await Promise.all([
      api.retrieveMultipleRecords('dma_administrativeissueentry', `?$filter=_dma_reportid_value eq ${report}&$expand=dma_IssueID($select=dma_administrativeissueid,dma_name)`),
      api.retrieveMultipleRecords('dma_opeartion', `?$filter=_dma_reportid_value eq ${report}`),
    ])
    adminRows = admin?.entities || []
    opsRows = ops?.entities || []
  } else {
    const [admin, ops] = await Promise.all([
      Services.adminEntries.getAll({ filter: `_dma_reportid_value eq ${report}` } as any),
      Services.ops.getAll({ filter: `_dma_reportid_value eq ${report}` } as any),
    ])
    adminRows = list(admin)
    opsRows = list(ops)
  }

  const unresolvedAdmin = adminRows
    .filter((row) => String(row.dma_resolutionstatus || '') !== '778000001')
    .map((row) => {
      const sourceId = row.dma_administrativeissueentryid || row.id || `admin-${row.dma_name || Date.now()}`
      return {
        id: `prev-admin-${sourceId}`,
        targetId: `carry-admin-${cleanId(sourceId)}`,
        kind: 'admin',
        title: row.dma_IssueID?.dma_name || row.dma_issueidname || row.dma_name || 'Administrative issue',
        description: row.dma_description || row.dma_pendingissues || row.dma_actiontaken || '',
        action: row.dma_actiontaken || '',
        pending: row.dma_pendingissues || '',
        status: String(row.dma_resolutionstatus || '778000000'),
        age: 'Previous shift',
      }
    })

  const unresolvedOps = opsRows
    .filter((row) => String(row.dma_resolutionstatus || '') !== '778000001')
    .map((row) => {
      const sourceId = row.dma_opeartionid || row.id || `ops-${row.dma_name || Date.now()}`
      return {
        id: `prev-ops-${sourceId}`,
        targetId: `carry-ops-${cleanId(sourceId)}`,
        kind: 'ops',
        title: row.dma_name || `${labelFor(serviceAffectedOptions, row.dma_serviceaffected)} - ${labelFor(opsIssueOptions, row.dma_typeofissue)}`,
        description: row.dma_descriptionofissue || row.dma_pendingissues || '',
        pending: row.dma_pendingissues || '',
        status: String(row.dma_resolutionstatus || '778000000'),
        funcId: String(row.dma_servicefunctionality || '778000000'),
        affectedId: String(row.dma_serviceaffected || '778000000'),
        issueId: String(row.dma_typeofissue || '778000000'),
        age: 'Previous shift',
      }
    })

  return [...unresolvedAdmin, ...unresolvedOps]
}

async function acknowledgeHandoverReport(id: string, timestamp: string) {
  const payload = { dma_dmacknowledgmenttimestamp: timestamp, dma_reportstatus: 778000000, statecode: 0, statuscode: 1 } as any
  const api = getXrmWebApi()
  if (api) {
    await api.updateRecord('dma_handoverreport', cleanId(id), payload)
    return
  }
  await Services.reports.update(cleanId(id), payload)
}

async function retrieveReportBundleViaXrm(id: string): Promise<ReportBundle | null> {
  const api = getXrmWebApi()
  if (!api) return null
  const clean = cleanId(id)
  const [report, flow, events, admin, ops, experience] = await Promise.all([
    api.retrieveRecord('dma_handoverreport', clean, '?$select=dma_handoverreportid,dma_name,dma_reportdate,dma_businessunit,dma_shifttype,dma_hotissues,dma_nightmedicalmeeting,dma_nightmedicalmeetingsummary,dma_dmacknowledgmenttimestamp,_dma_dutymanager_value&$expand=dma_DutyManager($select=fullname)'),
    api.retrieveMultipleRecords('dma_patientflowsummary', `?$filter=_dma_reportid_value eq ${clean}`),
    api.retrieveMultipleRecords('dma_hospitalevent', `?$filter=_dma_reportid_value eq ${clean}`),
    api.retrieveMultipleRecords('dma_administrativeissueentry', `?$filter=_dma_reportid_value eq ${clean}&$expand=dma_IssueID($select=dma_administrativeissueid,dma_name)`),
    api.retrieveMultipleRecords('dma_opeartion', `?$filter=_dma_reportid_value eq ${clean}`),
    api.retrieveMultipleRecords('dma_patientexperience', `?$filter=_dma_reportid_value eq ${clean}`),
  ])
  const flowRows = flow?.entities || []
  const flowId = cleanId(flowRows[0]?.dma_patientflowsummaryid || '')
  const flowEntries = flowId ? await api.retrieveMultipleRecords('dma_patientflowentry', `?$filter=_dma_patientflow_value eq ${flowId}`).catch(() => ({ entities: [] })) : { entities: [] }
  return {
    report,
    flow: flowRows,
    flowEntries: flowEntries?.entities || [],
    events: events?.entities || [],
    admin: admin?.entities || [],
    ops: ops?.entities || [],
    experience: experience?.entities || [],
  }
}

async function retrievePatientFlowSummary(id: string): Promise<Partial<FormState>> {
  const api = getXrmWebApi()
  const clean = cleanId(id)
  const fromRow = (row: any): Partial<FormState> => {
    const patch: Partial<FormState> = {}
    if (!row) return patch
    const numberFields: [keyof FormState, string][] = [
      ['erAdmissions', 'dma_eradmissions'],
      ['opdAdmissions', 'dma_opdadmissions'],
      ['admissions', 'dma_admissions'],
      ['discharges', 'dma_discharges'],
      ['plannedDischarges', 'dma_planneddischarges'],
      ['delayedDischargesCount', 'dma_delayeddischargescount'],
      ['prolongedERAdmissionsCount', 'dma_prolongederadmissionscount'],
    ]
    numberFields.forEach(([formField, dataverseField]) => {
      if (row[dataverseField] !== undefined && row[dataverseField] !== null) (patch as any)[formField] = toNumeric(row[dataverseField])
    })
    return patch
  }

  if (api) {
    try {
      const flow = await api.retrieveMultipleRecords('dma_patientflowsummary', `?$filter=_dma_reportid_value eq ${clean}&$top=1&$orderby=createdon desc`)
      return fromRow(flow?.entities?.[0])
    } catch (error) {
      console.warn('Xrm patient-flow refresh failed; trying generated Dataverse service', error)
    }
  }

  const result = await Services.flow.getAll({ filter: `_dma_reportid_value eq ${clean}`, orderBy: ['createdon desc'], top: 1 } as any)
  return fromRow(list(result)[0])
}

function targetDischargeDate(reportDate: string) {
  if (!reportDate) return ''
  const base = new Date(reportDate)
  if (Number.isNaN(base.getTime())) return ''
  base.setDate(base.getDate() + 1)
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`
}

async function syncEarlyDischargesViaXrm(reportDate: string): Promise<{ masterId: string; rows: EarlyDischarge[] }> {
  const targetDate = targetDischargeDate(reportDate)
  if (!targetDate) return { masterId: '', rows: [] }
  const masters = list(await Services.earlyDischargeMasters.getAll({
    select: ['and_earlydischargeid', 'and_name', 'and_dischargedate', 'and_statusnew', 'statecode', 'createdon'],
    filter: `and_dischargedate eq '${targetDate}'`, orderBy: ['createdon desc'],
  } as any))
  const master = masters.find((row: any) => Number(row.and_statusnew) === 0 && Number(row.statecode) === 0)
  const masterId = cleanId(master?.and_earlydischargeid || '')
  if (!masterId) return { masterId: '', rows: [] }
  const children = list(await Services.earlyDischargePatients.getAll({ filter: `_and_earlydischarge_value eq ${masterId}`, orderBy: ['createdon asc'] } as any))
  const rows = await Promise.all(children.map(async (child: any) => {
    const patientId = cleanId(child._and_patientcode_value || '')
    const patient = patientId ? unwrap<any>(await Services.inpatientList.get(patientId).catch(() => null)) : null
    return {
      id: child.and_earlydischarge_ipdvisitsid,
      area: 'IPD' as PatientArea,
      name: patient?.and_patientname || child.and_name || child.and_patientcodename || 'Early/Planned Discharge',
      code: patient?.and_name || '',
      patientId,
      type: (child.and_dischargetype === 1 ? 'Early' : 'Planned') as EarlyDischarge['type'],
      reason: child.and_cancellationreason || '',
    }
  }))
  return { masterId, rows }
}

async function createEarlyDischargeViaXrm(masterId: string, draft: { type: EarlyDischarge['type']; patientCode: string; reason: string }): Promise<EarlyDischarge> {
  const patient = await findInpatientByCodeViaXrm(draft.patientCode)
  if (!patient?.and_inpatientlistid) throw new Error('No inpatient was found for that patient code.')
  const patientId = cleanId(patient.and_inpatientlistid)
  const duplicates = list(await Services.earlyDischargePatients.getAll({
    select: ['and_earlydischarge_ipdvisitsid'],
    filter: `_and_earlydischarge_value eq ${cleanId(masterId)} and _and_patientcode_value eq ${patientId}`,
    top: 1,
  } as any))
  if (duplicates.length) throw new Error('This patient is already in tomorrow discharge plan.')
  const payload = compact({
    and_dischargetype: draft.type === 'Early' ? 1 : 2,
    and_name: patient.and_patientname || patient.and_name || 'Early/Planned Discharge',
    and_cancellationreason: draft.reason,
    'and_PatientCode@odata.bind': `/and_inpatientlists(${cleanId(patient.and_inpatientlistid)})`,
    'and_EarlyDischarge@odata.bind': `/and_earlydischarges(${cleanId(masterId)})`,
  })
  const createdResult = await Services.earlyDischargePatients.create(payload as any)
  const childId = resultId(createdResult, 'and_earlydischarge_ipdvisitsid')
  if (!childId) throw new Error('Dataverse created no Early Discharge patient ID.')
  try {
    const master = unwrap<any>(await Services.earlyDischargeMasters.get(cleanId(masterId)))
    const dischargeDate = String(master?.and_dischargedate || '')
    let dischargeAt: string | undefined
    if (dischargeDate) {
      const dateOnly = dischargeDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
      const parsed = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 9, 0, 0, 0)
        : new Date(dischargeDate)
      if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid Early Discharge date returned by Dataverse: ${dischargeDate}`)
      if (!dateOnly) parsed.setHours(9, 0, 0, 0)
      dischargeAt = parsed.toISOString()
    }
    const patientDischarge = await Services.patientDischarges.create(compact({
      crad2_dischargereference: `${draft.patientCode.trim()}-${Date.now()}`,
      crad2_patientidlookup: draft.patientCode.trim(), crad2_patientname: patient.and_patientname || patient.and_name,
      crad2_dischargedate: dischargeAt, and_earlyflag: 1,
      'and_PatientCode@odata.bind': `/and_inpatientlists(${cleanId(patient.and_inpatientlistid)})`,
    }) as any)
    const patientDischargeId = resultId(patientDischarge, 'crad2_patientdischargeid')
    if (patientDischargeId) await Services.earlyDischargePatients.update(childId, { 'and_PatientDischarge@odata.bind': `/crad2_patientdischarges(${cleanId(patientDischargeId)})` } as any)
  } catch (error) {
    await Services.earlyDischargePatients.delete(childId).catch(() => undefined)
    throw new Error(`Patient Discharge linkage failed: ${errorMessage(error)}`)
  }
  return {
    id: childId,
    area: 'IPD',
    name: patient.and_patientname || patient.and_name || 'Early/Planned Discharge',
    code: patient.and_name || draft.patientCode.trim(),
    patientId: patient.and_inpatientlistid,
    type: draft.type,
    reason: draft.reason,
  }
}

async function deleteEarlyDischargeViaXrm(id: string) {
  await Services.earlyDischargePatients.delete(cleanId(id))
}

async function findInpatientByCodeViaXrm(code: string) {
  const safe = escapeOData(code.trim())
  const patients = list(await Services.inpatientList.getAll({ select: ['and_inpatientlistid', 'and_name', 'and_patientname'], filter: `and_name eq '${safe}'`, top: 2 } as any))
  if (patients.length > 1) throw new Error('Multiple inpatients have this exact code. Please correct the duplicate Inpatient List records.')
  return patients[0] || null
}

// CalculateRollupField is a Dataverse function, and the cross-environment connector can only run
// actions, so it cannot be forced from here. Dataverse's scheduled rollup job refreshes
// crda1_countofpatients on its own.
async function triggerEarlyDischargeRollup(masterId: string) {
  if (!cleanId(masterId)) return
  console.info('Early discharge count (crda1_countofpatients) will refresh on the Dataverse rollup schedule.')
}

function toNumeric(value: any) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

async function retrieveSystemUserViaXrm(filter: string) {
  const api = getXrmWebApi()
  if (!api) return null
  const query = `?$select=fullname,systemuserid,domainname,internalemailaddress,azureactivedirectoryobjectid&$filter=${filter}&$top=1`
  const result = await api.retrieveMultipleRecords('systemuser', query)
  return result?.entities?.[0] || null
}

function patientSchema(area: PatientArea) {
  if (area === 'ER') return { service: Services.erVisits, entity: 'cr301_ervisits', select: ['cr301_ervisitsid', 'cr301_patient', 'cr301_patienttext', 'cr301_patientcode'], name: 'cr301_patient', fallbackName: 'cr301_patienttext', code: 'cr301_patientcode', id: 'cr301_ervisitsid', bind: 'dma_ERPatient@odata.bind', set: 'cr301_ervisitses' }
  if (area === 'IPD') return { service: Services.ipdPatients, select: ['ipd_patientid', 'ipd_patientname', 'ipd_patientcode', 'ipd_name'], name: 'ipd_patientname', code: 'ipd_patientcode', id: 'ipd_patientid', bind: 'dma_IPDPatients@odata.bind', set: 'ipd_patients' }
  if (area === 'IPD_KSA') return { service: Services.inpatientList, entity: 'and_inpatientlist', select: ['and_inpatientlistid', 'and_patientname', 'and_name'], name: 'and_patientname', code: 'and_name', id: 'and_inpatientlistid', bind: 'dma_IPDPatientsKSA@odata.bind', set: 'and_inpatientlists' }
  if (area === 'OPD_KSA') return { service: Services.ksaPatients, select: ['opd_ksapatientsid', 'opd_name', 'opd_patientcode', 'opd_patientname'], name: 'opd_patientname', code: 'opd_patientcode', id: 'opd_ksapatientsid', bind: 'dma_OPDPatientKSA@odata.bind', set: 'opd_ksapatientses' }
  return { service: Services.opdPatients, select: ['opd_patientid', 'opd_patientname', 'opd_patientcode', 'opd_name'], name: 'opd_patientname', code: 'opd_patientcode', id: 'opd_patientid', bind: 'dma_OPDPatientEG@odata.bind', set: 'opd_patients' }
}

async function searchPatients(area: PatientArea, value: string) {
  if (value.trim().length < 2) return []
  const schema = patientSchema(area)
  const safe = escapeOData(value.trim())
  const filter = `contains(${schema.name}, '${safe}') or contains(${schema.code}, '${safe}')`
  try {
    let rows: any[]
    if (schema.service) {
      rows = list(await schema.service.getAll({ select: schema.select, filter, top: 10 } as any))
    } else {
      const api = getXrmWebApi()
      if (!api || !schema.entity) throw new Error('Dataverse patient search is not available.')
      const result = await api.retrieveMultipleRecords(schema.entity, `?$select=${schema.select.join(',')}&$filter=${filter}&$top=10`)
      rows = result?.entities || []
    }
    return rows.map((row: any) => ({ id: row[schema.id], name: row[schema.name] || (schema.fallbackName ? row[schema.fallbackName] : '') || row.ipd_name || row.opd_name || '', code: row[schema.code] || '', area }))
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

