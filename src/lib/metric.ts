import { metrics } from '@opentelemetry/api'
import { cpus } from 'node:os'
import { monitorEventLoopDelay, PerformanceObserver } from 'node:perf_hooks'
import v8 from 'node:v8'

import { env } from '@infra/env'

export class MetricsManager {
  private meter = metrics.getMeter('plutin-boilerplate-common', '1.0.0')

  private httpRequestsTotal = this.meter.createCounter('http_requests_total', {
    description: 'Total de requisições HTTP',
    unit: '1',
  })

  private httpRequestDuration = this.meter.createHistogram(
    'http_request_duration_seconds',
    {
      description: 'Duração das requisições HTTP em segundos',
      unit: 's',
    }
  )

  private httpRequestsErrors = this.meter.createCounter(
    'http_requests_errors_total',
    {
      description: 'Total de erros HTTP (4xx, 5xx)',
      unit: '1',
    }
  )

  private httpRequestsActive = this.meter.createUpDownCounter(
    'http_requests_active',
    {
      description: 'Número de requisições HTTP ativas',
      unit: '1',
    }
  )

  private httpResponseSize = this.meter.createHistogram(
    'http_response_size_bytes',
    {
      description: 'Tamanho das respostas HTTP em bytes',
      unit: 'By',
    }
  )

  private dbQueryDuration = this.meter.createHistogram(
    'db_query_duration_seconds',
    {
      description: 'Duração das queries no banco de dados',
      unit: 's',
    }
  )

  private dbQueryErrors = this.meter.createCounter('db_query_errors_total', {
    description: 'Total de erros em queries do banco de dados',
    unit: '1',
  })

  private httpClientRequestDuration = this.meter.createHistogram(
    'http_client_request_duration_seconds',
    {
      description: 'Duração de requisições HTTP client em segundos',
      unit: 's',
    }
  )

  private httpClientErrors = this.meter.createCounter(
    'http_client_errors_total',
    {
      description: 'Total de erros em requisições HTTP client',
      unit: '1',
    }
  )

  private httpClientTimeouts = this.meter.createCounter(
    'http_client_timeouts_total',
    {
      description: 'Total de timeouts em requisições HTTP client',
      unit: '1',
    }
  )

  private validationErrors = this.meter.createCounter(
    'validation_errors_total',
    {
      description: 'Total de erros de validação',
      unit: '1',
    }
  )

  private processCpuSecondsTotal = this.meter.createCounter(
    'process_cpu_seconds_total',
    {
      description: 'Total CPU time spent in seconds',
      unit: 's',
    }
  )

  private processMemoryBytes = this.meter.createObservableGauge(
    'process_memory_bytes',
    {
      description: 'Memory usage in bytes',
      unit: 'By',
    }
  )

  private nodejsHeapSizeTotalBytes = this.meter.createObservableGauge(
    'nodejs_heap_size_total_bytes',
    {
      description: 'Total size of the allocated heap in bytes',
      unit: 'By',
    }
  )

  private nodejsHeapSizeUsedBytes = this.meter.createObservableGauge(
    'nodejs_heap_size_used_bytes',
    {
      description: 'Used heap size in bytes',
      unit: 'By',
    }
  )

  private nodejsEventloopLagSeconds = this.meter.createObservableGauge(
    'nodejs_eventloop_lag_seconds',
    {
      description: 'Event loop lag in seconds',
      unit: 's',
    }
  )

  private nodejsEventloopDurationSeconds = this.meter.createHistogram(
    'nodejs_eventloop_duration_seconds',
    {
      description: 'Event loop duration in seconds',
      unit: 's',
    }
  )

  private nodejsGcDurationSeconds = this.meter.createHistogram(
    'nodejs_gc_duration_seconds',
    {
      description: 'Garbage collection duration in seconds',
      unit: 's',
    }
  )

  private processOpenFds = this.meter.createObservableGauge(
    'process_open_fds',
    {
      description: 'Number of open file descriptors',
      unit: '1',
    }
  )

  private processUptimeSeconds = this.meter.createObservableGauge(
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
    const { method, route, statusCode, durationSeconds, responseSizeBytes } =
      params

    const attributes = {
      method,
      route,
      status_code: statusCode.toString(),
      status_class: this.getStatusClass(statusCode),
      environment: env.ENVIRONMENT,
    }

    this.httpRequestsTotal.add(1, attributes)

    this.httpRequestDuration.record(durationSeconds, attributes)

    if (statusCode >= 400) {
      this.httpRequestsErrors.add(1, {
        ...attributes,
        error_type: statusCode >= 500 ? 'server_error' : 'client_error',
      })
    }

    if (responseSizeBytes) {
      this.httpResponseSize.record(responseSizeBytes, attributes)
    }
  }

  recordDbQueryError(params: {
    operation: string
    table: string
    errorMessage: string
  }) {
    const { operation, table, errorMessage } = params

    this.dbQueryErrors.add(1, {
      operation,
      table,
      errorMessage: errorMessage,
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
    const { method, url, statusCode, durationSeconds, error, timeout } = params

    const attributes = {
      method,
      url: this.normalizeUrl(url),
      environment: env.ENVIRONMENT,
      status_code: statusCode?.toString(),
    }

    this.httpClientRequestDuration.record(durationSeconds, attributes)

    if (error) {
      this.httpClientErrors.add(1, {
        ...attributes,
        error_type: timeout ? 'timeout' : 'connection_error',
      })
    }

    if (timeout) {
      this.httpClientTimeouts.add(1, attributes)
    }
  }

  recordValidationError(params: { field?: string; errorType: string }) {
    const { field, errorType } = params

    this.validationErrors.add(1, {
      field: field || 'unknown',
      error_type: errorType,
      environment: env.ENVIRONMENT,
    })
  }

  startSystemMetricsCollection(intervalMs: number = 5000) {
    this.eventLoopMonitor.enable()

    this.meter.addBatchObservableCallback(
      (observableResult) => {
        this.collectSystemMetrics(observableResult)
      },
      [
        this.processMemoryBytes,
        this.nodejsHeapSizeTotalBytes,
        this.nodejsHeapSizeUsedBytes,
        this.nodejsEventloopLagSeconds,
        this.processOpenFds,
        this.processUptimeSeconds,
      ]
    )

    this.setupGCObserver()

    this.collectionInterval = setInterval(() => {
      this.collectPeriodicMetrics()
    }, intervalMs)

    this.collectPeriodicMetrics()
  }

  stopSystemMetricsCollection() {
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
    const attributes = {
      environment: env.ENVIRONMENT,
    }

    const memUsage = process.memoryUsage()
    observableResult.observe(this.processMemoryBytes, memUsage.rss, {
      ...attributes,
      type: 'rss',
    })

    observableResult.observe(this.processMemoryBytes, memUsage.heapTotal, {
      ...attributes,
      type: 'heap_total',
    })

    observableResult.observe(this.processMemoryBytes, memUsage.heapUsed, {
      ...attributes,
      type: 'heap_used',
    })
    observableResult.observe(this.processMemoryBytes, memUsage.external, {
      ...attributes,
      type: 'external',
    })

    const heapStats = v8.getHeapStatistics()

    observableResult.observe(
      this.nodejsHeapSizeTotalBytes,
      heapStats.total_heap_size,
      attributes
    )

    observableResult.observe(
      this.nodejsHeapSizeUsedBytes,
      heapStats.used_heap_size,
      attributes
    )

    const lagMs = this.eventLoopMonitor.mean / 1_000_000
    observableResult.observe(
      this.nodejsEventloopLagSeconds,
      lagMs / 1000,
      attributes
    )

    try {
      const resourceUsage = (process as any).resourceUsage?.()

      if (resourceUsage) {
        observableResult.observe(
          this.processOpenFds,
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
      this.processUptimeSeconds,
      process.uptime(),
      attributes
    )
  }

  private collectPeriodicMetrics() {
    const attributes = {
      environment: env.ENVIRONMENT,
    }

    const currentCpuUsage = process.cpuUsage(this.previousCpuUsage)

    const userCpuSeconds = (currentCpuUsage.user / 1_000_000) * cpus().length

    const systemCpuSeconds =
      (currentCpuUsage.system / 1_000_000) * cpus().length

    this.processCpuSecondsTotal.add(userCpuSeconds, {
      ...attributes,
      mode: 'user',
    })

    this.processCpuSecondsTotal.add(systemCpuSeconds, {
      ...attributes,
      mode: 'system',
    })

    this.previousCpuUsage = process.cpuUsage()

    const eventLoopDuration = this.eventLoopMonitor.mean / 1_000_000_000

    if (eventLoopDuration > 0) {
      this.nodejsEventloopDurationSeconds.record(eventLoopDuration, attributes)
    }
  }

  private setupGCObserver() {
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const gcType = (entry as any).kind || 'unknown'
          const duration = entry.duration / 1000

          this.nodejsGcDurationSeconds.record(duration, {
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
