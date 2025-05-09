import { z } from 'zod'

export const createBookSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    authorId: z.string().uuid(),
  }),
  params: z.object({}),
  headers: z.object({}),
  query: z.object({}),
})

export type CreateBookRequest = z.infer<typeof createBookSchema>
