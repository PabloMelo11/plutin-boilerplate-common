import { DependencyContainer } from 'plutin'

import CreateBookUseCase from '@application/use-cases/create-book/create-book-use-case'

DependencyContainer.register('CreateBookUseCase', CreateBookUseCase, {
  singleton: true,
})
