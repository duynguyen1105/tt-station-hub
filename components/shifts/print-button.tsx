'use client'

import { PrinterIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { vi } from '@/messages/vi'

/**
 * In / Lưu PDF: the browser's own print dialog, laid out by the print rules in
 * globals.css. The tab's title is the PDF's file name, so it names the trạm and ngày
 * for as long as the dialog is open.
 */
export function PrintButton({ title }: { title: string }) {
  return (
    <Button
      variant="outline"
      onClick={() => {
        const previous = document.title
        document.title = title
        window.addEventListener('afterprint', () => (document.title = previous), { once: true })
        window.print()
      }}
    >
      <PrinterIcon className="size-4" />
      {vi.shifts.print}
    </Button>
  )
}
