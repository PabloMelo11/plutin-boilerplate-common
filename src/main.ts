import { GlobalErrorHandler } from 'plutin'

import { env } from '@infra/env'
import { registerRoutes } from '@infra/routes'

import { FastifyAdapter } from './lib/fastify-adapter'

const http = new FastifyAdapter()

async function main() {
  const globalErrorHandler = new GlobalErrorHandler(env)
  globalErrorHandler.register()
  registerRoutes(http)
  http.startServer(env.PORT)
}

main()

export { http }
