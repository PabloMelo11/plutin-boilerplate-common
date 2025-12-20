import FastifyOtelInstrumentation from '@fastify/otel'
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { Resource } from '@opentelemetry/resources'
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
} from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions'

import { env } from '@infra/env'

const SERVICE_NAME = 'plutin-boilerplate-common'
const SERVICE_VERSION = '1.0.0'
const OTLP_ENDPOINT = 'http://localhost:14318'
const DEVELOPMENT_SAMPLE_RATE = 1.0
const PRODUCTION_SAMPLE_RATE = 0.01

type OtelConfig = {
  serviceName?: string
  serviceVersion?: string
  otlpEndpoint?: string
  developmentSampleRate?: number
  productionSampleRate?: number
}

export class OtelManager {
  private readonly resource: Resource
  private readonly loggerProvider: LoggerProvider
  private readonly sdk: NodeSDK
  private readonly otlpLogExporter: OTLPLogExporter
  private readonly consoleLogExporter: ConsoleLogRecordExporter
  private readonly traceExporter: OTLPTraceExporter
  private readonly metricExporter: OTLPMetricExporter
  private readonly metricReader: PeriodicExportingMetricReader
  private readonly sampler: TraceIdRatioBasedSampler

  constructor(config: OtelConfig = {}) {
    this.configureDiagnostics()
    this.resource = this.createResource(config)
    this.otlpLogExporter = this.createOtlpLogExporter(config)
    this.consoleLogExporter = new ConsoleLogRecordExporter()
    this.loggerProvider = this.createLoggerProvider()
    this.traceExporter = this.createTraceExporter(config)
    this.sampler = this.createSampler(config)
    this.metricExporter = this.createMetricExporter(config)
    this.metricReader = this.createMetricReader()
    this.sdk = this.createSdk()
  }

  private configureDiagnostics(): void {
    if (env.ENVIRONMENT !== 'development') {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN)
    }
  }

  private createResource(config: OtelConfig): Resource {
    return new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName || SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: config.serviceVersion || SERVICE_VERSION,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: env.ENVIRONMENT,
    })
  }

  private createOtlpLogExporter(config: OtelConfig): OTLPLogExporter {
    const endpoint = config.otlpEndpoint || OTLP_ENDPOINT
    return new OTLPLogExporter({
      url: `${endpoint}/v1/logs`,
      headers: {},
    })
  }

  private createLoggerProvider(): LoggerProvider {
    const provider = new LoggerProvider({
      resource: this.resource,
    })

    this.configureLogProcessors(provider)
    logs.setGlobalLoggerProvider(provider)

    return provider
  }

  private configureLogProcessors(provider: LoggerProvider): void {
    if (env.ENVIRONMENT === 'development') {
      provider.addLogRecordProcessor(
        new BatchLogRecordProcessor(this.otlpLogExporter, {
          maxQueueSize: 100,
          maxExportBatchSize: 10,
          scheduledDelayMillis: 1000,
        })
      )
      provider.addLogRecordProcessor(
        new BatchLogRecordProcessor(this.consoleLogExporter)
      )
    } else {
      provider.addLogRecordProcessor(
        new BatchLogRecordProcessor(this.otlpLogExporter, {
          maxQueueSize: 1000,
          maxExportBatchSize: 100,
          scheduledDelayMillis: 5000,
        })
      )
    }
  }

  private createTraceExporter(config: OtelConfig): OTLPTraceExporter {
    const endpoint = config.otlpEndpoint || OTLP_ENDPOINT
    return new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    })
  }

  private createSampler(config: OtelConfig): TraceIdRatioBasedSampler {
    const sampleRate =
      env.ENVIRONMENT === 'development'
        ? config.developmentSampleRate || DEVELOPMENT_SAMPLE_RATE
        : config.productionSampleRate || PRODUCTION_SAMPLE_RATE

    return new TraceIdRatioBasedSampler(sampleRate)
  }

  private createMetricExporter(config: OtelConfig): OTLPMetricExporter {
    const endpoint = config.otlpEndpoint || OTLP_ENDPOINT
    return new OTLPMetricExporter({
      url: `${endpoint}/v1/metrics`,
    })
  }

  private createMetricReader(): PeriodicExportingMetricReader {
    return new PeriodicExportingMetricReader({
      exporter: this.metricExporter,
      exportIntervalMillis: 5000,
      exportTimeoutMillis: 5000,
    })
  }

  private createSdk(): NodeSDK {
    return new NodeSDK({
      resource: this.resource,
      metricReader: this.metricReader,
      traceExporter: this.traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': {
            enabled: false,
          },
        }),
        new HttpInstrumentation(),
        new FastifyOtelInstrumentation({
          registerOnInitialization: true,
        }),
      ],
      sampler: this.sampler,
    })
  }

  initialize(): void {
    try {
      this.sdk.start()
    } catch (error) {
      console.error('❌ Erro ao inicializar OpenTelemetry SDK:', error)
      throw error
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.loggerProvider.forceFlush()
      await this.loggerProvider.shutdown()
      await this.sdk.shutdown()
    } catch (error) {
      console.error('❌ Erro ao desligar OpenTelemetry SDK:', error)
    }
  }

  getLoggerProvider(): LoggerProvider {
    return this.loggerProvider
  }

  getSdk(): NodeSDK {
    return this.sdk
  }
}
