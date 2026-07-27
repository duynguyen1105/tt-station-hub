import { describe, expect, it } from 'vitest'

import { submitterKey } from '@/lib/matching/submitter'

describe('submitterKey', () => {
  it('names a Zalo sender', () => {
    expect(submitterKey('zalo', 'user-123')).toBe('zalo:user-123')
  })

  it('names a signed-in uploader', () => {
    expect(submitterKey('app', 'user-123')).toBe('app:user-123')
  })

  it('keeps the two doors apart when the ids happen to coincide', () => {
    expect(submitterKey('zalo', 'user-123')).not.toBe(submitterKey('app', 'user-123'))
  })

  it.each([null, undefined, '', '   '])('has no key for an absent submitter (%p)', (id) => {
    expect(submitterKey('zalo', id)).toBeNull()
  })
})
