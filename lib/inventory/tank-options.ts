import { type TankOption } from '@/components/inventory/fuel-import-form'

/**
 * Every hầm a trạm's ô chọn offers, labelled with its nhiên liệu and dung tích.
 * Cấu hình is authoritative; historical đo hầm still name hầm absent there.
 * Shared by Hàng tồn and ca pages so their pickers cannot disagree.
 */
export function stationTankOptions(
  sources: {
    tanks: readonly { code: string; fuelType: string; capacityK: number | null }[]
    dipTanks: readonly { tankCode: string; fuelType: string | null }[]
  },
  fuelLabel: (fuelType: string) => string
): TankOption[] {
  const options = new Map<string, TankOption>()
  const add = (code: string, fuelType: string | null, capacityK: number | null) => {
    if (options.has(code)) return
    const fuel = fuelType ? ` — ${fuelLabel(fuelType)}` : ''
    const cap = capacityK ? ` (${capacityK}K)` : ''
    options.set(code, {
      code,
      label: `${code.replace('HAM_', 'Hầm ')}${fuel}${cap}`,
      fuelType,
      capacityK,
    })
  }
  for (const t of sources.tanks) add(t.code, t.fuelType, t.capacityK)
  for (const t of sources.dipTanks) add(t.tankCode, t.fuelType, null)
  return [...options.values()].sort((a, b) => a.code.localeCompare(b.code))
}
