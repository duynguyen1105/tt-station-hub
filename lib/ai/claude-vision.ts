import Anthropic from '@anthropic-ai/sdk'

import { VISION_MODEL } from '@/lib/ai/prompts'

export type VisionImage = {
  base64: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
  }
  return client
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    const status = error.status
    return status === 429 || (typeof status === 'number' && status >= 500)
  }
  // Network/timeout errors are worth retrying.
  return true
}

const MAX_ATTEMPTS = 5

// Exponential backoff with random jitter. The jitter de-correlates retries when a
// burst of photos (e.g. all dispensers sent at once) hits the rate limit together,
// so they don't all wake up and collide again (thundering herd).
function backoffMs(attempt: number): number {
  return 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400)
}

/**
 * Sends one or more images plus a text prompt to Claude Vision and returns the
 * raw text response. Retries up to 5 times with jittered exponential backoff on
 * transient (429/5xx/network) errors.
 */
export async function callClaudeVision(params: {
  prompt: string
  images: VisionImage[]
  system?: string
  maxTokens?: number
}): Promise<string> {
  const { prompt, images, system, maxTokens = 1024 } = params

  const imageBlocks = images.map((image) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: image.mediaType,
      data: image.base64,
    },
  }))

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const message = await getClient().messages.create({
        model: VISION_MODEL,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [
          {
            role: 'user',
            content: [...imageBlocks, { type: 'text' as const, text: prompt }],
          },
        ],
      })

      const textParts: string[] = []
      for (const block of message.content) {
        if (block.type === 'text') textParts.push(block.text)
      }
      return textParts.join('\n').trim()
    } catch (error) {
      lastError = error
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) break
      await sleep(backoffMs(attempt))
    }
  }

  throw lastError
}

/**
 * Extracts a JSON object from a model response that may wrap it in prose or
 * ```json fences. Throws if no valid JSON object is found.
 */
export function parseJsonFromText<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const json = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
  return JSON.parse(json) as T
}
