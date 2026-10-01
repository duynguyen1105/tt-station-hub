'use client'

import { toPng } from 'html-to-image'
import { ImageIcon } from 'lucide-react'
import { toast } from 'sonner'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { vi } from '@/messages/vi'

// iOS Safari refuses a canvas over ~16.7 million pixels; stay under it.
const MAX_PIXELS = 16_000_000

/**
 * Lưu ảnh: the phiếu chốt ca as one PNG — for whoever finds a picture easier than a PDF.
 * It wears the print look (globals.css, .sheet-export), is drawn at twice the screen's
 * resolution so it stays sharp when zoomed, and goes to the phone's share sheet (Zalo,
 * Lưu ảnh) where there is one, else downloads.
 */
export function SaveImageButton({ title }: { title: string }) {
  const [busy, setBusy] = useState(false)

  async function save() {
    const sheet = document.querySelector<HTMLElement>('main > div')
    if (!sheet) return
    setBusy(true)
    document.documentElement.classList.add('sheet-export')
    try {
      const { width, height } = sheet.getBoundingClientRect()
      const blob = await fetch(
        await toPng(sheet, {
          backgroundColor: '#ffffff',
          pixelRatio: Math.min(2, Math.sqrt(MAX_PIXELS / (width * height))),
          // The sheet is centred on screen by its margin, which would shift it off the
          // image's edge; on the image it sits at the left with a little white around it.
          style: { margin: '0', padding: '24px' },
          width: width + 48,
          height: height + 48,
          // Photos are hidden on the sheet anyway; skipping them avoids fetching each one.
          filter: (node) => !(node instanceof HTMLImageElement),
          skipFonts: true,
        })
      ).then((r) => r.blob())
      const file = new File([blob], `${title}.png`, { type: 'image/png' })
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title })
      } else {
        const url = URL.createObjectURL(file)
        const link = Object.assign(document.createElement('a'), { href: url, download: file.name })
        link.click()
        // Freed a little later: revoking at once can cancel a download still starting.
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
      }
    } catch (error) {
      // Closing the share sheet is not a failure.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error(vi.shifts.saveImageFailed)
      }
    } finally {
      document.documentElement.classList.remove('sheet-export')
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" onClick={save} loading={busy}>
      <ImageIcon className="size-4" />
      {vi.shifts.saveImage}
    </Button>
  )
}
