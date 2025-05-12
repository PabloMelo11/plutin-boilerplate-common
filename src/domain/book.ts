import { AggregateRoot, Optional, Replace, UniqueEntityId } from 'plutin'

type BookProps = {
  title: string
  content: string
  authorId: UniqueEntityId
  bestPage: number | null
}

type CreateBookProps = Optional<
  Replace<BookProps, { authorId: string }>,
  'bestPage'
>

export default class Book extends AggregateRoot<BookProps> {
  get title() {
    return this.props.title
  }

  get content() {
    return this.props.content
  }

  static create(props: CreateBookProps, id?: string) {
    const book = new Book(
      {
        authorId: new UniqueEntityId(props.authorId),
        content: props.content,
        title: props.title,
        bestPage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      new UniqueEntityId(id)
    )

    return book
  }
}
