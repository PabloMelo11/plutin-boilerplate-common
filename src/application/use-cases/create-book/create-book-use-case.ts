import { Inject } from 'plutin'

import type IBooksRepository from '@application/repositories/books-repository'
import Book from '@domain/book'

import type { CreateBookInput, CreateBookOutput } from './create-book-dto'

// class ApplicationError extends Error {
//   props: any

//   constructor(message: string) {
//     super(message)
//     this.props = {
//       code: 400,
//       errorCode: 'ERR002',
//       message,
//       occurredAt: new Date(),
//     }
//   }
// }

export default class CreateBookUseCase {
  constructor(
    @Inject('BooksRepository') private booksRepository: IBooksRepository,
    @Inject('Logger') private logger: any
  ) {}

  async execute(input: CreateBookInput): Promise<CreateBookOutput> {
    const book = Book.create({
      authorId: input.authorId,
      title: input.title,
      content: input.content,
    })

    // throw new ApplicationError('Error to insert book in use case')

    await this.booksRepository.create(book)

    this.logger.info({
      msg: 'Book criado sucesso!',
      data: { bookTitle: book.title, correlationId: book.id.toString() },
    })

    this.logger.warn({
      msg: 'Warn ao criar book',
      data: { correlationId: book.id.toString() },
    })

    this.logger.debug({
      msg: 'Debug ao criar book',
      data: { bookTitle: book.title, correlationId: book.id.toString() },
    })

    return {
      id: book.id.toString(),
    }
  }
}
