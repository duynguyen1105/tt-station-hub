import { z } from 'zod'

// Image classification (router step).
export const routerSchema = z.object({
  image_type: z.enum([
    'electronic_meter',
    'mechanical_meter',
    'debt_meter',
    'vehicle',
    'tank_dip',
    'label_only',
    'not_relevant',
  ]),
  confidence: z.number(),
  notes: z.string().optional().default(''),
})
export type RouterResult = z.infer<typeof routerSchema>

const confidencePair = z.object({
  reading: z.number(),
  labels: z.number(),
})

export const electronicSchema = z.object({
  meter_type: z.enum(['electronic_montech', 'electronic_lungbor', 'electronic_green3', 'unclear']),
  reading: z.string().nullable(),
  station_label: z.string().nullable().optional(),
  dispenser_label: z.string().nullable().optional(),
  fuel_type: z.string().nullable().optional(),
  confidence: confidencePair,
  notes: z.string().optional().default(''),
})
export type ElectronicResult = z.infer<typeof electronicSchema>

export const mechanicalSchema = z.object({
  meter_type: z.enum(['mechanical', 'unclear']),
  reading: z.string().nullable(),
  has_unreadable_digits: z.boolean().optional().default(false),
  station_label: z.string().nullable().optional(),
  dispenser_label: z.string().nullable().optional(),
  fuel_type: z.string().nullable().optional(),
  confidence: confidencePair,
  notes: z.string().optional().default(''),
})
export type MechanicalResult = z.infer<typeof mechanicalSchema>

export type MeterType =
  | 'electronic_montech'
  | 'electronic_lungbor'
  // 3-line green dot-matrix totalizer — legible far less reliably than the
  // red-LED Montech, so it ranks below Montech when cross-check reads diverge.
  | 'electronic_green3'
  | 'mechanical'
  | 'unclear'
  | 'not_a_meter'

// Normalized result of the shift-photo extraction pipeline (camelCase).
export type ExtractMeterResult = {
  meterType: MeterType
  reading: string | null
  stationLabel: string | null
  dispenserLabel: string | null
  fuelType: string | null
  readingConfidence: number | null
  labelsConfidence: number | null
  hasUnreadableDigits: boolean
  notes: string
  raw: unknown
}

// === Per-trip debt (§5.4) ===
export const debtMeterSchema = z.object({
  meter_type: z.enum(['debt_meter', 'unclear']),
  displayed_amount: z.string().nullable(),
  liters: z.string().nullable(),
  unit_price: z.string().nullable(),
  // Read from the printed pump label ("ĐAKNONG 1 / TRỤ 1 – DO") when visible — the
  // station label routes the visit, the fuel beats inferring from a contract price.
  station_label: z.string().nullable().optional(),
  dispenser_label: z.string().nullable().optional(),
  fuel_type: z.string().nullable().optional(),
  confidence: z.object({
    liters: z.number(),
    unit_price: z.number(),
    amount: z.number(),
  }),
  notes: z.string().optional().default(''),
})
export type DebtMeterResult = z.infer<typeof debtMeterSchema>

export const vehiclePlateSchema = z.object({
  plate: z.string(),
  confidence: z.number(),
  notes: z.string().optional().default(''),
})
export type VehiclePlateResult = z.infer<typeof vehiclePlateSchema>

// Normalized result of the debt-visit extraction pipeline.
export type ExtractVisitResult = {
  meterType: 'debt_meter' | 'unclear'
  displayedAmount: string | null
  liters: string | null
  unitPrice: string | null
  stationLabel: string | null
  dispenserLabel: string | null
  fuelType: string | null
  computedAmount: number | null
  amountMatchesDisplay: boolean | null
  litersConfidence: number | null
  unitPriceConfidence: number | null
  amountConfidence: number | null
  notes: string
  raw: unknown
}

export type ExtractPlateResult = {
  plate: string | null
  confidence: number
  notes: string
}

// === Tank dip (inventory / barem §12.6) ===
export const tankDipSchema = z.object({
  is_tank_dip: z.boolean(),
  station_label: z.string().nullable().optional(), // "DAKNONG1" printed above the tank label
  tank_label: z.string().nullable(), // "HẦM 3"
  tank_number: z.string().nullable(), // "3"
  fuel_type: z.string().nullable(), // "DO" | "E0" | "DC" | "XANG_A95" | "URE"
  capacity_k: z.number().nullable(), // tank capacity in thousands of liters (e.g. 25 = 25K)
  dip_value: z.string().nullable(), // raw measurement as shown (unit unknown until barem §12.6)
  ruler_present: z.boolean().optional().default(false),
  confidence: z.number(),
  notes: z.string().optional().default(''),
})
export type TankDipRaw = z.infer<typeof tankDipSchema>

export type ExtractTankDipResult = {
  stationLabel: string | null
  tankLabel: string | null
  tankNumber: string | null
  fuelType: string | null
  capacityK: number | null
  dipValue: string | null
  rulerPresent: boolean
  confidence: number
  notes: string
  raw: unknown
}
