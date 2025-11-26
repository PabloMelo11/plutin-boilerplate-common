import { context, trace } from '@opentelemetry/api'
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

    const activeContext = context.active()
    const span = trace.getSpan(activeContext)
    const spanContext = span?.spanContext()

    const traceId = spanContext?.traceId
    const spanId = spanContext?.spanId
    const traceFlags = spanContext?.traceFlags

    const attributes: Record<string, any> = {
      service_name: 'plutin-boilerplate-common',
      service_environment: env.ENVIRONMENT,
    }

    if (data) {
      attributes['data'] = { ...data }
    }

    // if ((span as any).attributes) {
    //   attributes['data'] = {
    //     ...attributes['data'],
    //     ...(span as any).attributes,
    //   }
    // }

    if (error) {
      attributes['error'] = {
        error_type: error.name,
        error_message: error.message,
        error_stack: error.stack,
        error_code: (error as any).code,
      }
    }

    this.otelLogger.emit({
      severityNumber,
      severityText,
      body: msg,
      timestamp: new Date(),
      attributes,
      ...(spanContext && {
        traceId: traceId,
        spanId: spanId,
        traceFlags: traceFlags,
      }),
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
