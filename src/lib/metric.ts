import { metrics } from '@opentelemetry/api'
import { cpus } from 'node:os'
import { monitorEventLoopDelay, PerformanceObserver } from 'node:perf_hooks'
import v8 from 'node:v8'

import { env } from '@infra/env'

const OTEL_ENABLED = process.env.OTEL_ENABLE === 'true'

export interface IMetricsManager {
  recordHttpRequest(params: {
    method: string
    route: string
    statusCode: number
    durationSeconds: number
    responseSizeBytes?: number
  }): void

  recordDbQueryError(params: {
    operation: string
    repository: string
    errorMessage: string
  }): void

  recordDbQuery(params: {
    operation: string
    repository: string
    durationSeconds: number
  }): void

  recordDbTransaction(params: {
    operation: string
    repository: string
    durationSeconds: number
  }): void

  recordDbDeadlock(params: {
    operation: string
    repository: string
    errorMessage: string
  }): void

  recordHttpRequestBytes(
    bytes: number,
    attributes: {
      method: string
      route: string
      statusCode: number
    }
  ): void

  recordProcessingDuration(params: {
    operation: string
    durationSeconds: number
  }): void

  recordProcessingError(params: { operation: string; errorType: string }): void

  recordHttpClientRequest(params: {
    method: string
    url: string
    statusCode?: number
    durationSeconds: number
    error?: boolean
    timeout?: boolean
  }): void

  recordValidationError(params: { field?: string; errorType: string }): void

  startSystemMetricsCollection(intervalMs?: number): void

  stopSystemMetricsCollection(): void
}

export class MetricsManager implements IMetricsManager {
  private meter = OTEL_ENABLED
    ? metrics.getMeter(
        process.env.OTEL_SERVICE_NAME || 'plutin-boilerplate-common',
        process.env.OTEL_SERVICE_VERSION || '1.0.0'
      )
    : null

  private httpRequestsTotal = this.meter?.createCounter('http_requests_total', {
    description: 'Total de requisições HTTP',
    unit: '1',
  })

  private httpRequestDuration = this.meter?.createHistogram(
    'http_request_duration_seconds',
    {
      description: 'Duração das requisições HTTP em segundos',
      unit: 's',
    }
  )

  private httpRequestsErrors = this.meter?.createCounter(
    'http_requests_errors_total',
    {
      description: 'Total de erros HTTP (4xx, 5xx)',
      unit: '1',
    }
  )

  private httpRequestsActive = this.meter?.createUpDownCounter(
    'http_requests_active',
    {
      description: 'Número de requisições HTTP ativas',
      unit: '1',
    }
  )

  private httpResponseSize = this.meter?.createHistogram(
    'http_response_size_bytes',
    {
      description: 'Tamanho das respostas HTTP em bytes',
      unit: 'By',
    }
  )

  private dbQueryDuration = this.meter?.createHistogram(
    'db_query_duration_seconds',
    {
      description: 'Duração das queries no banco de dados',
      unit: 's',
    }
  )

  private dbQueryErrors = this.meter?.createCounter('db_query_errors_total', {
    description: 'Total de erros em queries do banco de dados',
    unit: '1',
  })

  private dbTransactionsTotal = this.meter?.createCounter(
    'db_transactions_total',
    {
      description: 'Total de transações no banco de dados',
      unit: '1',
    }
  )

  private dbTransactionDuration = this.meter?.createHistogram(
    'db_transaction_duration_seconds',
    {
      description: 'Duração das transações no banco de dados',
      unit: 's',
    }
  )

  private dbDeadlocksTotal = this.meter?.createCounter('db_deadlocks_total', {
    description: 'Total de deadlocks detectados no banco de dados',
    unit: '1',
  })

  private httpRequestBytesTotal = this.meter?.createCounter(
    'http_request_bytes_total',
    {
      description: 'Total de bytes transferidos em requisições HTTP',
      unit: 'By',
    }
  )

  private processingDuration = this.meter?.createHistogram(
    'processing_duration_seconds',
    {
      description: 'Duração de operações de processamento interno',
      unit: 's',
    }
  )

  private processingErrors = this.meter?.createCounter(
    'processing_errors_total',
    {
      description: 'Total de erros em operações de processamento',
      unit: '1',
    }
  )

  private httpClientRequestsTotal = this.meter?.createCounter(
    'http_client_requests_total',
    {
      description: 'Total de requisições HTTP client realizadas',
      unit: '1',
    }
  )

  private httpClientRequestDuration = this.meter?.createHistogram(
    'http_client_request_duration_seconds',
    {
      description: 'Duração de requisições HTTP client em segundos',
      unit: 's',
    }
  )

  private httpClientErrors = this.meter?.createCounter(
    'http_client_errors_total',
    {
      description: 'Total de erros em requisições HTTP client',
      unit: '1',
    }
  )

  private httpClientTimeouts = this.meter?.createCounter(
    'http_client_timeouts_total',
    {
      description: 'Total de timeouts em requisições HTTP client',
      unit: '1',
    }
  )

  private validationErrors = this.meter?.createCounter(
    'validation_errors_total',
    {
      description: 'Total de erros de validação',
      unit: '1',
    }
  )

  private processCpuSecondsTotal = this.meter?.createCounter(
    'process_cpu_seconds_total',
    {
      description: 'Total CPU time spent in seconds',
      unit: 's',
    }
  )

  private processMemoryBytes = this.meter?.createObservableGauge(
    'process_memory_bytes',
    {
      description: 'Memory usage in bytes',
      unit: 'By',
    }
  )

  private nodejsHeapSizeTotalBytes = this.meter?.createObservableGauge(
    'nodejs_heap_size_total_bytes',
    {
      description: 'Total size of the allocated heap in bytes',
      unit: 'By',
    }
  )

  private nodejsHeapSizeUsedBytes = this.meter?.createObservableGauge(
    'nodejs_heap_size_used_bytes',
    {
      description: 'Used heap size in bytes',
      unit: 'By',
    }
  )

  private nodejsEventloopLagSeconds = this.meter?.createObservableGauge(
    'nodejs_eventloop_lag_seconds',
    {
      description: 'Event loop lag in seconds',
      unit: 's',
    }
  )

  private nodejsEventloopDurationSeconds = this.meter?.createHistogram(
    'nodejs_eventloop_duration_seconds',
    {
      description: 'Event loop duration in seconds',
      unit: 's',
    }
  )

  private nodejsGcDurationSeconds = this.meter?.createHistogram(
    'nodejs_gc_duration_seconds',
    {
      description: 'Garbage collection duration in seconds',
      unit: 's',
    }
  )

  private processOpenFds = this.meter?.createObservableGauge(
    'process_open_fds',
    {
      description: 'Number of open file descriptors',
      unit: '1',
    }
  )

  private processUptimeSeconds = this.meter?.createObservableGauge(
    'process_uptime_seconds',
    {
      description: 'Process uptime in seconds',
      unit: 's',
    }
  )

  private eventLoopMonitor = monitorEventLoopDelay({ resolution: 10 })
  private previousCpuUsage = process.cpuUsage()
  private collectionInterval?: NodeJS.Timeout
  private gcObserver?: PerformanceObserver

  recordHttpRequest(params: {
    method: string
    route: string
    statusCode: number
    durationSeconds: number
    responseSizeBytes?: number
  }) {
    if (!OTEL_ENABLED) {
      return
    }

    const { method, route, statusCode, durationSeconds, responseSizeBytes } =
      params

    const attributes = {
      method,
      route,
      status_code: statusCode.toString(),
      status_class: this.getStatusClass(statusCode),
      environment: env.ENVIRONMENT,
    }

    this.httpRequestsTotal?.add(1, attributes)

    this.httpRequestDuration?.record(durationSeconds, attributes)

    if (statusCode >= 400) {
      this.httpRequestsErrors?.add(1, {
        ...attributes,
        error_type: statusCode >= 500 ? 'server_error' : 'client_error',
      })
    }

    if (responseSizeBytes) {
      this.httpResponseSize?.record(responseSizeBytes, attributes)
    }
  }

  recordDbQueryError(params: {
    operation: string
    repository: string
    errorMessage: string
  }) {
    if (!OTEL_ENABLED) {
      return
    }

    if (!this.isValidDbQueryErrorParams(params)) {
      return
    }

    const { operation, repository, errorMessage } = params

    this.dbQueryErrors?.add(1, {
      operation,
      repository,
      errorMessage,
      environment: env.ENVIRONMENT,
    })
  }

  recordDbQuery(params: {
    operation: string
    repository: string
    durationSeconds: number
  }) {
    if (!OTEL_ENABLED) {
      return
    }

    if (!this.isValidDbQueryParams(params)) {
      return
    }

    const { operation, repository, durationSeconds } = params

    this.dbQueryDuration?.record(durationSeconds, {
      operation,
      repository,
      environment: env.ENVIRONMENT,
    })
  }

  private isValidDbQueryErrorParams(params: {
    operation: string
    repository: string
    errorMessage: string
  }): boolean {
    const { operation, repository, errorMessage } = params

    if (!operation || !repository || !errorMessage) {
      console.warn('[MetricsManager] Invalid db query error params:', params)
      return false
    }

    return true
  }

  private isValidDbQueryParams(params: {
    operation: string
    repository: string
    durationSeconds: number
  }): boolean {
    const { operation, repository, durationSeconds } = params

    if (!operation || !repository) {
      console.warn('[MetricsManager] Invalid db query params:', params)
      return false
    }

    if (isNaN(durationSeconds) || durationSeconds < 0) {
      console.warn('[MetricsManager] Invalid duration:', durationSeconds)
      return false
    }

    return true
  }

  recordDbTransaction(params: {
    operation: string
    repository: string
    durationSeconds: number
  }) {
    if (!OTEL_ENABLED) {
      return
    }

    const { operation, repository, durationSeconds } = params

    this.dbTransactionsTotal?.add(1, {
      operation,
      repository,
      environment: env.ENVIRONMENT,
    })

    this.dbTransactionDuration?.record(durationSeconds, {
      operation,
      repository,
      environment: env.ENVIRONMENT,
    })
  }

  recordDbDeadlock(params: {
    operation: string
    repository: string
    errorMessage: string
  }) {
    if (!OTEL_ENABLED) {
      return
    }

    const { operation, repository, errorMessage } = params

    this.dbDeadlocksTotal?.add(1, {
      operation,
      repository,
      errorMessage,
      environment: env.ENVIRONMENT,
    })
  }

  recordHttpRequestBytes(
    bytes: number,
    attributes: {
      method: string
      route: string
      statusCode: number
    }
  ) {
    if (!OTEL_ENABLED) {
      return
    }

    this.httpRequestBytesTotal?.add(bytes, {
      ...attributes,
      status_code: attributes.statusCode.toString(),
      environment: env.ENVIRONMENT,
    })
  }

  recordProcessingDuration(params: {
    operation: string
    durationSeconds: number
  }) {
    if (!OTEL_ENABLED) {
      return
    }

    const { operation, durationSeconds } = params

    this.processingDuration?.record(durationSeconds, {
      operation,
      environment: env.ENVIRONMENT,
    })
  }

  recordProcessingError(params: { operation: string; errorType: string }) {
    if (!OTEL_ENABLED) {
      return
    }

    const { operation, errorType } = params

    this.processingErrors?.add(1, {
      operation,
      error_type: errorType,
      environment: env.ENVIRONMENT,
    })
  }

  recordHttpClientRequest(params: {
    method: string
    url: string
    statusCode?: number
    durationSeconds: number
    error?: boolean
    timeout?: boolean
  }) {
    if (!OTEL_ENABLED) {
      return
    }

    const { method, url, statusCode, durationSeconds, error, timeout } = params

    const normalizedUrl = this.normalizeUrl(url)
    const attributes = {
      method,
      url: normalizedUrl,
      environment: env.ENVIRONMENT,
      status_code: statusCode?.toString() || 'unknown',
    }

    this.httpClientRequestsTotal?.add(1, attributes)

    this.httpClientRequestDuration?.record(durationSeconds, attributes)

    if (error) {
      this.httpClientErrors?.add(1, {
        ...attributes,
        error_type: timeout ? 'timeout' : 'connection_error',
      })
    }

    if (timeout) {
      this.httpClientTimeouts?.add(1, attributes)
    }
  }

  recordValidationError(params: { field?: string; errorType: string }) {
    if (!OTEL_ENABLED) {
      return
    }

    const { field, errorType } = params

    this.validationErrors?.add(1, {
      field: field || 'unknown',
      error_type: errorType,
      environment: env.ENVIRONMENT,
    })
  }

  startSystemMetricsCollection(intervalMs: number = 5000) {
    if (!OTEL_ENABLED || !this.meter) {
      return
    }

    this.eventLoopMonitor.enable()

    const observables = [
      this.processMemoryBytes,
      this.nodejsHeapSizeTotalBytes,
      this.nodejsHeapSizeUsedBytes,
      this.nodejsEventloopLagSeconds,
      this.processOpenFds,
      this.processUptimeSeconds,
    ].filter((obs): obs is NonNullable<typeof obs> => obs !== undefined)

    this.meter.addBatchObservableCallback((observableResult) => {
      this.collectSystemMetrics(observableResult)
    }, observables)

    this.setupGCObserver()

    this.collectionInterval = setInterval(() => {
      this.collectPeriodicMetrics()
    }, intervalMs)

    this.collectPeriodicMetrics()
  }

  stopSystemMetricsCollection() {
    if (!OTEL_ENABLED || !this.meter) {
      return
    }

    if (this.collectionInterval) {
      clearInterval(this.collectionInterval)
      this.collectionInterval = undefined
    }

    this.eventLoopMonitor.disable()

    if (this.gcObserver) {
      this.gcObserver.disconnect()
      this.gcObserver = undefined
    }
  }

  private collectSystemMetrics(observableResult: any) {
    if (!OTEL_ENABLED) {
      return
    }

    const attributes = {
      environment: env.ENVIRONMENT,
    }

    const memUsage = process.memoryUsage()
    observableResult.observe(this.processMemoryBytes!, memUsage.rss, {
      ...attributes,
      type: 'rss',
    })

    observableResult.observe(this.processMemoryBytes!, memUsage.heapTotal, {
      ...attributes,
      type: 'heap_total',
    })

    observableResult.observe(this.processMemoryBytes!, memUsage.heapUsed, {
      ...attributes,
      type: 'heap_used',
    })
    observableResult.observe(this.processMemoryBytes!, memUsage.external, {
      ...attributes,
      type: 'external',
    })

    const heapStats = v8.getHeapStatistics()

    observableResult.observe(
      this.nodejsHeapSizeTotalBytes!,
      heapStats.total_heap_size,
      attributes
    )

    observableResult.observe(
      this.nodejsHeapSizeUsedBytes!,
      heapStats.used_heap_size,
      attributes
    )

    const lagMs = this.eventLoopMonitor.mean / 1_000_000
    observableResult.observe(
      this.nodejsEventloopLagSeconds!,
      lagMs / 1000,
      attributes
    )

    try {
      const resourceUsage = (process as any).resourceUsage?.()

      if (resourceUsage) {
        observableResult.observe(
          this.processOpenFds!,
          resourceUsage.maxRSS || 0,
          {
            ...attributes,
            type: 'max_rss',
          }
        )
      }
    } catch {
      // noop
    }

    observableResult.observe(
      this.processUptimeSeconds!,
      process.uptime(),
      attributes
    )
  }

  private collectPeriodicMetrics() {
    if (!OTEL_ENABLED) {
      return
    }

    const attributes = {
      environment: env.ENVIRONMENT,
    }

    const currentCpuUsage = process.cpuUsage(this.previousCpuUsage)

    const userCpuSeconds = (currentCpuUsage.user / 1_000_000) * cpus().length

    const systemCpuSeconds =
      (currentCpuUsage.system / 1_000_000) * cpus().length

    this.processCpuSecondsTotal?.add(userCpuSeconds, {
      ...attributes,
      mode: 'user',
    })

    this.processCpuSecondsTotal?.add(systemCpuSeconds, {
      ...attributes,
      mode: 'system',
    })

    this.previousCpuUsage = process.cpuUsage()

    const eventLoopDuration = this.eventLoopMonitor.mean / 1_000_000_000

    if (eventLoopDuration > 0) {
      this.nodejsEventloopDurationSeconds?.record(eventLoopDuration, attributes)
    }
  }

  private setupGCObserver() {
    if (!OTEL_ENABLED) {
      return
    }

    try {
      this.gcObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const gcType = (entry as any).kind || 'unknown'
          const duration = entry.duration / 1000

          this.nodejsGcDurationSeconds?.record(duration, {
            environment: env.ENVIRONMENT,
            kind: this.getGCKindName(gcType),
          })
        }
      })

      this.gcObserver.observe({ entryTypes: ['measure', 'gc'] })
    } catch {
      // noop
    }
  }

  private getGCKindName(kind: number): string {
    const gcTypes: Record<number, string> = {
      1: 'scavenge',
      2: 'mark_sweep_compact',
      4: 'incremental_marking',
      8: 'process_weak_callbacks',
      15: 'all',
    }
    return gcTypes[kind] || `unknown_${kind}`
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
    } catch {
      return url.split('?')[0].split('#')[0]
    }
  }

  private getStatusClass(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return '2xx'
    if (statusCode >= 300 && statusCode < 400) return '3xx'
    if (statusCode >= 400 && statusCode < 500) return '4xx'
    if (statusCode >= 500) return '5xx'
    return '1xx'
  }
}
