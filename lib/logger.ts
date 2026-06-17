import pino from 'pino'

// Plain JSON logger (no pretty transport) so it bundles cleanly on the server.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
})
