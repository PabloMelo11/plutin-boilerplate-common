import { DependencyContainer, IHttp } from 'plutin'

import CreateBookController from '@infra/controllers/create-book/create-book-controller'
import HealthController from '@infra/controllers/health/health-controller'

export async function registerRoutes(http: IHttp) {
  http.registerRoute(DependencyContainer.resolve(HealthController))
  http.registerRoute(DependencyContainer.resolve(CreateBookController))
}
