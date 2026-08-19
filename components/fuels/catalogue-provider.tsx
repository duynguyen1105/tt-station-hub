'use client'

import { createContext, useCallback, useContext, useMemo } from 'react'

import { type CatalogueFuel, fuelTypeLabelFrom, selectableFuels } from '@/lib/fuels/catalogue'

const FuelCatalogueContext = createContext<readonly CatalogueFuel[] | null>(null)

/**
 * Hands the danh mục to the client side. The dashboard layout reads it once per
 * request on the server and puts it here, so a client component that needs a tên
 * nhiên liệu — the công nợ visit card, the ca reading row, the kho movement form, the
 * phiếu nhập form, the giá kỳ dialog, the export preflight dialog — reads it from the
 * render rather than fetching it for itself.
 */
export function FuelCatalogueProvider({
  catalogue,
  children,
}: {
  catalogue: readonly CatalogueFuel[]
  children: React.ReactNode
}) {
  return <FuelCatalogueContext.Provider value={catalogue}>{children}</FuelCatalogueContext.Provider>
}

/**
 * The danh mục, every nhiên liệu of it — ngừng sử dụng ones included, because labels
 * resolve for those too. An ô chọn keeps only the active ones.
 */
export function useFuelCatalogue(): readonly CatalogueFuel[] {
  const catalogue = useContext(FuelCatalogueContext)
  if (!catalogue) {
    throw new Error('useFuelCatalogue must be used inside a FuelCatalogueProvider')
  }
  return catalogue
}

/**
 * The client side's form of the label helper: the same `fuelTypeLabelFrom` a server
 * component calls, already carrying the danh mục from the provider.
 */
export function useFuelTypeLabel(): (fuelType: string) => string {
  const catalogue = useFuelCatalogue()
  return useCallback((fuelType: string) => fuelTypeLabelFrom(catalogue, fuelType), [catalogue])
}

/**
 * The danh mục an ô chọn offers — the nhiên liệu Trường Thịnh still sells. The client
 * side's form of `selectableFuels`, so the kho movement form, the phiếu nhập form and
 * the công nợ picker all draw the same list and a nhiên liệu đã ngừng leaves every one
 * of them at once.
 */
export function useSelectableFuels(): readonly CatalogueFuel[] {
  const catalogue = useFuelCatalogue()
  return useMemo(() => selectableFuels(catalogue), [catalogue])
}
