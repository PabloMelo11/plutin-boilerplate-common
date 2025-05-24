import { z } from 'zod'
import { baseEnvSchema, logger } from 'plutin'

import 'dotenv/config'

const envSchema = baseEnvSchema
  .merge(
    z.object({
      DATABASE_URL: z.string().url(),
    })
  )
  .catchall(z.any())

const _env = envSchema.safeParse(process.env)

if (_env.success === false) {
  logger.error('Invalid environment variables.', _env.error.format())

  throw new Error('Invalid environment variables.')
}

export const env = _env.data
