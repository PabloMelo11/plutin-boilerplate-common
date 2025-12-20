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
} from './base-instrumentation-strategy'

const DEFAULT_DB_SYSTEM = 'postgresql'

type RepositoryExecutionContext = BaseExecutionContext & {
  repositoryName: string
}

type RepositoryOtelOptions = {
  dbSystem?: string
}

class RepositoryMetricsRecorder implements IMetricsRecorder {
  constructor(private readonly metrics: IMetricsManager) {}

  recordSuccess(context: BaseExecutionContext, durationSeconds: number): void {
    if (!this.metrics) {
      return
    }

    const repoContext = context as RepositoryExecutionContext

    this.metrics.recordDbQuery({
      operation: repoContext.operation,
      repository: repoContext.repositoryName,
      durationSeconds,
    })
  }

  recordError(context: BaseExecutionContext, error: Error): void {
    if (!this.metrics) {
      return
    }

    const repoContext = context as RepositoryExecutionContext

    this.metrics.recordDbQueryError({
      operation: repoContext.operation,
      repository: repoContext.repositoryName,
      errorMessage: error.message,
    })
  }
}

class RepositorySpanBuilder implements ISpanBuilder {
  constructor(private readonly dbSystem: string) {}

  createSpan(
    tracer: ReturnType<typeof trace.getTracer>,
    context: BaseExecutionContext
  ): Span | undefined {
    const repoContext = context as RepositoryExecutionContext
    const spanName = this.buildSpanName(repoContext)

    return tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': this.dbSystem,
        'db.operation': repoContext.operation,
      },
    })
  }

  buildSpanName(context: BaseExecutionContext): string {
    const repoContext = context as RepositoryExecutionContext
    return `db.${repoContext.repositoryName.toLowerCase()}.${repoContext.operation}`
  }

  finalizeSpanSuccess(span: Span, durationSeconds: number): void {
    span.setStatus({ code: SpanStatusCode.OK })
    span.setAttribute('db.query.duration', durationSeconds)
    span.setAttribute('db.query.status', 'success')
    span.end()
  }

  finalizeSpanError(span: Span, durationSeconds: number, error: Error): void {
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
}

class RepositoryLogBuilder implements ILogBuilder {
  buildStartMessage(context: BaseExecutionContext): string {
    const repoContext = context as RepositoryExecutionContext
    return `[${repoContext.repositoryName}.${repoContext.operation}] started`
  }

  buildStartLogData(
    context: BaseExecutionContext,
    args: any[]
  ): Record<string, any> {
    return {
      repository: (context as RepositoryExecutionContext).repositoryName,
      operation: context.operation,
      args: sanitizeArgs(args),
    }
  }

  buildSuccessMessage(context: BaseExecutionContext): string {
    const repoContext = context as RepositoryExecutionContext
    return `[${repoContext.repositoryName}.${repoContext.operation}] finished successfully`
  }

  buildSuccessLogData(
    context: BaseExecutionContext,
    durationMs: number
  ): Record<string, any> {
    return {
      repository: (context as RepositoryExecutionContext).repositoryName,
      operation: context.operation,
      durationMs,
      status: 'success',
    }
  }

  buildErrorMessage(context: BaseExecutionContext): string {
    const repoContext = context as RepositoryExecutionContext
    return `[${repoContext.repositoryName}.${repoContext.operation}] finished failed`
  }

  buildErrorLogData(
    context: BaseExecutionContext,
    durationMs: number,
    error: Error
  ): Record<string, any> {
    return {
      repository: (context as RepositoryExecutionContext).repositoryName,
      operation: context.operation,
      durationMs,
      status: 'error',
      errorMessage: error.message,
      errorName: error.name,
    }
  }
}

class RepositoryFullInstrumentationStrategy extends BaseFullInstrumentationStrategy {
  constructor(
    tracer: ReturnType<typeof trace.getTracer>,
    metrics: IMetricsManager,
    dbSystem: string
  ) {
    super(
      tracer,
      metrics,
      new RepositoryMetricsRecorder(metrics),
      new RepositorySpanBuilder(dbSystem),
      new RepositoryLogBuilder()
    )
  }
}

class RepositoryLogsOnlyInstrumentationStrategy extends BaseLogsOnlyInstrumentationStrategy {
  constructor() {
    super(new RepositoryLogBuilder())
  }
}

class RepositoryInstrumentationStrategyFactory {
  static create(dbSystem: string) {
    if (!OTEL_ENABLED) {
      return new RepositoryLogsOnlyInstrumentationStrategy()
    }

    const tracer = Tracer.getTracer()
    const metrics = Metrics.getMetrics()

    return new RepositoryFullInstrumentationStrategy(tracer, metrics, dbSystem)
  }
}

export function RepositoryInstrumentation(options?: RepositoryOtelOptions) {
  return function <T extends { new (...args: any[]): object }>(constructor: T) {
    const repositoryName = constructor.name
    const dbSystem = options?.dbSystem || DEFAULT_DB_SYSTEM

    class InstrumentedRepository extends constructor {
      constructor(...args: any[]) {
        super(...args)

        const logger = resolveLogger()
        const strategy =
          RepositoryInstrumentationStrategyFactory.create(dbSystem)

        instrumentInstanceMethods(
          this,
          repositoryName,
          logger,
          strategy,
          (operation: string, logger?: any): RepositoryExecutionContext => ({
            repositoryName,
            operation,
            logger,
          })
        )
      }
    }

    copyReflectMetadata(constructor, InstrumentedRepository)
    preserveClassName(InstrumentedRepository, repositoryName)

    return InstrumentedRepository as T
  }
}
