'use client'

import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Toaster } from 'sonner'

export function ClientToaster() {
  return (
    <Toaster
      position="top-right"
      offset={{ top: 20, right: 20 }}
      richColors
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <CircleAlert className="size-4" />,
        loading: <LoaderCircle className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'group toast group-[.toaster]:rounded-xl group-[.toaster]:shadow-lg',
          title: 'group-[.toast]:text-sm group-[.toast]:font-medium',
          description: 'group-[.toast]:text-sm group-[.toast]:opacity-90',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
    />
  )
}
