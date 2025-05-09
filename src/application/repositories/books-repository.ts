import type Book from '@domain/book'

export default interface IBooksRepository {
  create(book: Book): Promise<void>
}
