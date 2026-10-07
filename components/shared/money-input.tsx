'use client'

import * as React from 'react'

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { caretAfterDigits, groupMoney, moneyDigits } from '@/lib/format'

type MoneyInputProps = Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'inputMode' | 'ref'
> & {
  /** The plain amount, e.g. "29710" (a grouped string is accepted too). */
  value: string
  /** Called with the plain amount — digits only, plus a leading "-" if allowed. */
  onValueChange: (value: string) => void
  allowNegative?: boolean
}

/**
 * A VND amount field: shows "29,710 đ" while the user types, hands back "29710".
 * The caret stays put as the commas move.
 */
export function MoneyInput({
  value,
  onValueChange,
  allowNegative = false,
  ...props
}: MoneyInputProps) {
  const ref = React.useRef<HTMLInputElement>(null)
  const pendingCaret = React.useRef<number | null>(null)
  const display = groupMoney(value)

  React.useLayoutEffect(() => {
    const input = ref.current
    const count = pendingCaret.current
    pendingCaret.current = null
    if (count === null || !input || document.activeElement !== input) return
    const pos = caretAfterDigits(display, count)
    input.setSelectionRange(pos, pos)
  })

  return (
    <InputGroup>
      <InputGroupInput
        {...props}
        ref={ref}
        inputMode={allowNegative ? 'text' : 'numeric'}
        autoComplete="off"
        value={display}
        onChange={(e) => {
          const typed = e.target.value
          const before = typed.slice(0, e.target.selectionStart ?? typed.length)
          pendingCaret.current = moneyDigits(before, allowNegative).length
          onValueChange(moneyDigits(typed, allowNegative))
        }}
      />
      <InputGroupAddon align="inline-end">đ</InputGroupAddon>
    </InputGroup>
  )
}
