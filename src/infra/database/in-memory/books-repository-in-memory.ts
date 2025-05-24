import type IBooksRepository from '@application/repositories/books-repository'

import type Book from '@domain/book'

export default class BooksRepositoryInMemory implements IBooksRepository {
  books: Book[] = []

  async create(book: Book): Promise<void> {
    this.books.push(book)
  }
}
