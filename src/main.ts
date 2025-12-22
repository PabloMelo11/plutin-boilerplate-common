import { DependencyContainer, GlobalErrorHandler } from 'plutin'

import { env } from '@infra/env'
import { registerRoutes } from '@infra/routes'

import { FastifyAdapter } from './lib/fastify-adapter'
import { MetricsManager } from './lib/metric'
import { OtelManager } from './lib/otel'

import '@infra/container'

let otelManager: OtelManager | undefined

if (env.OTEL_ENABLE) {
  otelManager = new OtelManager(env)
  otelManager.initialize()
}

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
  try {
    await http.closeServer()
    metrics.stopSystemMetricsCollection()
    await otelManager?.shutdown()
  } catch (error) {
    console.error('Error during shutdown:', error)
  }
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
