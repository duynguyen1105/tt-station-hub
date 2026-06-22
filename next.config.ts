import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow the dev server (HMR + /_next assets) to be reached through ngrok tunnels
  // when testing on a phone. Dev-only; has no effect on production builds.
  allowedDevOrigins: ['*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.app', '*.ngrok.io'],
}

export default nextConfig
