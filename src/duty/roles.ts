import { Services } from './data'
import { cleanId, list } from './utils'

export type SecurityRole = { id: string; name: string }

// What a user may open in Duty Manager, decided by their security roles in DT New:
// full    - every page, including the Command Center (operations dashboard)
// reports - Home and the handover report pages
// view    - every page, including the Command Center, without creating or changing any data
// none    - no access
export type AccessLevel = 'full' | 'reports' | 'view' | 'none'

export const FULL_ACCESS_ROLES = ['Duty Managers-Admin', 'Duty Manager - System Customizer']
export const REPORT_ACCESS_ROLES = ['Duty Managers-Duty Managers']
export const VIEW_ACCESS_ROLES = ['Duty Manager-View Access']

// Roles assigned to the user directly and through the teams they belong to. Each role exists once per
// Dataverse business unit with the same name, so roles are compared by name.
export async function loadUserRoles(systemUserId: string): Promise<SecurityRole[]> {
  const userId = cleanId(systemUserId)
  if (!userId) return []
  const query = (filter: string) => Services.roles.getAll({ select: ['roleid', 'name'], filter, orderBy: ['name asc'] } as any)
  const [direct, viaTeams] = await Promise.all([
    query(`systemuserroles_association/any(user:user/systemuserid eq ${userId})`),
    query(`teamroles_association/any(team:team/teammembership_association/any(user:user/systemuserid eq ${userId}))`),
  ])
  const roles = [...list<any>(direct), ...list<any>(viaTeams)].map((row) => ({ id: cleanId(row.roleid), name: String(row.name || '') }))
  return roles.filter((role, index) => roles.findIndex((other) => other.id === role.id) === index)
}

export function hasRole(roles: SecurityRole[], name: string) {
  const wanted = name.trim().toLowerCase()
  return roles.some((role) => role.name.trim().toLowerCase() === wanted)
}

// The highest role wins, so View Access never makes a duty manager or an admin read-only.
export function accessLevelFor(roles: SecurityRole[]): AccessLevel {
  if (FULL_ACCESS_ROLES.some((name) => hasRole(roles, name))) return 'full'
  if (REPORT_ACCESS_ROLES.some((name) => hasRole(roles, name))) return 'reports'
  if (VIEW_ACCESS_ROLES.some((name) => hasRole(roles, name))) return 'view'
  return 'none'
}

// The Command Center is open to admins and to View Access, including a duty manager who also has View Access.
export function canSeeCommandCenter(roles: SecurityRole[]) {
  return accessLevelFor(roles) === 'full' || VIEW_ACCESS_ROLES.some((name) => hasRole(roles, name))
}
