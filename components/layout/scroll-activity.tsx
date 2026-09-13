'use client'

import { useEffect } from 'react'

const IDLE_MS = 800

/**
 * Marks whichever element is scrolling with `data-scrolling`, cleared once it has
 * been still for IDLE_MS. globals.css keeps scrollbars transparent except on a
 * marked element, so bars show only while scrolling — even when the OS is set to
 * always show them.
 */
export function ScrollActivity() {
  useEffect(() => {
    const timers = new Map<Element, number>()

    function onScroll(event: Event) {
      const target = event.target === document ? document.documentElement : event.target
      if (!(target instanceof Element)) return
      target.setAttribute('data-scrolling', '')
      window.clearTimeout(timers.get(target))
      timers.set(
        target,
        window.setTimeout(() => {
          target.removeAttribute('data-scrolling')
          timers.delete(target)
        }, IDLE_MS)
      )
    }

    // Scroll events don't bubble, so listen in the capture phase to see every scroller.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  return null
}
