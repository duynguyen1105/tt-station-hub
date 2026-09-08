import { describe, expect, it } from 'vitest'

import {
  meterTypeRank,
  resolveDuplicateSlot,
  resolveReadingScale,
} from '@/lib/matching/duplicate-check'

describe('resolveDuplicateSlot', () => {
  const prior = { value: 128547, conf: 90, photoId: 'photo-1' }

  it('takes the new photo when the slot is empty', () => {
    const next = { value: 128547, conf: 85, photoId: 'photo-1' }
    expect(resolveDuplicateSlot({ value: null, conf: null, photoId: null }, next)).toEqual({
      ...next,
      mismatch: false,
    })
  })

  it('overwrites on re-ingest of the same photo', () => {
    const next = { value: 130000, conf: 95, photoId: 'photo-1' }
    expect(resolveDuplicateSlot(prior, next)).toEqual({ ...next, mismatch: false })
  })

  it('overwrites when the prior photo was unreadable', () => {
    const next = { value: 128547, conf: 80, photoId: 'photo-2' }
    expect(resolveDuplicateSlot({ value: null, conf: null, photoId: 'photo-1' }, next)).toEqual({
      ...next,
      mismatch: false,
    })
  })

  it('keeps the existing read when the duplicate is unreadable', () => {
    const result = resolveDuplicateSlot(prior, { value: null, conf: null, photoId: 'photo-2' })
    expect(result).toEqual({ ...prior, mismatch: false })
  })

  it('confirms an agreeing cross-check pair with the best confidence', () => {
    const result = resolveDuplicateSlot(prior, { value: 128547, conf: 97, photoId: 'photo-2' })
    expect(result).toEqual({ value: 128547, conf: 97, photoId: 'photo-1', mismatch: false })
  })

  it('reconciles a missed decimal dot (2 decimals) instead of flagging', () => {
    // The real DakNong2 Trụ 1 case: the Montech shows 187883.80 but its tiny
    // dot was lost (18788380), while the 3-line display reads 187883.
    const result = resolveDuplicateSlot(
      { value: 187883, conf: 90, photoId: 'photo-1' },
      { value: 18788380, conf: 92, photoId: 'photo-2' }
    )
    expect(result).toEqual({ value: 187883.8, conf: 92, photoId: 'photo-1', mismatch: false })
  })

  it('reconciles a missed decimal dot in either order', () => {
    const result = resolveDuplicateSlot(
      { value: 18788380, conf: 92, photoId: 'photo-1' },
      { value: 187883, conf: 90, photoId: 'photo-2' }
    )
    expect(result).toEqual({ value: 187883.8, conf: 92, photoId: 'photo-1', mismatch: false })
  })

  it('reconciles a missed dot against a correctly-read decimal value', () => {
    const result = resolveDuplicateSlot(
      { value: 187883.8, conf: 95, photoId: 'photo-1' },
      { value: 18788380, conf: 90, photoId: 'photo-2' }
    )
    expect(result).toEqual({ value: 187883.8, conf: 95, photoId: 'photo-1', mismatch: false })
  })

  it('reconciles a 3-decimal missed dot', () => {
    const result = resolveDuplicateSlot(
      { value: 187883, conf: 90, photoId: 'photo-1' },
      { value: 187883800, conf: 88, photoId: 'photo-2' }
    )
    expect(result).toEqual({ value: 187883.8, conf: 90, photoId: 'photo-1', mismatch: false })
  })

  it('confirms reads sharing the integer part, keeping the decimal-precise one', () => {
    // The 3-line LÍT row truncates to 187883 while the Montech reads 187883.80.
    const result = resolveDuplicateSlot(
      { value: 187883.8, conf: 88, photoId: 'photo-1' },
      { value: 187883, conf: 95, photoId: 'photo-2' }
    )
    expect(result).toEqual({ value: 187883.8, conf: 95, photoId: 'photo-1', mismatch: false })
  })

  it('flags a diverging pair and keeps the higher-confidence value', () => {
    // The real DakNong2 Trụ 2 case: 17143447 vs 1714979 fits neither the
    // missed-dot ×100/×1000 shape nor a shared integer part — a true misread.
    const result = resolveDuplicateSlot(prior, { value: 1714979, conf: 70, photoId: 'photo-2' })
    expect(result).toEqual({ value: 128547, conf: 90, photoId: 'photo-1', mismatch: true })
  })

  it('lets a more confident diverging duplicate win, still flagged', () => {
    const result = resolveDuplicateSlot(prior, { value: 128574, conf: 95, photoId: 'photo-2' })
    expect(result).toEqual({ value: 128574, conf: 95, photoId: 'photo-2', mismatch: true })
  })

  it('ties go to the newer photo', () => {
    const result = resolveDuplicateSlot(prior, { value: 128574, conf: 90, photoId: 'photo-2' })
    expect(result).toEqual({ value: 128574, conf: 90, photoId: 'photo-2', mismatch: true })
  })

  it('display rank beats confidence on a diverging pair (Montech over green3)', () => {
    // The real DakNong2 Trụ 2 case: the green 3-line display read garbage
    // (64936) at HIGHER confidence than the Montech's stable 17143447.
    const result = resolveDuplicateSlot(
      { value: 17143447, conf: 72, photoId: 'montech', rank: 2 },
      { value: 64936, conf: 82, photoId: 'green', rank: 1 }
    )
    expect(result).toEqual({ value: 17143447, conf: 72, photoId: 'montech', mismatch: true })
  })

  it('a trustworthy newer photo takes a slot held by a green3 read', () => {
    const result = resolveDuplicateSlot(
      { value: 64936, conf: 82, photoId: 'green', rank: 1 },
      { value: 17143447, conf: 72, photoId: 'montech', rank: 2 }
    )
    expect(result).toEqual({ value: 17143447, conf: 72, photoId: 'montech', mismatch: true })
  })

  it('green digits anchor the integer part of a dotless Montech read', () => {
    // The real DakNong2 Trụ 2 case the accountant confirmed: green LÍT shows
    // 171474 (tail misread), Montech shows 17143447 dotless — the first 4
    // green digits anchor the integer part → 171434.47.
    const result = resolveDuplicateSlot(
      { value: 17143447, conf: 78, photoId: 'montech', rank: 2 },
      { value: 171474, conf: 72, photoId: 'green', rank: 1 }
    )
    expect(result).toEqual({ value: 171434.47, conf: 78, photoId: 'montech', mismatch: false })
  })

  it('green anchor works in either arrival order', () => {
    const result = resolveDuplicateSlot(
      { value: 171474, conf: 72, photoId: 'green', rank: 1 },
      { value: 17143447, conf: 78, photoId: 'montech', rank: 2 }
    )
    expect(result).toEqual({ value: 171434.47, conf: 78, photoId: 'montech', mismatch: false })
  })

  it('green anchor supports 3 leftover decimal digits', () => {
    const result = resolveDuplicateSlot(
      { value: 128547926, conf: 80, photoId: 'montech', rank: 2 },
      { value: 128597, conf: 70, photoId: 'green', rank: 1 }
    )
    expect(result).toEqual({ value: 128547.926, conf: 80, photoId: 'montech', mismatch: false })
  })

  it('a green read that dropped its leading digit does NOT anchor', () => {
    // Trụ 4: green read 56865 (lost the leading 1 of 156065) — the leading
    // digits disagree, so no auto-correction; the pair stays flagged.
    const result = resolveDuplicateSlot(
      { value: 15606590, conf: 78, photoId: 'montech', rank: 2 },
      { value: 56865, conf: 72, photoId: 'green', rank: 1 }
    )
    expect(result).toEqual({ value: 15606590, conf: 78, photoId: 'montech', mismatch: true })
  })

  it('meterTypeRank puts only green3 below the other displays', () => {
    expect(meterTypeRank('electronic_green3')).toBeLessThan(meterTypeRank('electronic_montech'))
    expect(meterTypeRank('electronic_lungbor')).toBe(meterTypeRank('electronic_montech'))
    expect(meterTypeRank(null)).toBe(meterTypeRank('electronic_montech'))
  })
})

describe('resolveReadingScale', () => {
  const MAX = 20000

  it('trusts a dot the AI saw, whatever the opening says', () => {
    expect(resolveReadingScale('187883.8', 5000, MAX, null)).toEqual({
      value: 187883.8,
      rescaled: false,
    })
    expect(resolveReadingScale('187883.8', 187000, MAX, 2)).toEqual({
      value: 187883.8,
      rescaled: false,
    })
  })

  it('places the point by the trụ’s configured decimals, unflagged', () => {
    expect(resolveReadingScale('30694885', null, MAX, 3)).toEqual({
      value: 30694.885,
      rescaled: false,
    })
    expect(resolveReadingScale('18788380', 187000, MAX, 2)).toEqual({
      value: 187883.8,
      rescaled: false,
    })
    expect(resolveReadingScale('187883', 187000, MAX, 0)).toEqual({
      value: 187883,
      rescaled: false,
    })
  })

  it('infers the scale from the opening when nothing is configured, and flags it', () => {
    // Opening 30650.120: raw 30694885 → delta 30.6M (absurd); /10, /100 absurd
    // too; /1000 → 30694.885 → delta 44.765 (plausible).
    expect(resolveReadingScale('30694885', 30650.12, MAX, null)).toEqual({
      value: 30694.885,
      rescaled: true,
    })
    // LungBor with 2 decimals: 148465.34 read as 14846534.
    expect(resolveReadingScale('14846534', 148000, MAX, null)).toEqual({
      value: 148465.34,
      rescaled: true,
    })
  })

  it('prefers the smallest scale change — a plausible raw read is never touched', () => {
    expect(resolveReadingScale('18788380', 18780000, MAX, null)).toEqual({
      value: 18788380,
      rescaled: false,
    })
    // Both /10 (12000, +11000) and /100 (1200, +200) are plausible; the smaller change wins.
    expect(resolveReadingScale('120000', 1000, MAX, null)).toEqual({
      value: 12000,
      rescaled: true,
    })
  })

  it('keeps the raw read without an opening or when no scale is plausible', () => {
    expect(resolveReadingScale('18788380', null, MAX, null)).toEqual({
      value: 18788380,
      rescaled: false,
    })
    // Opening far above every scale: the meter was replaced, not misread.
    expect(resolveReadingScale('18788380', 50_000_000, MAX, null)).toEqual({
      value: 18788380,
      rescaled: false,
    })
    expect(resolveReadingScale(null, 187000, MAX, 2)).toEqual({ value: null, rescaled: false })
    expect(resolveReadingScale('', 187000, MAX, 2)).toEqual({ value: null, rescaled: false })
  })
})
