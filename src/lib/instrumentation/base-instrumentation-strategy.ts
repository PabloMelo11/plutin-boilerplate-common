import { Span, trace } from '@opentelemetry/api'
import { ConsoleLogger } from 'src/lib/console'
import type { IMetricsManager } from 'src/lib/metric'
import { DependencyContainer } from 'plutin'

const MILLISECONDS_TO_SECONDS = 1000
const ROUNDING_PRECISION = 100
const MAX_SANITIZED_KEYS = 10

const EXCLUDED_METHODS = new Set([
  'constructor',
  'toString',
  'valueOf',
  'toJSON',
])

const TRACER_NAME = 'plutin-boilerplate-common'
const TRACER_VERSION = '1.0.0'

const OTEL_ENABLED = process.env.OTEL_ENABLE === 'true'

export type Timer = {
  getDurationSeconds(): number
}

export type BaseExecutionContext = {
  operation: string
  logger?: any
}

export interface IMetricsRecorder {
  recordSuccess(context: BaseExecutionContext, durationSeconds: number): void

  recordError(context: BaseExecutionContext, error: Error): void
}

export interface ISpanBuilder {
  createSpan(
    tracer: ReturnType<typeof trace.getTracer>,
    context: BaseExecutionContext
  ): Span | undefined

  buildSpanName(context: BaseExecutionContext): string

  finalizeSpanSuccess(span: Span, durationSeconds: number): void

  finalizeSpanError(span: Span, durationSeconds: number, error: Error): void
}

export interface ILogBuilder {
  buildStartMessage(context: BaseExecutionContext): string

  buildStartLogData(
    context: BaseExecutionContext,
    args: any[]
  ): Record<string, any>

  buildSuccessMessage(context: BaseExecutionContext): string

  buildSuccessLogData(
    context: BaseExecutionContext,
    durationMs: number
  ): Record<string, any>

  buildErrorMessage(context: BaseExecutionContext): string

  buildErrorLogData(
    context: BaseExecutionContext,
    durationMs: number,
    error: Error
  ): Record<string, any>
}

export interface IInstrumentationStrategy {
  instrumentMethod(
    originalMethod: (...args: any[]) => any,
    instance: any,
    context: BaseExecutionContext
  ): (...args: any[]) => any
}

class Tracer {
  private static instance: ReturnType<typeof trace.getTracer> | null = null

  static getTracer(): ReturnType<typeof trace.getTracer> {
    if (!this.instance) {
      this.instance = trace.getTracer(TRACER_NAME, TRACER_VERSION)
    }
    return this.instance
  }
}

class Metrics {
  private static instance: IMetricsManager

  static getMetrics(): IMetricsManager {
    if (!this.instance) {
      this.instance = DependencyContainer.resolveToken('Metrics')
    }
    return this.instance
  }
}

abstract class BaseFullInstrumentationStrategy
  implements IInstrumentationStrategy
{
  constructor(
    protected readonly tracer: ReturnType<typeof trace.getTracer>,
    protected readonly metrics: IMetricsManager,
    protected readonly metricsRecorder: IMetricsRecorder,
    protected readonly spanBuilder: ISpanBuilder,
    protected readonly logBuilder: ILogBuilder
  ) {}

  instrumentMethod(
    originalMethod: (...args: any[]) => any,
    instance: any,
    context: BaseExecutionContext
  ): (...args: any[]) => any {
    return async (...args: any[]) => {
      const timer = createTimer()
      const span = this.spanBuilder.createSpan(this.tracer, context)

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

  private recordSuccess(
    timer: Timer,
    span: Span | undefined,
    context: BaseExecutionContext
  ): void {
    const durationSeconds = timer.getDurationSeconds()
    const durationMs = roundDuration(durationSeconds * MILLISECONDS_TO_SECONDS)

    this.metricsRecorder.recordSuccess(context, durationSeconds)
    this.logSuccess(context, durationMs)

    if (span) {
      this.spanBuilder.finalizeSpanSuccess(span, durationSeconds)
    }
  }

  private logSuccess(context: BaseExecutionContext, durationMs: number): void {
    if (!context.logger) {
      return
    }

    context.logger.info({
      msg: this.logBuilder.buildSuccessMessage(context),
      data: this.logBuilder.buildSuccessLogData(context, durationMs),
    })
  }

  private recordFailure(
    error: unknown,
    timer: Timer,
    span: Span | undefined,
    context: BaseExecutionContext
  ): void {
    const durationSeconds = timer.getDurationSeconds()
    const durationMs = roundDuration(durationSeconds * MILLISECONDS_TO_SECONDS)
    const normalizedError = normalizeError(error)

    this.metricsRecorder.recordError(context, normalizedError)
    this.logError(context, durationMs, normalizedError)

    if (span) {
      this.spanBuilder.finalizeSpanError(span, durationSeconds, normalizedError)
    }
  }

  private logError(
    context: BaseExecutionContext,
    durationMs: number,
    error: Error
  ): void {
    if (!context.logger) {
      return
    }

    context.logger.error({
      msg: this.logBuilder.buildErrorMessage(context),
      data: this.logBuilder.buildErrorLogData(context, durationMs, error),
      error,
    })
  }

  private logOperationStart(context: BaseExecutionContext, args: any[]): void {
    if (!context.logger) {
      return
    }

    context.logger.info({
      msg: this.logBuilder.buildStartMessage(context),
      data: this.logBuilder.buildStartLogData(context, args),
    })
  }
}

abstract class BaseLogsOnlyInstrumentationStrategy
  implements IInstrumentationStrategy
{
  constructor(protected readonly logBuilder: ILogBuilder) {}

  instrumentMethod(
    originalMethod: (...args: any[]) => any,
    instance: any,
    context: BaseExecutionContext
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

  private logOperationStart(context: BaseExecutionContext, args: any[]): void {
    if (!context.logger) {
      return
    }

    context.logger.info({
      msg: this.logBuilder.buildStartMessage(context),
      data: this.logBuilder.buildStartLogData(context, args),
    })
  }

  private logSuccess(timer: Timer, context: BaseExecutionContext): void {
    if (!context.logger) {
      return
    }

    const durationMs = roundDuration(
      timer.getDurationSeconds() * MILLISECONDS_TO_SECONDS
    )

    context.logger.info({
      msg: this.logBuilder.buildSuccessMessage(context),
      data: this.logBuilder.buildSuccessLogData(context, durationMs),
    })
  }

  private logError(
    error: unknown,
    timer: Timer,
    context: BaseExecutionContext
  ): void {
    if (!context.logger) {
      return
    }

    const durationMs = roundDuration(
      timer.getDurationSeconds() * MILLISECONDS_TO_SECONDS
    )
    const normalizedError = normalizeError(error)

    context.logger.error({
      msg: this.logBuilder.buildErrorMessage(context),
      data: this.logBuilder.buildErrorLogData(
        context,
        durationMs,
        normalizedError
      ),
      error: normalizedError,
    })
  }
}

export function createTimer(): Timer {
  const startTime = Date.now()

  return {
    getDurationSeconds(): number {
      return (Date.now() - startTime) / MILLISECONDS_TO_SECONDS
    },
  }
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string') {
    return new Error(error)
  }

  return new Error(String(error))
}

export function roundDuration(durationMs: number): number {
  return Math.round(durationMs * ROUNDING_PRECISION) / ROUNDING_PRECISION
}

export function sanitizeArgs(args: any[]): any[] {
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

export function resolveLogger(): any {
  try {
    return DependencyContainer.resolveToken('Logger')
  } catch {
    return new ConsoleLogger()
  }
}

export function copyReflectMetadata(source: any, target: any): void {
  const injectMetadata = Reflect.getOwnMetadata('inject:params', source)
  if (injectMetadata) {
    Reflect.defineMetadata('inject:params', injectMetadata, target)
  }
}

export function preserveClassName(target: any, className: string): void {
  Object.defineProperty(target, 'name', {
    value: className,
    writable: false,
    configurable: true,
  })
}

export function getInstrumentableMethods(instance: object): string[] {
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

export function instrumentInstanceMethods(
  instance: object,
  contextName: string,
  logger: any,
  strategy: IInstrumentationStrategy,
  createContext: (operation: string, logger?: any) => BaseExecutionContext
): void {
  const methodsToInstrument = getInstrumentableMethods(instance)

  if (methodsToInstrument.length === 0) {
    console.warn(
      `[Instrumentation] No methods found to instrument for ${contextName}. This may indicate a problem with method discovery.`
    )
    return
  }

  for (const methodName of methodsToInstrument) {
    instrumentMethod(instance, methodName, logger, strategy, createContext)
  }
}

function instrumentMethod(
  instance: any,
  methodName: string,
  logger: any,
  strategy: IInstrumentationStrategy,
  createContext: (operation: string, logger?: any) => BaseExecutionContext
): void {
  const originalMethod = instance[methodName]

  if (typeof originalMethod !== 'function') {
    return
  }

  const context = createContext(methodName, logger)

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

export {
  BaseFullInstrumentationStrategy,
  BaseLogsOnlyInstrumentationStrategy,
  Metrics,
  OTEL_ENABLED,
  Tracer,
  TRACER_NAME,
  TRACER_VERSION,
}
