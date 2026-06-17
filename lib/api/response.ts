import { NextResponse } from 'next/server'

import { vi } from '@/messages/vi'

export function ok<T>(data: T) {
  return NextResponse.json({ data })
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 })
}

export function badRequest(message: string = vi.errors.generic, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 })
}

export function unauthorized() {
  return NextResponse.json({ error: vi.errors.unauthorized }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: vi.errors.unauthorized }, { status: 403 })
}

export function notFound() {
  return NextResponse.json({ error: vi.errors.notFound }, { status: 404 })
}
