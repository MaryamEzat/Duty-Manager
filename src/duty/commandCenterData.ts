// Command Center data for a shift-date range: submitted reports with their patient flow, experience, event,
// administrative and operations rows, plus each hospital's capacities. Used by the KPI scorecard and the
// Command Center export, so both always work from the same records.
import { Services, shiftFromValue } from './data'
import type { CommandCenterData } from './commandCenterReport'
import type { KpiCapacity, KpiReport, KpiShift } from './kpis'
import { bundleColumns } from './reportColumns'
import { cleanId, list, shiftBusinessDate } from './utils'

export const reportKey = (report: any) => cleanId(report?.dma_handoverreportid).toLowerCase()
// Shift date of a report: a Night report written after midnight belongs to the night that started the day before.
export const reportShiftDate = (report: any) => shiftBusinessDate(report?.dma_reportdate || report?.createdon, shiftFromValue(report?.dma_shifttype))

export function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day + days)
}

const cache = new Map<string, Promise<CommandCenterData>>()
export const clearCommandCenterData = () => cache.clear()

async function rowsForReports(service: typeof Services.flow, select: string[], ids: string[]) {
  const rows: any[] = []
  for (let start = 0; start < ids.length; start += 40) {
    const chunk = ids.slice(start, start + 40)
    rows.push(...list<any>(await service.getAll({ select: ['_dma_reportid_value', ...select], filter: `(${chunk.map((id) => `_dma_reportid_value eq ${id}`).join(' or ')})`, top: 5000 } as any)))
  }
  return rows
}

export function loadCommandCenterData(from: string, to: string): Promise<CommandCenterData> {
  const key = `${from}|${to}`
  if (!cache.has(key)) {
    const task = (async (): Promise<CommandCenterData> => {
      // A Night report written after midnight carries the next calendar day, so read one extra day each side.
      const start = addDays(from, -1).toISOString()
      const end = addDays(to, 2).toISOString()
      const reportRows = list<any>(await Services.reports.getAll({
        select: bundleColumns.report,
        filter: `statecode eq 0 and (dma_reportstatus eq 778000002 or dma_reportstatus eq 778000000) and ((dma_reportdate ge ${start} and dma_reportdate lt ${end}) or (dma_reportdate eq null and createdon ge ${start} and createdon lt ${end}))`,
        top: 5000,
      } as any))
      const reports: KpiReport[] = reportRows.map((row) => ({
        id: reportKey(row), businessUnit: String(row.dma_businessunit ?? ''), shift: shiftFromValue(row.dma_shifttype) as KpiShift,
        shiftDate: reportShiftDate(row), createdOn: row.createdon, acknowledgedAt: row.dma_dmacknowledgmenttimestamp || undefined,
        nightMeeting: row.dma_nightmedicalmeeting ?? null,
      })).filter((report) => report.id && report.shiftDate >= from && report.shiftDate <= to)
      const ids = reports.map((report) => report.id)
      const [flows, experiences, events, adminEntries, operations, capacityRows] = await Promise.all([
        rowsForReports(Services.flow, bundleColumns.flow, ids),
        rowsForReports(Services.experience, bundleColumns.experience, ids),
        rowsForReports(Services.events, bundleColumns.events, ids),
        rowsForReports(Services.adminEntries, bundleColumns.admin, ids),
        rowsForReports(Services.ops, bundleColumns.ops, ids),
        Services.facilityCapacities.getAll({ select: ['dma_businessunit', 'dma_ercapacity', 'dma_wardcapacity', 'dma_icucapacity', 'dma_ccucapacity', 'dma_picucapacity', 'dma_nicucapacity', 'dma_cpu', 'dma_strokecapacity'] } as any).then((result) => list<any>(result)),
      ])
      const byReport = (rows: any[]) => {
        const grouped: Record<string, any[]> = {}
        for (const row of rows) (grouped[cleanId(row._dma_reportid_value).toLowerCase()] ||= []).push(row)
        return grouped
      }
      const first = (rows: any[]) => Object.fromEntries(Object.entries(byReport(rows)).map(([id, group]) => [id, group[0]]))
      const capacities: Record<string, KpiCapacity> = {}
      for (const row of capacityRows) {
        const beds = (field: string) => Number(row[field]) > 0 ? Number(row[field]) : undefined
        capacities[String(row.dma_businessunit)] = {
          er: beds('dma_ercapacity'), ward: beds('dma_wardcapacity'),
          critical: { icu: beds('dma_icucapacity'), ccu: beds('dma_ccucapacity'), picu: beds('dma_picucapacity'), nicu: beds('dma_nicucapacity'), cpu: beds('dma_cpu'), stroke: beds('dma_strokecapacity') },
        }
      }
      const inRange = new Set(ids)
      return {
        reports, reportRows: Object.fromEntries(reportRows.map((row) => [reportKey(row), row]).filter(([id]) => inRange.has(id))),
        flows: first(flows), experiences: first(experiences), events: byReport(events), adminEntries: byReport(adminEntries), operations: byReport(operations), capacities,
      }
    })()
    task.catch(() => cache.delete(key))
    cache.set(key, task)
  }
  return cache.get(key)!
}
