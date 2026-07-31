// Per-tank fuel flows for one day/window: imports come from nhập-hàng slips,
// sales from the approved shift readings of every dispenser drawing from the
// tank (closing − opening on the electronic meter). Full liters reconciliation
// against the physical dip waits for the barem table (dip is still a raw stick
// value); these flows are the two sides that are already in liters.

export type TankFlow = { imported: number; sold: number }

export function computeTankFlows(params: {
  dispensers: { id: string; tankCode: string | null }[]
  readings: {
    dispenserId: string
    openingElectronicReading: number | null
    electronicReading: number | null
  }[]
  imports: { tankCode: string; litersActual: number }[]
}): Map<string, TankFlow> {
  const flows = new Map<string, TankFlow>()
  const flowFor = (tankCode: string): TankFlow => {
    let flow = flows.get(tankCode)
    if (!flow) {
      flow = { imported: 0, sold: 0 }
      flows.set(tankCode, flow)
    }
    return flow
  }

  for (const imp of params.imports) {
    flowFor(imp.tankCode).imported += imp.litersActual
  }

  const tankByDispenser = new Map(
    params.dispensers.filter((d) => d.tankCode).map((d) => [d.id, d.tankCode!])
  )
  for (const reading of params.readings) {
    const tankCode = tankByDispenser.get(reading.dispenserId)
    if (!tankCode) continue
    if (reading.openingElectronicReading === null || reading.electronicReading === null) continue
    const delta = reading.electronicReading - reading.openingElectronicReading
    const flow = flowFor(tankCode)
    // A negative delta is a data problem (reading review will flag it) — it
    // must not silently shrink the tank's sold total.
    if (delta > 0) flow.sold += delta
  }

  return flows
}
