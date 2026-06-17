export const APP_ROLES = ['admin', 'accountant', 'viewer'] as const

export type AppRole = (typeof APP_ROLES)[number]

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value)
}

export function hasRole(role: AppRole, allowed: AppRole | AppRole[]): boolean {
  const list = Array.isArray(allowed) ? allowed : [allowed]
  return list.includes(role)
}
