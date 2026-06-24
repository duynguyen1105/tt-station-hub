import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // sharp is a native module — keep it external so the serverless function loads
  // it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ['sharp'],
  // Allow the dev server (HMR + /_next assets) to be reached through ngrok tunnels
  // when testing on a phone. Dev-only; has no effect on production builds.
  allowedDevOrigins: ['*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.app', '*.ngrok.io'],
}

export default nextConfig
