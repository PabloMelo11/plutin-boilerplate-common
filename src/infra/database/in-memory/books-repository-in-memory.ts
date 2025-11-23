import { type ILogger, Inject } from 'plutin'

import type IBooksRepository from '@application/repositories/books-repository'
import type Book from '@domain/book'

export default class BooksRepositoryInMemory implements IBooksRepository {
  books: Book[] = []

  constructor(@Inject('Logger') private logger: ILogger) {}

  async create(book: Book): Promise<void> {
    this.books.push(book)

    this.logger.info({
      message: 'Insert book in database',
      data: { bookId: book.id.toString() },
    })
  }
}
