import { describe, expect, it } from 'vitest'

import { classifyZaloMessage } from '@/lib/zalo/classify'
import { computeZaloSignature, verifyZaloSignature } from '@/lib/zalo/signature'
import { parseZaloEvent } from '@/lib/zalo/webhook-handler'

describe('classifyZaloMessage', () => {
  it('defaults to shift, detects debt captions', () => {
    expect(classifyZaloMessage(null)).toBe('shift')
    expect(classifyZaloMessage('Trụ 1 ca sáng')).toBe('shift')
    expect(classifyZaloMessage('Xe Tiến Oanh')).toBe('debt')
    expect(classifyZaloMessage('cong no khach le')).toBe('debt')
  })
})

describe('parseZaloEvent', () => {
  it('extracts an image message', () => {
    const payload = {
      event_name: 'user_send_image',
      sender: { id: 'user-1' },
      message: {
        msg_id: 'msg-1',
        text: 'Xe Tiến Oanh',
        attachments: [{ type: 'image', payload: { url: 'https://zalo/img.jpg' } }],
      },
      timestamp: '1700000000000',
    }
    const msg = parseZaloEvent(payload)
    expect(msg).not.toBeNull()
    expect(msg?.imageUrls).toEqual(['https://zalo/img.jpg'])
    expect(msg?.senderId).toBe('user-1')
    expect(msg?.timestamp).toBe(1700000000000)
  })
  it('returns null when there are no images', () => {
    expect(parseZaloEvent({ sender: { id: 'u' }, message: { msg_id: 'm', text: 'hi' } })).toBeNull()
    expect(parseZaloEvent(null)).toBeNull()
  })
})

describe('Zalo signature', () => {
  it('verifies a correctly signed payload', () => {
    const sig = computeZaloSignature('app1', '{"a":1}', '123', 'secret')
    expect(
      verifyZaloSignature({
        appId: 'app1',
        rawData: '{"a":1}',
        timestamp: '123',
        secret: 'secret',
        signatureHeader: `mac=${sig}`,
      })
    ).toBe(true)
  })
  it('rejects a tampered payload', () => {
    const sig = computeZaloSignature('app1', '{"a":1}', '123', 'secret')
    expect(
      verifyZaloSignature({
        appId: 'app1',
        rawData: '{"a":2}',
        timestamp: '123',
        secret: 'secret',
        signatureHeader: `mac=${sig}`,
      })
    ).toBe(false)
  })
})
