import { GlobalErrorHandler } from 'plutin'

import { env } from '@infra/env'
import { registerRoutes } from '@infra/routes'

import { FastifyAdapter } from './lib/fastify-adapter'
import { initializeOtel, shutdownOtel } from './lib/otel'

initializeOtel()

const http = new FastifyAdapter()

async function main() {
  const globalErrorHandler = new GlobalErrorHandler(env)
  globalErrorHandler.register()
  registerRoutes(http)
  http.startServer(env.PORT)
}

process.on('SIGTERM', async () => {
  await shutdownOtel()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await shutdownOtel()
  process.exit(0)
})

main()

export { http }
