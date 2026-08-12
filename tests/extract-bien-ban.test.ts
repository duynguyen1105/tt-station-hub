import { describe, expect, it } from 'vitest'

import { normalizeBienBan } from '@/lib/ai/extract-bien-ban'
import { BIEN_BAN_PROMPT } from '@/lib/ai/prompts'
import { bindTankLabels, parsePaperLabel } from '@/lib/imports/binding-ladder'
import { rosterForStation } from '@/lib/imports/station-rosters'
import handwritten from '@/test-fixtures/bien-ban/old-format-handwritten.json'
import printed from '@/test-fixtures/bien-ban/old-format-printed.json'

// A biên bản chuẩn as the model returns it: four fixed goods columns, the seal in
// one merged cell, and Hầm/Trụ rows printed without the word HẦM. The row labels
// deliberately mix the printed dialects — `1. DO   15K` (11 forms) beside
// `2.E0 - 12K` (LAMDONG01) — while the fuels and capacities are DAKNONG2's, so
// the same rows can be put to that Trạm's roster below.
const standardForm = {
  station_name: 'CỬA HÀNG BÁN LẺ XĂNG DẦU TRƯỜNG THỊNH SỐ 2 (DAKNONG2)',
  receipt_date: '2026-08-10',
  staff_name: null,
  driver_name: null,
  truck_plate: '60H-20450',
  seal_no: 'F821022 - F821019, niêm chì còn nguyên',
  products: [
    {
      product_label: 'E0',
      warehouse: 'SG Petro',
      quantity_liters: '6.000',
      export_slip_no: '0029151',
      seal_no: null,
    },
    {
      product_label: 'DO',
      warehouse: 'SG Petro',
      quantity_liters: '4.000',
      export_slip_no: '0029152',
      seal_no: null,
    },
  ],
  compartments: [
    { compartment_no: 1, liters: '6.000', valve_position: '-2', temperature_c: '34,5' },
  ],
  vehicle_check: 'Bình thường',
  tanks: [
    {
      tank_label: '1. DO   15K',
      before: { temperature_c: '34,5', height_mm: 645, barem_liters: '141.008,78' },
      after: { height_mm: 1410, temperature_c: '35,5', barem_liters: '259.799,74' },
    },
    {
      tank_label: '2.E0 - 12K',
      before: { height_mm: 520 },
      after: { height_mm: 1120 },
    },
    { tank_label: '3. E0   10K', before: { height_mm: 900 }, after: { height_mm: 900 } },
  ],
  pumps: [
    { pump_label: '1- DO', before: { electronic: '82118,87' }, after: { electronic: '82118,87' } },
    { pump_label: '2- E0', before: { mechanical: '494,071' }, after: { mechanical: '494,071' } },
  ],
  note: 'Không có sự cố',
  confidence: 92,
}

describe('BIEN_BAN_PROMPT describes both forms', () => {
  it('names the four fixed goods columns and the merged seal cell', () => {
    expect(BIEN_BAN_PROMPT).toContain('"E0 | EA | DO | DC"')
    expect(BIEN_BAN_PROMPT).toContain('Số niêm chì tương ứng và tình trạng niêm chì')
    expect(BIEN_BAN_PROMPT).toContain('ONE MERGED cell')
  })

  it('shows all three Hầm dialects and both Trụ dialects', () => {
    // `N. FUEL nnK` (11 forms), `N.FUEL - nnK` (LAMDONG01), `FUEL - nnK` (LAMDONG02)
    for (const dialect of ['1. DO', '2.E0 - 12K', 'DC - 9K', '1- DO']) {
      expect(BIEN_BAN_PROMPT).toContain(dialect)
    }
  })

  it('still describes the old free-form sheet', () => {
    for (const old of ['RON 95', 'E5 RON 92', 'DO 0.05S', 'HẦM 2 12K', 'TRỤ 1']) {
      expect(BIEN_BAN_PROMPT).toContain(old)
    }
  })

  it('asks for row labels verbatim and forbids inventing a number', () => {
    expect(BIEN_BAN_PROMPT).toContain('VERBATIM')
    expect(BIEN_BAN_PROMPT.toLowerCase()).toContain('never invent a number')
  })

  it('does not key on either wording of the Ghi chú line', () => {
    expect(BIEN_BAN_PROMPT).toContain('khi nhận')
    expect(BIEN_BAN_PROMPT).toContain('khi nhập')
  })
})

describe('normalizeBienBan on the standard form', () => {
  it('carries one seal for the whole biên bản', () => {
    const result = normalizeBienBan(standardForm)
    expect(result.sealNo).toBe('F821022 - F821019, niêm chì còn nguyên')
    expect(result.products.map((p) => p.sealNo)).toEqual([null, null])
  })

  it('keeps Hầm row labels verbatim, number, fuel and capacity intact', () => {
    const labels = normalizeBienBan(standardForm).tanks.map((t) => t.tankLabel)
    expect(labels).toEqual(['1. DO   15K', '2.E0 - 12K', '3. E0   10K'])
    expect(parsePaperLabel(labels[0]!)).toEqual({ number: 1, fuel: 'DO', capacityK: 15 })
    expect(parsePaperLabel(labels[1]!)).toEqual({ number: 2, fuel: 'E0', capacityK: 12 })
  })

  it('hands the binding ladder labels it can bind to the DAKNONG2 roster', () => {
    const roster = rosterForStation('DAKNONG2')!
    const labels = normalizeBienBan(standardForm).tanks.map((t) => t.tankLabel)
    expect(bindTankLabels(labels, roster.tanks)).toEqual([
      { bound: true, tankCode: 'HAM_1', verified: true },
      { bound: true, tankCode: 'HAM_2', verified: true },
      { bound: true, tankCode: 'HAM_3', verified: true },
    ])
  })

  it('keeps Trụ row labels verbatim', () => {
    expect(normalizeBienBan(standardForm).pumps.map((p) => p.pumpLabel)).toEqual(['1- DO', '2- E0'])
  })

  it('reads the four standard goods columns and Vietnamese numbers', () => {
    const result = normalizeBienBan(standardForm)
    expect(result.products.map((p) => [p.productLabel, p.quantityLiters])).toEqual([
      ['E0', 6000],
      ['DO', 4000],
    ])
    expect(result.tanks[0]!.before).toEqual({
      temperatureC: 34.5,
      heightMm: 645,
      bookLiters: null,
      baremLiters: 141008.78,
    })
    expect(result.tanks[0]!.after.temperatureC).toBe(35.5)
    expect(result.tanks[0]!.after.baremLiters).toBe(259799.74)
  })

  it('reads an unnumbered LAMDONG02 row without repairing it', () => {
    const result = normalizeBienBan({
      ...standardForm,
      tanks: [{ tank_label: 'DC - 9K', before: { height_mm: 300 }, after: { height_mm: 800 } }],
      pumps: [{ pump_label: 'DC', before: {}, after: {} }],
    })
    expect(result.tanks[0]!.tankLabel).toBe('DC - 9K')
    expect(parsePaperLabel(result.tanks[0]!.tankLabel)).toEqual({
      number: null,
      fuel: 'DC',
      capacityK: 9,
    })
    expect(result.pumps[0]!.pumpLabel).toBe('DC')
  })

  it('keeps a goods column outside the standard four rather than dropping it', () => {
    const result = normalizeBienBan({
      ...standardForm,
      products: [
        ...standardForm.products,
        {
          product_label: 'DO 0.001S',
          warehouse: 'SG Petro',
          quantity_liters: '2.000',
          export_slip_no: '0029153',
          seal_no: null,
        },
      ],
    })
    expect(result.products.map((p) => p.productLabel)).toEqual(['E0', 'DO', 'DO 0.001S'])
  })
})

describe('normalizeBienBan on the old free-form sheet', () => {
  // The two samples verified against real paper (Nguyên Vượng handwritten,
  // Phúc Tiến printed) must read exactly as they did before the standard form
  // was taught — the only new field is the biên bản-level seal, which old paper
  // does not carry.
  it('reads the handwritten sample as it always has', () => {
    expect(normalizeBienBan(handwritten)).toEqual({
      stationName: 'Nguyên Vượng',
      receiptDate: '2025-07-14',
      staffName: null,
      driverName: null,
      truckPlate: '60H-20450',
      vehicleCheck: 'Bình thường',
      note: null,
      sealNo: null,
      confidence: 88,
      products: [
        {
          productLabel: 'RON 95',
          warehouse: 'SG Petro',
          quantityLiters: 6000,
          exportSlipNo: '0029151',
          sealNo: 'F821022 - F821019',
        },
        {
          productLabel: 'DO 0.05S',
          warehouse: 'SG Petro',
          quantityLiters: 4000,
          exportSlipNo: '0029152',
          sealNo: 'F821020',
        },
      ],
      compartments: [
        {
          compartmentNo: 4,
          liters: 6000,
          valvePosition: '-2',
          compensationLiters: null,
          temperatureC: 38,
        },
      ],
      tanks: [
        {
          tankLabel: 'HẦM 2 12K',
          before: { temperatureC: null, heightMm: 645, bookLiters: null, baremLiters: null },
          after: { temperatureC: null, heightMm: 1410, bookLiters: null, baremLiters: null },
        },
      ],
      pumps: [
        {
          pumpLabel: 'TRỤ 1',
          before: { electronic: 109622, mechanical: 494071 },
          after: { electronic: 109745, mechanical: 494194 },
        },
        {
          pumpLabel: 'TRỤ 2',
          before: { electronic: 226760, mechanical: 1037500 },
          after: { electronic: 226884, mechanical: 1037624 },
        },
      ],
    })
  })

  it('reads the printed sample as it always has, decimals included', () => {
    const result = normalizeBienBan(printed)
    expect(result.sealNo).toBeNull()
    expect(result.products[0]!.sealNo).toBe('F821101 - F821104')
    expect(result.compartments[0]!.temperatureC).toBe(34.5)
    expect(result.compartments[0]!.valvePosition).toBe('+0,5')
    expect(result.tanks.map((t) => t.tankLabel)).toEqual(['HẦM 1 XA', 'HẦM 2 DC', 'HẦM 3 DO'])
    // Every side and column differs from its neighbour, so a before/after or
    // Điện/Cơ swap fails here rather than passing on equal numbers.
    expect(result.tanks[0]!.before.baremLiters).toBe(141008.78)
    expect(result.tanks[0]!.after.baremLiters).toBe(259799.74)
    expect(result.pumps[0]!.before).toEqual({ electronic: 82118.87, mechanical: 407455 })
    expect(result.pumps[0]!.after).toEqual({ electronic: 82130.5, mechanical: 407467 })
    expect(result.pumps[1]!.before).toEqual({ electronic: 407455.7, mechanical: 259799 })
    expect(result.pumps[1]!.after).toEqual({ electronic: 407460.2, mechanical: 259804 })
  })
})
