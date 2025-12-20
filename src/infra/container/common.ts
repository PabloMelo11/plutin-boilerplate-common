import { Logger } from 'src/lib/logger'
import { MetricsManager } from 'src/lib/metric'
import { DependencyContainer, NotificationFactory } from 'plutin'

import { env } from '@infra/env'

DependencyContainer.registerValue('DiscordConfig', {
  url: env.DISCORD_WEBHOOK_URL,
  environment: env.ENVIRONMENT,
})

DependencyContainer.registerValue('SentryConfig', {
  dsn: env.SENTRY_DSN,
  environment: env.ENVIRONMENT,
})

DependencyContainer.register('Logger', Logger.define(env), { singleton: true })

DependencyContainer.register('Metrics', MetricsManager, { singleton: true })

DependencyContainer.register(
  'IErrorNotifier',
  NotificationFactory.define(env.ENVIRONMENT),
  {
    singleton: true,
  }
)
