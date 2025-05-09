import { Inject } from 'plutin'

import type IBooksRepository from '@application/repositories/books-repository'
import Book from '@domain/book'

import type { CreateBookInput, CreateBookOutput } from './create-book-dto'

export default class CreateBookUseCase {
  constructor(
    @Inject('BooksRepository') private booksRepository: IBooksRepository
  ) {}

  async execute(input: CreateBookInput): Promise<CreateBookOutput> {
    const book = Book.create({
      authorId: input.authorId,
      title: input.title,
      content: input.content,
    })

    await this.booksRepository.create(book)

    return {
      id: book.id.toString(),
    }
  }
}
