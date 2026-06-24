import { callClaudeVision, parseJsonFromText } from '@/lib/ai/claude-vision'
import { prepareImageForAI } from '@/lib/ai/image-prep'
import { isAiMockEnabled, mockDelay } from '@/lib/ai/mock'
import { TANK_DIP_PROMPT } from '@/lib/ai/prompts'
import { type ExtractTankDipResult, tankDipSchema } from '@/lib/ai/types'

/**
 * Reads a tank-dip (barem) photo for physical stock: the tank label (HẦM number,
 * fuel, capacity) and the measurement value as shown. The dip-value -> liters
 * conversion needs the customer's barem table (§12.6) and is applied downstream.
 */
export async function extractTankDip(input: {
  imageBuffer?: Buffer | Uint8Array
}): Promise<ExtractTankDipResult> {
  if (isAiMockEnabled()) {
    await mockDelay()
    return {
      tankLabel: 'HẦM 3',
      tankNumber: '3',
      fuelType: 'DO',
      capacityK: 25,
      dipValue: '05....235',
      rulerPresent: true,
      confidence: 80,
      notes: 'mock tank dip',
      raw: { mock: true },
    }
  }
  if (!input.imageBuffer) {
    throw new Error('extractTankDip requires an imageBuffer when AI_MOCK is off')
  }

  const image = await prepareImageForAI(input.imageBuffer)
  const text = await callClaudeVision({ prompt: TANK_DIP_PROMPT, images: [image] })
  const parsed = tankDipSchema.parse(parseJsonFromText(text))

  return {
    tankLabel: parsed.tank_label,
    tankNumber: parsed.tank_number,
    fuelType: parsed.fuel_type,
    capacityK: parsed.capacity_k,
    dipValue: parsed.dip_value,
    rulerPresent: parsed.ruler_present,
    confidence: parsed.confidence,
    notes: parsed.notes,
    raw: parsed,
  }
}
