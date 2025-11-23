import { DependencyContainer, NotificationFactory } from 'plutin'

import { env } from '@infra/env'

import { Logger } from '../../lib/logger'

DependencyContainer.registerValue('DiscordConfig', {
  url: env.DISCORD_WEBHOOK_URL,
  environment: env.ENVIRONMENT,
})

DependencyContainer.registerValue('SentryConfig', {
  dsn: env.SENTRY_DSN,
  environment: env.ENVIRONMENT,
})

DependencyContainer.register(
  'Logger',
  Logger.define(env, { development: 'discord' }),
  { singleton: true }
)

DependencyContainer.register(
  'IErrorNotifier',
  NotificationFactory.define(env.ENVIRONMENT),
  {
    singleton: true,
  }
)
