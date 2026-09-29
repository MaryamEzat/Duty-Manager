import type { IOperationResult } from '@microsoft/power-apps/data'
import type { IGetAllOptions, IGetOptions } from '../generated/models/CommonModels'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'

/**
 * The code app is hosted in "Code App Development" (org998df960) but all Duty Manager data
 * stays in "DT New". Generated per-table services always hit the app's HOME environment, so
 * every CRUD call goes through the Dataverse connector's *WithOrganization operations instead,
 * which take the target environment explicitly on each call.
 */
export const DATAVERSE_ORG_URL = 'https://org319b4ea9.crm4.dynamics.com'

const PREFER = 'return=representation'
// Reads also ask for display labels (choice text, lookup names such as the duty manager's full name).
const READ_PREFER = 'odata.include-annotations="*"'
const ACCEPT = 'application/json'

type Row = Record<string, unknown>

function fail(action: string, entitySet: string, result: IOperationResult<unknown>): never {
  const detail = (result as any)?.error
  throw new Error(`Dataverse ${action} on ${entitySet} failed: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

/**
 * Drop-in replacement for a generated table service (create/update/delete/get/getAll)
 * that reads and writes the table in DATAVERSE_ORG_URL.
 */
export function crossEnvTable<T extends Row = any>(entitySet: string) {
  return {
    async create(record: Row): Promise<IOperationResult<T>> {
      const result = await MicrosoftDataverseService.CreateRecordWithOrganization(PREFER, ACCEPT, DATAVERSE_ORG_URL, entitySet, record)
      if (!result.success) fail('create', entitySet, result)
      return result as unknown as IOperationResult<T>
    },

    async update(id: string, changedFields: Row): Promise<IOperationResult<T>> {
      const result = await MicrosoftDataverseService.UpdateRecordWithOrganization(PREFER, ACCEPT, DATAVERSE_ORG_URL, entitySet, id, changedFields)
      if (!result.success) fail('update', entitySet, result)
      return result as unknown as IOperationResult<T>
    },

    // Delete takes organization first (no prefer/accept), unlike create/update/get.
    async delete(id: string): Promise<void> {
      const result = await MicrosoftDataverseService.DeleteRecordWithOrganization(DATAVERSE_ORG_URL, entitySet, id)
      if (!result.success) fail('delete', entitySet, result)
    },

    async get(id: string, options?: IGetOptions): Promise<IOperationResult<T>> {
      const result = await MicrosoftDataverseService.GetItemWithOrganization(
        READ_PREFER, ACCEPT, DATAVERSE_ORG_URL, entitySet, id,
        undefined, undefined, options?.select?.join(','),
      )
      if (!result.success) fail('read', entitySet, result)
      return result as unknown as IOperationResult<T>
    },

    // List takes organization first; the connector returns { value: [...] }, unwrapped here to match getAll().
    async getAll(options?: IGetAllOptions): Promise<IOperationResult<T[]>> {
      const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
        DATAVERSE_ORG_URL, entitySet,
        READ_PREFER, ACCEPT, undefined, undefined,
        options?.select?.join(','),
        options?.filter,
        options?.orderBy?.join(','),
        undefined, undefined,
        options?.top,
      )
      if (!result.success) fail('list', entitySet, result)
      const payload = result.data as any
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.value) ? payload.value : []
      return { ...result, data: rows } as IOperationResult<T[]>
    },
  }
}
