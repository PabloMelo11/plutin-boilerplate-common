type LogParams = {
  msg: string
  data?: Record<string, any>
  error?: Error | unknown
  correlationId?: string
}

export class ConsoleLogger {
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
