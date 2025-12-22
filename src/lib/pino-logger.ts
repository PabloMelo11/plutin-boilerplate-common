import pino from 'pino'

import { env } from '@infra/env'

export type LogParams = {
  msg: string
  data?: {
    correlationId?: string
    [key: string]: string | undefined
  }
  error?: Error
}

export class PinoLogger {
  private pinoLogger: pino.Logger

  constructor() {
    const pinoConfig: pino.LoggerOptions = {
      level: 'debug',
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() }
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    }

    if (env.ENVIRONMENT === 'development') {
      this.pinoLogger = pino(
        pinoConfig,
        pino.transport({ target: 'pino-pretty', options: { sync: false } })
      )
    } else {
      this.pinoLogger = pino(pinoConfig, pino.destination({ sync: false }))
    }
  }

  private formatLogParams(params: LogParams): Record<string, any> {
    const logData: Record<string, any> = {
      msg: params.msg,
    }

    if (params.data) {
      logData.data = params.data
    }

    if (params.error) {
      const error = params.error as Error
      logData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      }
    }

    return logData
  }

  info(params: LogParams): void {
    this.pinoLogger.info(this.formatLogParams(params))
  }

  error(params: LogParams): void {
    this.pinoLogger.error(this.formatLogParams(params))
  }

  debug(params: LogParams): void {
    this.pinoLogger.debug(this.formatLogParams(params))
  }

  fatal(params: LogParams): void {
    this.pinoLogger.fatal(this.formatLogParams(params))
  }

  warn(params: LogParams): void {
    this.pinoLogger.warn(this.formatLogParams(params))
  }
}
