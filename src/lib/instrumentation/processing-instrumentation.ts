import { Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import type { IMetricsManager } from 'src/lib/metric'

import {
  BaseExecutionContext,
  BaseFullInstrumentationStrategy,
  BaseLogsOnlyInstrumentationStrategy,
  copyReflectMetadata,
  ILogBuilder,
  IMetricsRecorder,
  instrumentInstanceMethods,
  ISpanBuilder,
  Metrics,
  OTEL_ENABLED,
  preserveClassName,
  resolveLogger,
  sanitizeArgs,
  Tracer,
  TRACER_NAME,
} from './base-instrumentation-strategy'

type ProcessingExecutionContext = BaseExecutionContext & {
  className: string
}

type InstrumentationOptions = {
  serviceName?: string
}

class ProcessingMetricsRecorder implements IMetricsRecorder {
  constructor(private readonly metrics: IMetricsManager | undefined) {}

  recordSuccess(context: BaseExecutionContext, durationSeconds: number): void {
    if (!this.metrics) {
      return
    }

    this.metrics.recordProcessingDuration({
      operation: context.operation,
      durationSeconds,
    })
  }

  recordError(context: BaseExecutionContext, error: Error): void {
    if (!this.metrics) {
      return
    }

    this.metrics.recordProcessingError({
      operation: context.operation,
      errorType: error.name,
    })
  }
}

class ProcessingSpanBuilder implements ISpanBuilder {
  constructor(private readonly serviceName: string) {}

  createSpan(
    tracer: ReturnType<typeof trace.getTracer>,
    context: BaseExecutionContext
  ): Span | undefined {
    const procContext = context as ProcessingExecutionContext
    const spanName = this.buildSpanName(procContext)

    return tracer.startSpan(spanName, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'service.name': this.serviceName,
        'class.name': procContext.className,
        'operation.name': procContext.operation,
      },
    })
  }

  buildSpanName(context: BaseExecutionContext): string {
    const procContext = context as ProcessingExecutionContext
    return `process.${procContext.className.toLowerCase()}.${procContext.operation}`
  }

  finalizeSpanSuccess(span: Span, durationSeconds: number): void {
    span.setStatus({ code: SpanStatusCode.OK })
    span.setAttribute('processing.duration', durationSeconds)
    span.setAttribute('processing.status', 'success')
    span.end()
  }

  finalizeSpanError(span: Span, durationSeconds: number, error: Error): void {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    })
    span.setAttribute('processing.duration', durationSeconds)
    span.setAttribute('processing.status', 'error')
    span.setAttribute('error', true)
    span.setAttribute('error.message', error.message)
    span.setAttribute('error.type', error.name)
    span.recordException(error)
    span.end()
  }
}

class ProcessingLogBuilder implements ILogBuilder {
  buildStartMessage(context: BaseExecutionContext): string {
    const procContext = context as ProcessingExecutionContext
    return `[${procContext.className}.${procContext.operation}] started`
  }

  buildStartLogData(
    context: BaseExecutionContext,
    args: any[]
  ): Record<string, any> {
    const procContext = context as ProcessingExecutionContext
    return {
      className: procContext.className,
      operation: procContext.operation,
      args: sanitizeArgs(args),
    }
  }

  buildSuccessMessage(context: BaseExecutionContext): string {
    const procContext = context as ProcessingExecutionContext
    return `[${procContext.className}.${procContext.operation}] finished successfully`
  }

  buildSuccessLogData(
    context: BaseExecutionContext,
    durationMs: number
  ): Record<string, any> {
    const procContext = context as ProcessingExecutionContext
    return {
      className: procContext.className,
      operation: procContext.operation,
      durationMs,
      status: 'success',
    }
  }

  buildErrorMessage(context: BaseExecutionContext): string {
    const procContext = context as ProcessingExecutionContext
    return `[${procContext.className}.${procContext.operation}] finished failed`
  }

  buildErrorLogData(
    context: BaseExecutionContext,
    durationMs: number,
    error: Error
  ): Record<string, any> {
    const procContext = context as ProcessingExecutionContext
    return {
      className: procContext.className,
      operation: procContext.operation,
      durationMs,
      status: 'error',
      errorMessage: error.message,
      errorName: error.name,
    }
  }
}

class ProcessingFullInstrumentationStrategy extends BaseFullInstrumentationStrategy {
  constructor(
    tracer: ReturnType<typeof trace.getTracer>,
    metrics: IMetricsManager,
    serviceName: string
  ) {
    super(
      tracer,
      metrics,
      new ProcessingMetricsRecorder(metrics),
      new ProcessingSpanBuilder(serviceName),
      new ProcessingLogBuilder()
    )
  }
}

class ProcessingLogsOnlyInstrumentationStrategy extends BaseLogsOnlyInstrumentationStrategy {
  constructor() {
    super(new ProcessingLogBuilder())
  }
}

class ProcessingInstrumentationStrategyFactory {
  static create(serviceName: string) {
    if (!OTEL_ENABLED) {
      return new ProcessingLogsOnlyInstrumentationStrategy()
    }

    const tracer = Tracer.getTracer()
    const metrics = Metrics.getMetrics()

    return new ProcessingFullInstrumentationStrategy(
      tracer,
      metrics,
      serviceName
    )
  }
}

export function Instrumentation(options?: InstrumentationOptions) {
  return function <T extends { new (...args: any[]): object }>(constructor: T) {
    const className = constructor.name
    const serviceName = options?.serviceName || TRACER_NAME

    class InstrumentedClass extends constructor {
      constructor(...args: any[]) {
        super(...args)

        const logger = resolveLogger()
        const strategy =
          ProcessingInstrumentationStrategyFactory.create(serviceName)

        instrumentInstanceMethods(
          this,
          className,
          logger,
          strategy,
          (operation: string, logger?: any): ProcessingExecutionContext => ({
            className,
            operation,
            logger,
          })
        )
      }
    }

    copyReflectMetadata(constructor, InstrumentedClass)
    preserveClassName(InstrumentedClass, className)

    return InstrumentedClass as T
  }
}
