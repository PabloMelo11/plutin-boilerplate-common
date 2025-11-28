import { logs, SeverityNumber } from '@opentelemetry/api-logs'
import pino from 'pino'

import { env } from '@infra/env'

type LogParams = {
  msg: string
  data?: {
    correlationId?: string
    [key: string]: string | undefined
  }
  error?: Error
}

export class PinoOtelLogger {
  private pinoLogger: pino.Logger
  private otelLogger: ReturnType<typeof logs.getLogger>

  constructor() {
    const pinoConfig: pino.LoggerOptions = {
      level: 'debug',
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() }
        },
      },
      base: {
        service: 'plutin-boilerplate-common',
        environment: env.ENVIRONMENT,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    }

    if (env.ENVIRONMENT === 'development') {
      this.pinoLogger = pino(
        pinoConfig,
        pino.transport({ target: 'pino-pretty' })
      )
    } else {
      this.pinoLogger = pino(pinoConfig)
    }

    this.otelLogger = logs.getLogger('plutin-boilerplate-common', '1.0.0')
  }

  private emitOtelLog(
    severityNumber: SeverityNumber,
    severityText: string,
    params: LogParams
  ) {
    const { msg, data, error } = params

    const attributes: Record<string, any> = {}

    if (data) {
      attributes['data'] = { ...data }
    }

    if (error) {
      attributes['error'] = {
        errorType: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        errorCode: (error as any).code,
      }
    }

    this.otelLogger.emit({
      severityNumber,
      severityText,
      body: msg,
      timestamp: new Date(),
      attributes,
    })
  }

  info(params: LogParams): void {
    this.emitOtelLog(SeverityNumber.INFO, 'INFO', params)
  }

  error(params: LogParams): void {
    this.emitOtelLog(SeverityNumber.ERROR, 'ERROR', params)
  }

  debug(params: LogParams): void {
    this.emitOtelLog(SeverityNumber.DEBUG, 'DEBUG', params)
  }

  fatal(params: LogParams): void {
    this.emitOtelLog(SeverityNumber.FATAL, 'FATAL', params)
  }

  warn(params: LogParams): void {
    this.emitOtelLog(SeverityNumber.WARN, 'WARN', params)
  }
}
