// Per-hầm imports remain separate. Sales from a trụ drawing from several hầm
// belong to the connected group, since its meter cannot split them by hầm.
import { byTankCode } from '@/lib/dispensers/tank-links'

export type TankFlow = { imported: number; sold: number; sharedWith: string[] }

export function computeTankFlows(params: {
  dispensers: { id: string; tankCodes: readonly string[] }[]
  readings: {
    dispenserId: string
    openingElectronicReading: number | null
    electronicReading: number | null
  }[]
  imports: { tankCode: string; litersActual: number }[]
}): Map<string, TankFlow> {
  const flows = new Map<string, TankFlow>()
  const flowFor = (code: string): TankFlow => {
    let flow = flows.get(code)
    if (!flow) {
      flow = { imported: 0, sold: 0, sharedWith: [] }
      flows.set(code, flow)
    }
    return flow
  }
  for (const imp of params.imports) flowFor(imp.tankCode).imported += imp.litersActual

  const parent = new Map<string, string>()
  const root = (code: string): string => {
    const p = parent.get(code) ?? code
    if (p !== code) {
      const r = root(p)
      parent.set(code, r)
      return r
    }
    return code
  }
  const codeByDispenser = new Map<string, string>()
  for (const d of params.dispensers) {
    const first = d.tankCodes[0]
    if (!first) continue
    codeByDispenser.set(d.id, first)
    for (const code of d.tankCodes) parent.set(root(code), root(first))
  }

  const groups = new Map<string, string[]>()
  for (const d of params.dispensers) {
    for (const code of d.tankCodes) {
      const r = root(code)
      const group = groups.get(r) ?? []
      if (!group.includes(code)) group.push(code)
      groups.set(r, group)
    }
  }
  for (const group of groups.values()) {
    group.sort(byTankCode)
    for (const code of group) flowFor(code).sharedWith = group.filter((other) => other !== code)
  }

  const soldByGroup = new Map<string, number>()
  for (const reading of params.readings) {
    const code = codeByDispenser.get(reading.dispenserId)
    if (!code || reading.openingElectronicReading === null || reading.electronicReading === null)
      continue
    const r = root(code)
    const delta = reading.electronicReading - reading.openingElectronicReading
    // A negative delta signals a bad reading, not returned stock.
    soldByGroup.set(r, (soldByGroup.get(r) ?? 0) + Math.max(0, delta))
  }
  for (const [r, sold] of soldByGroup) {
    for (const code of groups.get(r) ?? []) flowFor(code).sold = sold
  }
  return flows
}
