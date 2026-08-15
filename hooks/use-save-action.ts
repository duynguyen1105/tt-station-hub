'use client'

import { toast } from 'sonner'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { vi } from '@/messages/vi'

type SaveInit = {
  method?: 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Toast shown on a 2xx. Omit for writes that speak through the UI instead. */
  success?: string
}

type SaveHandlers = {
  /** Runs with the refresh, inside the transition — close dialogs, reset fields. */
  onSuccess?: () => void
  /** Runs before the error toast — roll back optimistic state here. */
  onError?: () => void
}

/**
 * Fires a mutation and the RSC refresh that follows it inside one transition, so
 * `busy` spans the whole round-trip — from the click until the fresh server data
 * commits. Clearing a plain useState flag when the fetch resolves instead
 * re-enables the control while the screen is still showing stale values.
 *
 * Generalises the hand-rolled version in components/shifts/reading-row.tsx.
 */
export function useSaveAction() {
  const router = useRouter()
  const [busy, startTransition] = useTransition()

  function save(url: string, init: SaveInit = {}, handlers: SaveHandlers = {}) {
    startTransition(async () => {
      // fetch rejects outright when the network is down, so the failure path has to
      // cover that too — otherwise an optimistic value would stick with no toast.
      const res = await fetch(url, {
        method: init.method ?? 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }).catch(() => null)

      if (!res?.ok) {
        const message = await res
          ?.json()
          .then((data) => (data as { error?: string }).error)
          .catch(() => undefined)
        handlers.onError?.()
        toast.error(message ?? vi.errors.generic)
        return
      }

      if (init.success) toast.success(init.success)
      // A state update after an `await` no longer belongs to the transition that
      // started it, so the refresh needs its own — that is what keeps `busy` true
      // until the fresh RSC payload commits instead of dropping it here.
      startTransition(() => {
        handlers.onSuccess?.()
        router.refresh()
      })
    })
  }

  return { busy, save }
}
