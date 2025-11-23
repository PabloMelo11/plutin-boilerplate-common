import { ILogger } from 'plutin'

type LogParams = {
  message: string
  data?: Record<string, any>
  error?: Error | unknown
  correlationId?: string
}

export class ConsoleLogger implements ILogger {
  info(params: LogParams): void {
    console.info(params)
  }

  error(params: LogParams): void {
    console.error(params)
  }

  debug(params: LogParams): void {
    console.debug(params)
  }

  fatal(params: LogParams): void {
    console.error(params)
  }

  warn(params: LogParams): void {
    console.warn(params)
  }
}
