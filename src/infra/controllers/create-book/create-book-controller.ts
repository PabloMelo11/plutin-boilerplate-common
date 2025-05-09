import {
  BaseController,
  Controller,
  Inject,
  Response,
  zodValidator,
} from 'plutin'

import type CreateBookUseCase from '@application/use-cases/create-book/create-book-use-case'

import { type CreateBookRequest, createBookSchema } from './create-book-schema'

@Controller({
  method: 'post',
  path: 'books',
  middlewares: [zodValidator(createBookSchema)],
})
export default class CreateBookController extends BaseController {
  constructor(@Inject('CreateBookUseCase') private useCase: CreateBookUseCase) {
    super()
  }

  async handle(request: CreateBookRequest): Promise<Response> {
    const response = await this.useCase.execute({
      authorId: request.body.authorId,
      content: request.body.content,
      title: request.body.title,
    })

    return this.success(response)
  }
}
