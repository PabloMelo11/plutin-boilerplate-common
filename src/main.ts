import { DependencyContainer, GlobalErrorHandler } from 'plutin'

import { env } from '@infra/env'
import { registerRoutes } from '@infra/routes'

import { FastifyAdapter } from './lib/fastify-adapter'
import { MetricsManager } from './lib/metric'
import { initializeOtel, shutdownOtel } from './lib/otel'

import '@infra/container'

initializeOtel()

const http = DependencyContainer.resolve(FastifyAdapter)
const metrics = DependencyContainer.resolve(MetricsManager)

async function main() {
  const globalErrorHandler = new GlobalErrorHandler(env)
  globalErrorHandler.register()

  metrics.startSystemMetricsCollection(5000)

  registerRoutes(http)
  http.startServer(env.PORT)
}

async function shutdown() {
  metrics.stopSystemMetricsCollection()
  await shutdownOtel()
}

process.on('SIGTERM', async () => {
  await shutdown()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await shutdown()
  process.exit(0)
})

main()

export { http }
