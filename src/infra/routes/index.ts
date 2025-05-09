import { DependencyContainer } from 'plutin'

import CreateBookController from '@infra/controllers/create-book/create-book-controller'

import '@infra/container'

export async function registerRoutes(http: any) {
  http.registerRoute(DependencyContainer.resolve(CreateBookController))
}
