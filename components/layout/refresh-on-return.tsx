'use client'

import { useEffect } from 'react'

import { useRouter } from 'next/navigation'

/** The tabs of this app tell each other a write landed on this channel. */
const SAVED_CHANNEL = 'tt-station-hub:saved'

/**
 * How long a tab must have been away before coming back re-reads the server. A quick
 * alt-tab should not re-run a screen like Hàng tồn, whose Barem is a live ~1s fetch.
 */
const AWAY_MS = 15_000

/**
 * Tells this browser's other open tabs that a write landed, so a hầm converted in Cấu
 * hình shows on the Hàng tồn open beside it. A tab never hears its own message — the
 * saving tab refreshes itself, once, through `useSaveAction`.
 */
export function announceSaved() {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(SAVED_CHANNEL)
  channel.postMessage(null)
  channel.close()
}

/**
 * Keeps an open screen from sitting on data the server has moved past, without a
 * websocket. A tab re-reads its RSC payload when:
 * - another tab of this browser saved something (`announceSaved`) — at once if this tab
 *   is showing, else as soon as it is shown again;
 * - it comes back after being away longer than AWAY_MS, which is how a change made by
 *   someone else, or by the Zalo ingest, reaches a screen left open.
 *
 * `router.refresh()` keeps client state, so a half-typed form survives it.
 */
export function RefreshOnReturn() {
  const router = useRouter()

  useEffect(() => {
    // When the tab was hidden or lost focus; null while the person is on it.
    let leftAt: number | null = null
    // Another tab saved while this one was hidden.
    let stale = false

    function refresh() {
      stale = false
      leftAt = null
      router.refresh()
    }

    function leave() {
      leftAt ??= Date.now()
    }

    // Coming back fires both `visibilitychange` and `focus`; the first one resets
    // `leftAt`, so the second finds nothing to do and the screen refreshes once.
    function arrive() {
      if (stale || (leftAt !== null && Date.now() - leftAt > AWAY_MS)) refresh()
      else leftAt = null
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') leave()
      else arrive()
    }

    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SAVED_CHANNEL)
    if (channel) {
      channel.onmessage = () => {
        if (document.visibilityState === 'visible') refresh()
        else stale = true
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', leave)
    window.addEventListener('focus', arrive)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', leave)
      window.removeEventListener('focus', arrive)
      channel?.close()
    }
  }, [router])

  return null
}
