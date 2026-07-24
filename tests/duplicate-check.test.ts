import { describe, expect, it } from 'vitest'

import { resolveDuplicateSlot } from '@/lib/matching/duplicate-check'

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

  it('flags a diverging pair and keeps the higher-confidence value', () => {
    // The real DakNong2 case: the same totalizer read as two different numbers.
    const result = resolveDuplicateSlot(prior, { value: 18788380, conf: 70, photoId: 'photo-2' })
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
})
