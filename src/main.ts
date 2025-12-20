import { DependencyContainer, GlobalErrorHandler } from 'plutin'

import { env } from '@infra/env'
import { registerRoutes } from '@infra/routes'

import { FastifyAdapter } from './lib/fastify-adapter'
import { MetricsManager } from './lib/metric'
import { OtelManager } from './lib/otel'

import '@infra/container'

let otelManager: OtelManager | undefined

if (env.OTEL_ENABLE) {
  const otelManager = new OtelManager()
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
  metrics.stopSystemMetricsCollection()
  await otelManager?.shutdown()
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
