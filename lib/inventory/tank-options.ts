import { type TankOption } from '@/components/inventory/fuel-import-form'

/**
 * Every hầm a trạm's ô chọn offers, each labelled with what it holds — "Hầm 2 — Xăng E0
 * (13K)". Three sources, the most authoritative first, and a hầm is taken from the first
 * that names it:
 *
 * 1. its `tanks` row — Cấu hình, where a hầm's nhiên liệu and dung tích are set, so a hầm
 *    created there shows up before any trụ draws on it or any đo hầm names it;
 * 2. the copies the trụ drawing on it carry — a trạm whose hầm were never backfilled;
 * 3. its đo hầm — a hầm dự phòng seen only through its dips, whose size nothing states.
 *
 * Pure, and shared by the Hàng tồn and ca pages so their pickers cannot disagree.
 */
export function stationTankOptions(
  sources: {
    tanks: readonly { code: string; fuelType: string; capacityK: number | null }[]
    dispensers: readonly {
      tankCode: string | null
      fuelType: string
      tankCapacityK: number | null
    }[]
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
  for (const d of sources.dispensers) if (d.tankCode) add(d.tankCode, d.fuelType, d.tankCapacityK)
  for (const t of sources.dipTanks) add(t.tankCode, t.fuelType, null)
  return [...options.values()].sort((a, b) => a.code.localeCompare(b.code))
}
