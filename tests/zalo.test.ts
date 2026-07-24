import { describe, expect, it } from 'vitest'

import { classifyZaloMessage, explicitCaptionKind, routePhoto } from '@/lib/zalo/classify'
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

describe('routePhoto', () => {
  it('routes by image content regardless of caption', () => {
    // A vehicle plate or a transaction display is always a debt fill.
    expect(routePhoto('vehicle', 'shift')).toBe('debt')
    expect(routePhoto('debt_meter', 'shift')).toBe('debt')
    // A HẦM tank-dip is inventory.
    expect(routePhoto('tank_dip', 'shift')).toBe('inventory')
    expect(routePhoto('tank_dip', 'debt')).toBe('inventory')
    // A cumulative totalizer is a shift reading.
    expect(routePhoto('electronic_meter', 'shift')).toBe('shift')
    expect(routePhoto('mechanical_meter', 'shift')).toBe('shift')
  })

  it('lets a debt caption override a meter-looking photo', () => {
    expect(routePhoto('electronic_meter', 'debt')).toBe('debt')
  })

  it('falls back to the caption when the image is ambiguous', () => {
    expect(routePhoto('label_only', 'shift')).toBe('shift')
    expect(routePhoto('label_only', 'debt')).toBe('debt')
    expect(routePhoto('not_relevant', 'shift')).toBe('shift')
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

describe('explicitCaptionKind', () => {
  it('declares debt for công nợ / xe captions', () => {
    expect(explicitCaptionKind('công nợ anh Ba')).toBe('debt')
    expect(explicitCaptionKind('cong no')).toBe('debt')
    expect(explicitCaptionKind('Xe 51B-12345')).toBe('debt')
  })
  it('declares shift for chốt ca captions (with or without diacritics)', () => {
    expect(explicitCaptionKind('chốt ca')).toBe('shift')
    expect(explicitCaptionKind('Chot ca ngay 24/7')).toBe('shift')
  })
  it('declares inventory for tồn kho / kiểm kê captions', () => {
    expect(explicitCaptionKind('tồn kho hầm 1')).toBe('inventory')
    expect(explicitCaptionKind('kiem ke')).toBe('inventory')
  })
  it('returns null when nothing explicit is declared', () => {
    expect(explicitCaptionKind(null)).toBeNull()
    expect(explicitCaptionKind('')).toBeNull()
    expect(explicitCaptionKind('gửi hình nhé')).toBeNull()
  })
})
