import { DependencyContainer, FastifyAdapter } from 'plutin'

import CreateBookController from '@infra/controllers/create-book/create-book-controller'
import { env } from '@infra/env'

import '@infra/container'

const http = new FastifyAdapter(env)

http.registerRoute(DependencyContainer.resolve(CreateBookController))

http.startServer(env.PORT)
