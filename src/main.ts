import { FastifyAdapter, GlobalErrorHandler } from 'plutin'

import { env } from '@infra/env'
import { registerRoutes } from '@infra/routes'

const http = new FastifyAdapter(env)

async function main() {
  const globalErrorHandler = new GlobalErrorHandler(env)
  globalErrorHandler.register()
  registerRoutes(http)
  http.startServer(env.PORT)
}

main()

export { http }
