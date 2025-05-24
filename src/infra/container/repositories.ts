import { DependencyContainer } from 'plutin'

import BooksRepositoryInMemory from '@infra/database/in-memory/books-repository-in-memory'

DependencyContainer.register('BooksRepository', BooksRepositoryInMemory, {
  singleton: true,
})
