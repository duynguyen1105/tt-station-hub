'use client'

import { useState } from 'react'

import { AccountantStationChecklist } from '@/components/accountants/accountant-station-checklist'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useSaveAction } from '@/hooks/use-save-action'
import type { StationWithHolders } from '@/lib/accountants/station-holders'
import { vi } from '@/messages/vi'

export type DetailAccountant = {
  id: string
  fullName: string
  /** Held in the email column, but it is a tên đăng nhập everywhere a person reads it. */
  username: string
  phone: string | null
}

/**
 * Everything about one kế toán that can be corrected, under one Lưu: họ tên, số
 * điện thoại and the trạm they are phụ trách of. One visit to a person is one
 * save, so the checklist is not a second form with a second button.
 *
 * The tên đăng nhập sits between them, shown and fixed — it is the identity the
 * person signs in with, held by the authentication system as well as here, so
 * changing it would mean writing to both with no transaction between them. It is
 * readOnly rather than disabled so the quản trị viên can still select it and read
 * it out over the phone.
 *
 * Nothing is checked here. The route's schema already names every rule in
 * Vietnamese and its refusal arrives as a toast, so restating them would only
 * give two sets of rules to keep in step.
 */
export function AccountantDetailForm({
  accountant,
  stations,
}: {
  accountant: DetailAccountant
  stations: readonly StationWithHolders[]
}) {
  const { busy, save } = useSaveAction()
  const [fullName, setFullName] = useState(accountant.fullName)
  const [phone, setPhone] = useState(accountant.phone ?? '')
  // Seeded from what the person is phụ trách of now, so an untouched checklist
  // saves the same assignment back.
  const [selected, setSelected] = useState<string[]>(() =>
    stations
      .filter((station) => station.heldBy.some((holder) => holder.id === accountant.id))
      .map((station) => station.id)
  )

  function submit() {
    save(`/api/users/${accountant.id}`, {
      method: 'PATCH',
      // The whole set the person is phụ trách of afterwards, not a diff: it is what
      // the checklist knows, and the later of two saves then wins outright instead
      // of leaving two half-applied diffs.
      body: { fullName: fullName.trim(), phone: phone.trim(), stationIds: selected },
      success: vi.accountants.updated,
    })
  }

  return (
    <div className="space-y-6">
      {/* Who they are on one side, what they are phụ trách of on the other: the
          checklist is as long as there are trạm, and stacked under three short
          inputs it pushed the one Lưu below the fold. */}
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="acc-full-name">{vi.accountants.fullName}</FieldLabel>
            <Input
              id="acc-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="acc-username">{vi.accountants.username}</FieldLabel>
            <Input
              id="acc-username"
              readOnly
              className="text-muted-foreground"
              value={accountant.username}
            />
            <FieldDescription>{vi.accountants.usernameLocked}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="acc-phone">{vi.accountants.phone}</FieldLabel>
            <Input
              id="acc-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        </div>
        <AccountantStationChecklist
          stations={stations}
          selected={selected}
          onChange={setSelected}
        />
      </div>
      {/* Ruled off rather than trailing the last field: with two columns there is
          no last field to trail, and the one Lưu covers both of them. */}
      <div className="flex justify-end border-t pt-4">
        <Button onClick={submit} loading={busy}>
          {vi.common.save}
        </Button>
      </div>
    </div>
  )
}
