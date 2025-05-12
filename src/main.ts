import { FastifyAdapter } from 'plutin'

import { env } from '@infra/env'
import { registerRoutes } from '@infra/routes'

const http = new FastifyAdapter(env)
registerRoutes(http)
http.startServer(env.PORT)

export { http }
