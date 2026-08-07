import { z } from 'zod'

import { callClaudeVision, parseJsonFromText } from '@/lib/ai/claude-vision'
import { prepareImageForAI } from '@/lib/ai/image-prep'
import { BIEN_BAN_PROMPT } from '@/lib/ai/prompts'
import { type BienBanExtraction, parseVnNumber } from '@/lib/imports/bien-ban'

// The model is told to emit plain numbers, but hard handwriting sometimes gets
// echoed verbatim ("6.000") — accept both and funnel through parseVnNumber.
const num = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value) => parseVnNumber(value ?? null))

const str = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined) return null
    const text = String(value).trim()
    return text === '' ? null : text
  })

const sideSchema = z
  .object({
    temperature_c: num,
    height_mm: num,
    book_liters: num,
    barem_liters: num,
  })
  .partial()

const rawSchema = z.object({
  station_name: str,
  receipt_date: str,
  staff_name: str,
  driver_name: str,
  truck_plate: str,
  vehicle_check: str,
  note: str,
  confidence: num,
  products: z
    .array(
      z.object({
        product_label: str,
        warehouse: str,
        quantity_liters: num,
        export_slip_no: str,
        seal_no: str,
      })
    )
    .default([]),
  compartments: z
    .array(
      z.object({
        compartment_no: num,
        liters: num,
        valve_position: str,
        compensation_liters: num,
        temperature_c: num,
      })
    )
    .default([]),
  tanks: z
    .array(
      z.object({ tank_label: str, before: sideSchema.default({}), after: sideSchema.default({}) })
    )
    .default([]),
  pumps: z
    .array(
      z.object({
        pump_label: str,
        before: z.object({ electronic: num, mechanical: num }).partial().default({}),
        after: z.object({ electronic: num, mechanical: num }).partial().default({}),
      })
    )
    .default([]),
})

function side(raw: z.infer<typeof sideSchema>) {
  return {
    temperatureC: raw.temperature_c ?? null,
    heightMm: raw.height_mm ?? null,
    bookLiters: raw.book_liters ?? null,
    baremLiters: raw.barem_liters ?? null,
  }
}

/** Reads the biên bản photo(s) with Claude Vision and returns the normalized extraction. */
export async function extractBienBan(
  imageBuffers: (Buffer | Uint8Array)[]
): Promise<BienBanExtraction> {
  const images = await Promise.all(imageBuffers.map((buffer) => prepareImageForAI(buffer)))
  const text = await callClaudeVision({
    prompt: BIEN_BAN_PROMPT,
    images,
    // The full form is dense: 4 sections of tables can exceed the default budget.
    maxTokens: 4096,
  })
  const raw = rawSchema.parse(parseJsonFromText(text))

  return {
    stationName: raw.station_name,
    receiptDate: raw.receipt_date,
    staffName: raw.staff_name,
    driverName: raw.driver_name,
    truckPlate: raw.truck_plate,
    vehicleCheck: raw.vehicle_check,
    note: raw.note,
    confidence: raw.confidence ?? 0,
    products: raw.products
      .filter((p) => p.product_label !== null)
      .map((p) => ({
        productLabel: p.product_label!,
        warehouse: p.warehouse,
        quantityLiters: p.quantity_liters,
        exportSlipNo: p.export_slip_no,
        sealNo: p.seal_no,
      })),
    compartments: raw.compartments
      .filter((c) => c.compartment_no !== null)
      .map((c) => ({
        compartmentNo: c.compartment_no!,
        liters: c.liters,
        valvePosition: c.valve_position,
        compensationLiters: c.compensation_liters,
        temperatureC: c.temperature_c,
      })),
    tanks: raw.tanks
      .filter((t) => t.tank_label !== null)
      .map((t) => ({ tankLabel: t.tank_label!, before: side(t.before), after: side(t.after) })),
    pumps: raw.pumps.map((p) => ({
      pumpLabel: p.pump_label,
      before: { electronic: p.before.electronic ?? null, mechanical: p.before.mechanical ?? null },
      after: { electronic: p.after.electronic ?? null, mechanical: p.after.mechanical ?? null },
    })),
  }
}
