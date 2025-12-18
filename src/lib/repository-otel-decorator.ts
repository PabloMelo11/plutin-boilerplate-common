import { Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { ConsoleLogger } from 'src/lib/console'
import { MetricsManager } from 'src/lib/metric'
import { DependencyContainer } from 'plutin'

const MILLISECONDS_TO_SECONDS = 1000
const ROUNDING_PRECISION = 100
const MAX_SANITIZED_KEYS = 10
const DEFAULT_DB_SYSTEM = 'postgresql'

const EXCLUDED_METHODS = new Set([
  'constructor',
  'toString',
  'valueOf',
  'toJSON',
])

const TRACER_NAME = 'plutin-boilerplate-common'
const TRACER_VERSION = '1.0.0'

const OTEL_ENABLED = process.env.OTEL_ENABLE === 'true'

interface IRepositoryOtelOptions {
  dbSystem?: string
}

interface ITimer {
  getDurationSeconds(): number
}

interface IExecutionContext {
  repositoryName: string
  operation: string
  logger?: any
}

interface IInstrumentationStrategy {
  instrumentMethod(
    originalMethod: (...args: any[]) => any,
    instance: any,
    context: IExecutionContext
  ): (...args: any[]) => any
}

class TracerCache {
  private static instance: ReturnType<typeof trace.getTracer> | null = null

  static getTracer(): ReturnType<typeof trace.getTracer> {
    if (!this.instance) {
      this.instance = trace.getTracer(TRACER_NAME, TRACER_VERSION)
    }
    return this.instance
  }
}

class FullInstrumentationStrategy implements IInstrumentationStrategy {
  constructor(
    private readonly tracer: ReturnType<typeof trace.getTracer>,
    private readonly metrics: MetricsManager | undefined,
    private readonly dbSystem: string
  ) {}

  instrumentMethod(
    originalMethod: (...args: any[]) => any,
    instance: any,
    context: IExecutionContext
  ): (...args: any[]) => any {
    return async (...args: any[]) => {
      const timer = createTimer()
      const span = this.createSpan(context)

      this.logOperationStart(context, args)

      try {
        const result = await originalMethod.call(instance, ...args)
        this.recordSuccess(timer, span, context)
        return result
      } catch (error) {
        this.recordFailure(error, timer, span, context)
        throw error
      }
    }
  }

  private createSpan(context: IExecutionContext): Span {
    const spanName = this.buildSpanName(context)

    return this.tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': this.dbSystem,
        'db.operation': context.operation,
      },
    })
  }

  private buildSpanName(context: IExecutionContext): string {
    return `db.${context.repositoryName.toLowerCase()}.${context.operation}`
  }

  private recordSuccess(
    timer: ITimer,
    span: Span,
    context: IExecutionContext
  ): void {
    const durationSeconds = timer.getDurationSeconds()
    const durationMs = roundDuration(durationSeconds * MILLISECONDS_TO_SECONDS)

    this.recordMetricsSuccess(context, durationSeconds)
    this.logSuccess(context, durationMs)
    this.finalizeSpanSuccess(span, durationSeconds)
  }

  private recordMetricsSuccess(
    context: IExecutionContext,
    durationSeconds: number
  ): void {
    if (!this.metrics) {
      return
    }

    this.metrics.recordDbQuery({
      operation: context.operation,
      repository: context.repositoryName,
      durationSeconds,
    })
  }

  private logSuccess(context: IExecutionContext, durationMs: number): void {
    if (!context.logger) {
      return
    }

    context.logger.info({
      msg: this.buildSuccessMessage(context),
      data: this.buildSuccessLogData(durationMs),
    })
  }

  private buildSuccessMessage(context: IExecutionContext): string {
    return `[${context.repositoryName}.${context.operation}] finished successfully`
  }

  private buildSuccessLogData(durationMs: number): Record<string, any> {
    return {
      durationMs,
      status: 'success',
    }
  }

  private finalizeSpanSuccess(span: Span, durationSeconds: number): void {
    span.setStatus({ code: SpanStatusCode.OK })
    span.setAttribute('db.query.duration', durationSeconds)
    span.setAttribute('db.query.status', 'success')
    span.end()
  }

  private recordFailure(
    error: unknown,
    timer: ITimer,
    span: Span,
    context: IExecutionContext
  ): void {
    const durationSeconds = timer.getDurationSeconds()
    const durationMs = roundDuration(durationSeconds * MILLISECONDS_TO_SECONDS)
    const normalizedError = normalizeError(error)

    this.recordMetricsError(context, normalizedError)
    this.logError(context, durationMs, normalizedError)
    this.finalizeSpanError(span, durationSeconds, normalizedError)
  }

  private recordMetricsError(context: IExecutionContext, error: Error): void {
    if (!this.metrics) {
      return
    }

    this.metrics.recordDbQueryError({
      operation: context.operation,
      repository: context.repositoryName,
      errorMessage: error.message,
    })
  }

  private logError(
    context: IExecutionContext,
    durationMs: number,
    error: Error
  ): void {
    if (!context.logger) {
      return
    }

    context.logger.error({
      msg: this.buildErrorMessage(context),
      data: this.buildErrorLogData(durationMs, error),
      error,
    })
  }

  private buildErrorMessage(context: IExecutionContext): string {
    return `[${context.repositoryName}.${context.operation}] finished failed`
  }

  private buildErrorLogData(
    durationMs: number,
    error: Error
  ): Record<string, any> {
    return {
      durationMs,
      status: 'error',
      errorMessage: error.message,
      errorName: error.name,
    }
  }

  private finalizeSpanError(
    span: Span,
    durationSeconds: number,
    error: Error
  ): void {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    })
    span.setAttribute('db.query.duration', durationSeconds)
    span.setAttribute('db.query.status', 'error')
    span.setAttribute('error', true)
    span.setAttribute('error.message', error.message)
    span.recordException(error)
    span.end()
  }

  private logOperationStart(context: IExecutionContext, args: any[]): void {
    if (!context.logger) {
      return
    }

    context.logger.info({
      msg: this.buildStartMessage(context),
      data: this.buildStartLogData(args),
    })
  }

  private buildStartMessage(context: IExecutionContext): string {
    return `[${context.repositoryName}.${context.operation}] started`
  }

  private buildStartLogData(args: any[]): Record<string, any> {
    return { args: sanitizeArgs(args) }
  }
}

class LogsOnlyInstrumentationStrategy implements IInstrumentationStrategy {
  instrumentMethod(
    originalMethod: (...args: any[]) => any,
    instance: any,
    context: IExecutionContext
  ): (...args: any[]) => any {
    return async (...args: any[]) => {
      const timer = createTimer()

      this.logOperationStart(context, args)

      try {
        const result = await originalMethod.call(instance, ...args)
        this.logSuccess(timer, context)
        return result
      } catch (error) {
        this.logError(error, timer, context)
        throw error
      }
    }
  }

  private logOperationStart(context: IExecutionContext, args: any[]): void {
    if (!context.logger) {
      return
    }

    context.logger.info({
      msg: this.buildStartMessage(context),
      data: this.buildStartLogData(args),
    })
  }

  private buildStartMessage(context: IExecutionContext): string {
    return `[${context.repositoryName}.${context.operation}] started`
  }

  private buildStartLogData(args: any[]): Record<string, any> {
    return {
      args: sanitizeArgs(args),
    }
  }

  private logSuccess(timer: ITimer, context: IExecutionContext): void {
    if (!context.logger) {
      return
    }

    const durationMs = roundDuration(
      timer.getDurationSeconds() * MILLISECONDS_TO_SECONDS
    )

    context.logger.info({
      msg: this.buildSuccessMessage(context),
      data: this.buildSuccessLogData(durationMs),
    })
  }

  private buildSuccessMessage(context: IExecutionContext): string {
    return `[${context.repositoryName}.${context.operation}] finished successfully`
  }

  private buildSuccessLogData(durationMs: number): Record<string, any> {
    return {
      durationMs,
      status: 'success',
    }
  }

  private logError(
    error: unknown,
    timer: ITimer,
    context: IExecutionContext
  ): void {
    if (!context.logger) {
      return
    }

    const durationMs = roundDuration(
      timer.getDurationSeconds() * MILLISECONDS_TO_SECONDS
    )
    const normalizedError = normalizeError(error)

    context.logger.error({
      msg: this.buildErrorMessage(context),
      data: this.buildErrorLogData(durationMs, normalizedError),
      error: normalizedError,
    })
  }

  private buildErrorMessage(context: IExecutionContext): string {
    return `[${context.repositoryName}.${context.operation}] finished failed`
  }

  private buildErrorLogData(
    durationMs: number,
    error: Error
  ): Record<string, any> {
    return {
      durationMs,
      status: 'error',
      errorMessage: error.message,
      errorName: error.name,
    }
  }
}

class InstrumentationStrategyFactory {
  private static cachedMetrics: MetricsManager | undefined | null = null

  static create(dbSystem: string): IInstrumentationStrategy {
    if (!OTEL_ENABLED) {
      return new LogsOnlyInstrumentationStrategy()
    }

    const tracer = TracerCache.getTracer()
    const metrics = this.getMetrics()

    return new FullInstrumentationStrategy(tracer, metrics, dbSystem)
  }

  private static getMetrics(): MetricsManager | undefined {
    if (this.cachedMetrics !== null) {
      return this.cachedMetrics || undefined
    }

    try {
      this.cachedMetrics = DependencyContainer.resolveToken('Metrics')
    } catch {
      this.cachedMetrics = undefined
    }

    return this.cachedMetrics || undefined
  }
}

export function RepositoryInstrumentation(options?: IRepositoryOtelOptions) {
  return function <T extends { new (...args: any[]): object }>(constructor: T) {
    const repositoryName = constructor.name
    const dbSystem = options?.dbSystem || DEFAULT_DB_SYSTEM

    class InstrumentedRepository extends constructor {
      constructor(...args: any[]) {
        super(...args)

        const logger = resolveLogger()
        const strategy = InstrumentationStrategyFactory.create(dbSystem)

        instrumentInstanceMethods(this, repositoryName, logger, strategy)
      }
    }

    copyReflectMetadata(constructor, InstrumentedRepository)
    preserveClassName(InstrumentedRepository, repositoryName)

    return InstrumentedRepository as T
  }
}

function instrumentInstanceMethods(
  instance: object,
  repositoryName: string,
  logger: any,
  strategy: IInstrumentationStrategy
): void {
  const methodsToInstrument = getInstrumentableMethods(instance)

  if (methodsToInstrument.length === 0) {
    console.warn(
      `[RepositoryOtel] No methods found to instrument for ${repositoryName}. This may indicate a problem with method discovery.`
    )
    return
  }

  for (const methodName of methodsToInstrument) {
    instrumentMethod(instance, methodName, repositoryName, logger, strategy)
  }
}

function instrumentMethod(
  instance: any,
  methodName: string,
  repositoryName: string,
  logger: any,
  strategy: IInstrumentationStrategy
): void {
  const originalMethod = instance[methodName]

  if (typeof originalMethod !== 'function') {
    return
  }

  const context: IExecutionContext = {
    repositoryName,
    operation: methodName,
    logger,
  }

  const wrappedMethod = strategy.instrumentMethod(
    originalMethod,
    instance,
    context
  )

  Object.defineProperty(instance, methodName, {
    value: wrappedMethod,
    writable: true,
    configurable: true,
    enumerable: true,
  })
}

function getInstrumentableMethods(instance: object): string[] {
  const methods: string[] = []
  const prototype = Object.getPrototypeOf(instance)
  let current: any = prototype

  while (current && current !== Object.prototype) {
    const propertyNames = Object.getOwnPropertyNames(current)

    for (const name of propertyNames) {
      if (shouldExcludeMethod(name)) {
        continue
      }

      if (isMethod(current, name) && !methods.includes(name)) {
        methods.push(name)
      }
    }

    current = Object.getPrototypeOf(current)
  }

  return methods
}

function shouldExcludeMethod(name: string): boolean {
  return EXCLUDED_METHODS.has(name) || name.startsWith('_')
}

function isMethod(obj: any, name: string): boolean {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(obj, name)
    return descriptor !== undefined && typeof descriptor.value === 'function'
  } catch {
    return false
  }
}

function resolveLogger(): any {
  try {
    return DependencyContainer.resolveToken('Logger')
  } catch {
    return new ConsoleLogger()
  }
}

function copyReflectMetadata(source: any, target: any): void {
  const injectMetadata = Reflect.getOwnMetadata('inject:params', source)
  if (injectMetadata) {
    Reflect.defineMetadata('inject:params', injectMetadata, target)
  }
}

function preserveClassName(target: any, className: string): void {
  Object.defineProperty(target, 'name', {
    value: className,
    writable: false,
    configurable: true,
  })
}

function createTimer(): ITimer {
  const startTime = Date.now()

  return {
    getDurationSeconds(): number {
      return (Date.now() - startTime) / MILLISECONDS_TO_SECONDS
    },
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string') {
    return new Error(error)
  }

  return new Error(String(error))
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * ROUNDING_PRECISION) / ROUNDING_PRECISION
}

function sanitizeArgs(args: any[]): any[] {
  if (args.length === 0) {
    return args
  }

  return args.map(sanitizeArg)
}

function sanitizeArg(arg: any): any {
  if (arg === null || arg === undefined) {
    return arg
  }

  if (typeof arg !== 'object') {
    return arg
  }

  return sanitizeObject(arg)
}

function sanitizeObject(obj: any): any {
  try {
    const keys = Object.keys(obj)

    if (keys.length > MAX_SANITIZED_KEYS) {
      return {
        _truncated: true,
        _keyCount: keys.length,
        _keys: keys.slice(0, MAX_SANITIZED_KEYS),
      }
    }

    return obj
  } catch {
    return { _error: 'Could not serialize argument' }
  }
}
