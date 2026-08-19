import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow the dev server (HMR + /_next assets) to be reached through ngrok tunnels
  // when testing on a phone. Dev-only; has no effect on production builds.
  allowedDevOrigins: ['*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.app', '*.ngrok.io'],

  experimental: {
    // The station tabs (Tổng quan / Chốt ca / Giấy tờ / Hàng tồn / Công nợ / Cấu hình)
    // are separate routes, so switching tabs unmounts the segment and refetches
    // everything. Dynamic pages get a 0s client cache by default, so even going
    // back to a tab visited a second ago re-ran its Prisma queries and flashed
    // loading.tsx. 30s of reuse makes that return navigation instant.
    //
    // In Next 16 this feeds the BFCache, which `createCacheNodeForSegment` reads
    // on a regular navigation: a fresh entry short-circuits with
    // `needsDynamicRequest: false`, so no request is made at all.
    //
    // Writes stay correct: router.refresh() (called after every mutation here)
    // bumps a *global* cache version, invalidating every route rather than just
    // the current one. Only changes made elsewhere — another user, or the Zalo
    // photo ingest — can be up to 30s stale.
    //
    // Only observable in a production build: prefetching is disabled in `next dev`
    // and every HMR update calls invalidateBfCache().
    //
    // `static` is deliberately left unset — its default (300s) is already higher
    // than anything we'd pick, and it also feeds the default cacheLife profile.
    staleTimes: {
      dynamic: 30,
    },
  },
}

export default nextConfig
