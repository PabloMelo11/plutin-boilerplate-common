import { FastifyAdapter } from 'plutin'
import { baseEnvSchema } from 'plutin'

import { registerRoutes } from '../src/infra/routes'

export async function e2e() {
  const http = new FastifyAdapter(baseEnvSchema)

  return {
    server: http.instance.server,

    up: async () => {
      http.instance.ready()
      await registerRoutes(http)
    },

    down: async () => {
      await http.closeServer()
    },
  }
}
