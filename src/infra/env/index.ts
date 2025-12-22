import { z } from 'zod'
import { baseEnvSchema } from 'plutin'

import 'dotenv/config'

const envSchema = baseEnvSchema
  .merge(
    z.object({
      DATABASE_URL: z.string().url(),
      OTEL_ENABLE: z
        .string()
        .transform((val) => val === 'true')
        .default('false'),
      OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
      OTEL_SERVICE_NAME: z.string().optional(),
      OTEL_SERVICE_VERSION: z.string().optional(),
    })
  )
  .catchall(z.any())

const _env = envSchema.safeParse(process.env)

if (_env.success === false) {
  console.error('Invalid environment variables.', _env.error.format())

  throw new Error('Invalid environment variables.')
}

export const env = _env.data
