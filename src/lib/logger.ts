import type { z } from 'zod'
import type { baseEnvSchema } from 'plutin'

import { DiscordLogger } from './discord'
import { OtelLogger } from './otel-logger'
import { PinoLogger } from './pino-logger'

type OptionsNotifications = 'console' | 'discord' | 'otel'

type Props = {
  development?: OptionsNotifications
  staging?: OptionsNotifications
  production?: OptionsNotifications
}

export class Logger {
  static define(env: z.infer<typeof baseEnvSchema>, definitions?: Props): any {
    const definition = {
      test: 'console',
      development: this.defineProvider(
        env,
        definitions?.development || 'console'
      ),
      staging: this.defineProvider(env, definitions?.staging || 'discord'),
      production: this.defineProvider(env, definitions?.production || 'otel'),
    }

    return definition[env.ENVIRONMENT]
  }

  private static defineProvider(
    env: z.infer<typeof baseEnvSchema>,
    provider: OptionsNotifications
  ) {
    switch (provider) {
      case 'console':
        return PinoLogger
      case 'discord':
        return DiscordLogger
      case 'otel':
        return env.OTEL_ENABLE === false ? DiscordLogger : OtelLogger
      default:
        return PinoLogger
    }
  }
}
