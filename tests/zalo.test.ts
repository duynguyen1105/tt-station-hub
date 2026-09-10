import { describe, expect, it } from 'vitest'

import { pickStationByDeclaration, pickStationByLabel } from '@/lib/matching/station-label'
import {
  debtHalfFor,
  explicitCaptionKind,
  reconcilesAsPerFillDisplay,
  routeOpensShift,
  routePhoto,
} from '@/lib/zalo/classify'
import { computeZaloSignature, verifyZaloSignature } from '@/lib/zalo/signature'
import { parseZaloEvent, parseZaloTextEvent } from '@/lib/zalo/webhook-handler'

describe('routePhoto', () => {
  it('routes by image content when nothing is declared', () => {
    // A vehicle plate or a transaction display is always a debt fill.
    expect(routePhoto('vehicle', null)).toBe('debt')
    expect(routePhoto('debt_meter', null)).toBe('debt')
    // A HẦM tank-dip is inventory.
    expect(routePhoto('tank_dip', null)).toBe('inventory')
    // A cumulative totalizer is a shift reading.
    expect(routePhoto('electronic_meter', null)).toBe('shift')
    expect(routePhoto('mechanical_meter', null)).toBe('shift')
    // Ambiguous or unclassified photos default to shift.
    expect(routePhoto('label_only', null)).toBe('shift')
    expect(routePhoto('not_relevant', null)).toBe('shift')
    expect(routePhoto(null, null)).toBe('shift')
  })

  it('the caption on this message is authoritative over the image', () => {
    expect(routePhoto('electronic_meter', 'debt')).toBe('debt')
    expect(routePhoto('label_only', 'debt')).toBe('debt')
    expect(routePhoto('tank_dip', 'debt')).toBe('debt')
    expect(routePhoto('debt_meter', 'shift')).toBe('shift')
    expect(routePhoto(null, 'inventory')).toBe('inventory')
    // ...and over a remembered declaration.
    expect(routePhoto('electronic_meter', 'shift', 'debt')).toBe('shift')
  })
})

describe('debtHalfFor', () => {
  it('names the half for the two clear images and the totalizer look-alikes', () => {
    expect(debtHalfFor('vehicle')).toBe('vehicle')
    expect(debtHalfFor('debt_meter')).toBe('debt_meter')
    expect(debtHalfFor('electronic_meter')).toBe('debt_meter')
    expect(debtHalfFor('mechanical_meter')).toBe('debt_meter')
  })

  it('never makes a pump half out of a label, a tank plate, or nothing', () => {
    // The regression: a "DAKNONG5 HẦM 1" plate sent under "công nợ" became a fake
    // pump half, stole the real pump photo's pairing slot and moved the visit's trạm.
    expect(debtHalfFor('label_only')).toBeNull()
    expect(debtHalfFor('tank_dip')).toBeNull()
    expect(debtHalfFor('not_relevant')).toBeNull()
    expect(debtHalfFor(null)).toBeNull()
  })
})

describe('reconcilesAsPerFillDisplay', () => {
  const base = {
    displayedAmount: '1193680',
    liters: '43.00',
    litersResolved: 43,
    litersResolution: 'verified' as const,
    unitPrice: '27760',
    stationLabel: null,
    dispenserLabel: null,
    fuelType: null,
    computedAmount: 1193680,
    litersConfidence: 90,
    unitPriceConfidence: 90,
    amountConfidence: 90,
    notes: '',
    raw: {},
  }

  it('accepts a debt display whose three lines add up', () => {
    expect(
      reconcilesAsPerFillDisplay({ ...base, meterType: 'debt_meter', amountMatchesDisplay: true })
    ).toBe(true)
  })

  it('rejects a totalizer (nothing to reconcile) and an unclear frame', () => {
    expect(
      reconcilesAsPerFillDisplay({ ...base, meterType: 'debt_meter', amountMatchesDisplay: null })
    ).toBe(false)
    expect(
      reconcilesAsPerFillDisplay({ ...base, meterType: 'debt_meter', amountMatchesDisplay: false })
    ).toBe(false)
    expect(
      reconcilesAsPerFillDisplay({ ...base, meterType: 'unclear', amountMatchesDisplay: true })
    ).toBe(false)
  })
})

describe('routeOpensShift', () => {
  it('opens the day’s ca for the first ảnh trụ bơm, as it always has', () => {
    expect(routeOpensShift('shift')).toBe(true)
  })

  it('opens the day’s ca for an ảnh công nợ too', () => {
    // A morning of bán nợ before any meter photo used to produce lượt xe with no
    // ca to live in; the first photo of the day now opens the ca whichever it is.
    expect(routeOpensShift('debt')).toBe(true)
  })

  it('opens no ca for an ảnh nhập hàng', () => {
    expect(routeOpensShift('inventory')).toBe(false)
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

describe('parseZaloTextEvent', () => {
  it('extracts a text-only declaration message', () => {
    const parsed = parseZaloTextEvent({
      event_name: 'user_send_text',
      sender: { id: 'user-1' },
      message: { msg_id: 'm1', text: 'chốt ca daknong1' },
      timestamp: '1755000000000',
    })
    expect(parsed).toEqual({
      senderId: 'user-1',
      text: 'chốt ca daknong1',
      timestamp: 1755000000000,
    })
  })

  it('returns null for image messages (those go through parseZaloEvent)', () => {
    expect(
      parseZaloTextEvent({
        sender: { id: 'user-1' },
        message: {
          msg_id: 'm2',
          text: 'chốt ca',
          attachments: [{ type: 'image', payload: { url: 'https://x/img.jpg' } }],
        },
      })
    ).toBeNull()
  })

  it('returns null without text or sender', () => {
    expect(
      parseZaloTextEvent({ sender: { id: 'u' }, message: { msg_id: 'm', text: '  ' } })
    ).toBeNull()
    expect(parseZaloTextEvent({ message: { msg_id: 'm', text: 'chốt ca' } })).toBeNull()
    expect(parseZaloTextEvent(null)).toBeNull()
  })
})

describe('station declared in a message text', () => {
  // The forward flow: "chốt ca daknong1" typed by the accountant must resolve
  // to the station even with diacritics, spacing, or zero-padding variants.
  const STATIONS = [
    { id: '1', code: 'DAKNONG1', name: 'Trạm Đăk Nông 1' },
    { id: '2', code: 'DAKNONG2', name: 'Đắk Nông 2' },
    { id: '3', code: 'NGANHA01', name: 'Ngân Hà 01' },
    { id: '4', code: 'NGUYENVUONG', name: 'Nguyên Vượng' },
  ]

  it('finds the station code inside a declaration text', () => {
    expect(pickStationByLabel('chốt ca daknong1', STATIONS)?.code).toBe('DAKNONG1')
    expect(pickStationByLabel('Chốt ca Đăk Nông 2', STATIONS)?.code).toBe('DAKNONG2')
    expect(pickStationByLabel('chốt ca nganha01', STATIONS)?.code).toBe('NGANHA01')
    expect(pickStationByLabel('công nợ nguyên vượng', STATIONS)?.code).toBe('NGUYENVUONG')
  })

  it('finds no station when the text only declares the kind', () => {
    expect(pickStationByLabel('chốt ca', STATIONS)).toBeNull()
    expect(pickStationByLabel('công nợ', STATIONS)).toBeNull()
  })
})

describe('pickStationByDeclaration', () => {
  const STATIONS = [
    { id: '1', code: 'DAKNONG1', name: 'Trạm Đăk Nông 1' },
    { id: '2', code: 'DAKNONG2', name: 'Đắk Nông 2' },
    { id: '3', code: 'NGANHA01', name: 'Ngân Hà 01' },
    { id: '4', code: 'LAMDONG01', name: 'Lâm Đồng 1' },
    { id: '5', code: 'NGUYENVUONG', name: 'Nguyên Vượng' },
  ]

  it('accepts spacing/diacritic/zero-padding variants', () => {
    expect(pickStationByDeclaration('daknong 1', STATIONS)?.code).toBe('DAKNONG1')
    expect(pickStationByDeclaration('dak nông  1', STATIONS)?.code).toBe('DAKNONG1')
    expect(pickStationByDeclaration('chốt ca dak nong 01', STATIONS)?.code).toBe('DAKNONG1')
    expect(pickStationByDeclaration('chốt ca lâm đồng 1', STATIONS)?.code).toBe('LAMDONG01')
  })

  it('tolerates one typo in the letters, digits exact', () => {
    expect(pickStationByDeclaration('chốt ca daknog 1', STATIONS)?.code).toBe('DAKNONG1')
    expect(pickStationByDeclaration('chốt ca dăk nôg 2', STATIONS)?.code).toBe('DAKNONG2')
    expect(pickStationByDeclaration('công nợ nganha 01', STATIONS)?.code).toBe('NGANHA01')
    expect(pickStationByDeclaration('chốt ca nguyen vuog', STATIONS)?.code).toBe('NGUYENVUONG')
  })

  it('never lets a typo cross the digit — no station swap', () => {
    // "daknong 9" is one edit from both DAKNONG1 and DAKNONG2; digits refuse it.
    expect(pickStationByDeclaration('chốt ca daknong 9', STATIONS)).toBeNull()
    // No digit at all cannot fuzzy-match a digit-carrying code.
    expect(pickStationByDeclaration('chốt ca daknong', STATIONS)).toBeNull()
  })

  it('refuses short or empty candidates', () => {
    expect(pickStationByDeclaration('chốt ca', STATIONS)).toBeNull()
    expect(pickStationByDeclaration('chốt ca 1', STATIONS)).toBeNull()
  })
})

describe('đo bồn caption and remembered-kind fallback', () => {
  it('declares inventory for đo bồn / đo hầm captions', () => {
    expect(explicitCaptionKind('đo bồn')).toBe('inventory')
    expect(explicitCaptionKind('do bon ham 2')).toBe('inventory')
    expect(explicitCaptionKind('đo hầm 3')).toBe('inventory')
  })

  it('a remembered debt kind never overrides a clear image classification', () => {
    // The regression: a "công nợ" text minutes earlier turned tank-dip photos
    // into empty debt visits. The remembered kind must lose to the router.
    expect(routePhoto('tank_dip', null, 'debt')).toBe('inventory')
    expect(routePhoto('vehicle', null, 'inventory')).toBe('debt')
    expect(routePhoto('debt_meter', null, 'shift')).toBe('debt')
  })

  it('a remembered kind still decides the genuinely ambiguous cases', () => {
    // Totalizer vs debt display is the one pair vision cannot separate.
    expect(routePhoto('electronic_meter', null, 'debt')).toBe('debt')
    expect(routePhoto('electronic_meter', null, 'inventory')).toBe('shift')
    // Unreadable or unclassified photos fall back to the declaration.
    expect(routePhoto('label_only', null, 'inventory')).toBe('inventory')
    expect(routePhoto('label_only', null, 'debt')).toBe('debt')
    expect(routePhoto(null, null, 'debt')).toBe('debt')
  })
})
