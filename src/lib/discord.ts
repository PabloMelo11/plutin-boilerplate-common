import { MessageBuilder, Webhook } from 'discord-webhook-node'
import { Inject } from 'plutin'

import { env } from '@infra/env'

import { getContext } from './context'

type DiscordOptions = {
  url: string
  env: string
}

type LogParams = {
  message: string
  data?: Record<string, any>
  error?: Error
  correlationId?: string
}

export class DiscordLogger {
  private webhook: Webhook

  constructor(
    @Inject('DiscordConfig') private readonly options: DiscordOptions
  ) {
    this.webhook = new Webhook(this.options.url)
  }

  private async buildStructuredLog(
    embed: MessageBuilder,
    { message, correlationId, data, error }: LogParams
  ) {
    const traceId = getContext().traceId

    embed
      .addField('timestamp:', `\`\`\`${new Date().toISOString()}\`\`\``)
      .addField('traceId:', `\`\`\`${traceId}\`\`\``)
      .addField('Message:', `\`\`\`${message}\`\`\``)
      .addField('Data:', '```json\n' + JSON.stringify(data, null, 2) + '\n```')

    if (correlationId) {
      embed.addField('CorrelationId:', `\`\`\`${correlationId}\`\`\``)
    }

    if (error) {
      const structed = {
        type: error.name,
        message: error.message,
        code: (error as any).code,
        stack: error.stack,
      }

      embed.addField(
        'error:',
        '```json\n' + JSON.stringify(structed, null, 2) + '\n```'
      )
    }

    await this.webhook.send(embed)
  }

  info(params: LogParams): void {
    const embed = new MessageBuilder()
      .setTitle(`ℹ️ Info - ${env.ENVIRONMENT}`)
      .setColor(0x3498db)

    this.buildStructuredLog(embed, params).catch(() =>
      console.log('Error to send log to Discord')
    )
  }

  error(params: LogParams): void {
    const embed = new MessageBuilder()
      .setTitle(`⛔ Error - ${env.ENVIRONMENT}`)
      .setColor(0xe74c3c)

    this.buildStructuredLog(embed, params).catch(() =>
      console.log('Error to send log to Discord')
    )
  }

  debug(params: LogParams): void {
    const embed = new MessageBuilder()
      .setTitle(`🐛 Degub - ${env.ENVIRONMENT}`)
      .setColor(0x9b59b6)

    this.buildStructuredLog(embed, params).catch(() =>
      console.log('Error to send log to Discord')
    )
  }

  fatal(params: LogParams): void {
    const embed = new MessageBuilder()
      .setTitle(`💀 Fatal - ${env.ENVIRONMENT}`)
      .setColor(0xc0392b)

    this.buildStructuredLog(embed, params).catch(() =>
      console.log('Error to send log to Discord')
    )
  }

  warn(params: LogParams): void {
    const embed = new MessageBuilder()
      .setTitle(`⚠️ Warn - ${env.ENVIRONMENT}`)
      .setColor(0xf1c40f)

    this.buildStructuredLog(embed, params).catch(() =>
      console.log('Error to send log to Discord')
    )
  }
}
