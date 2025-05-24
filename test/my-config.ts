import { randomUUID } from 'node:crypto'
import type { Environment } from 'vitest/environments'

export default <Environment>{
  name: 'name-here',
  transformMode: 'ssr',

  async setup() {
    if (!process.env.DATABASE_URL) {
      throw new Error('Database URL not defined!')
    }

    process.env.DATABASE_URL?.replace('public', randomUUID())

    // run migrations

    return {
      async teardown() {
        // delete tables
        // delete scheme
      },
    }
  },
}
