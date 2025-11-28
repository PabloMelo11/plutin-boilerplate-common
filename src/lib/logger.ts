import type { z } from 'zod'
import type { baseEnvSchema } from 'plutin'

import { ConsoleLogger } from './console'
import { DiscordLogger } from './discord'
import { PinoOtelLogger } from './pino-logger'

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
      development: this.defineProvider(definitions?.development || 'console'),
      staging: this.defineProvider(definitions?.staging || 'discord'),
      production: this.defineProvider(definitions?.production || 'otel'),
    }

    return definition[env.ENVIRONMENT]
  }

  private static defineProvider(provider: OptionsNotifications) {
    switch (provider) {
      case 'console':
        return ConsoleLogger
      case 'discord':
        return DiscordLogger
      case 'otel':
        return PinoOtelLogger
      default:
        return ConsoleLogger
    }
  }
}
