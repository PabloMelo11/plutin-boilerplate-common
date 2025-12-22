import FastifyOtelInstrumentation from '@fastify/otel'
import { logs } from '@opentelemetry/api-logs'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base'
import { Resource } from '@opentelemetry/resources'
import {
  BatchLogRecordProcessor,
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

export class OtelManager {
  private readonly resource: Resource
  private readonly loggerProvider: LoggerProvider
  private readonly sdk: NodeSDK
  private readonly otlpLogExporter: OTLPLogExporter
  private readonly traceExporter: OTLPTraceExporter
  private readonly metricExporter: OTLPMetricExporter
  private readonly metricReader: PeriodicExportingMetricReader
  private readonly sampler: TraceIdRatioBasedSampler

  constructor(private readonly env: Record<string, any>) {
    this.resource = this.createResource()
    this.otlpLogExporter = this.createOtlpLogExporter()
    this.loggerProvider = this.createLoggerProvider()
    this.traceExporter = this.createTraceExporter()
    this.sampler = this.createSampler()
    this.metricExporter = this.createMetricExporter()
    this.metricReader = this.createMetricReader()
    this.sdk = this.createSdk()
  }

  private createResource(): Resource {
    return new Resource({
      [ATTR_SERVICE_NAME]:
        this.env.OTEL_SERVICE_NAME || 'plutin-boilerplate-common',
      [ATTR_SERVICE_VERSION]: this.env.OTEL_SERVICE_VERSION || '1.0.0',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: this.env.ENVIRONMENT,
    })
  }

  private createOtlpLogExporter(): OTLPLogExporter {
    return new OTLPLogExporter({
      url: `${this.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs`,
      compression: CompressionAlgorithm.GZIP,
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
    provider.addLogRecordProcessor(
      new BatchLogRecordProcessor(this.otlpLogExporter)
    )
  }

  private createTraceExporter(): OTLPTraceExporter {
    return new OTLPTraceExporter({
      url: `${this.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
      compression: CompressionAlgorithm.GZIP,
    })
  }

  private createSampler(): TraceIdRatioBasedSampler {
    const DEVELOPMENT_SAMPLE_RATE = 1.0
    const PRODUCTION_SAMPLE_RATE = 0.01

    const sampleRate =
      this.env.ENVIRONMENT === 'development'
        ? DEVELOPMENT_SAMPLE_RATE
        : PRODUCTION_SAMPLE_RATE

    return new TraceIdRatioBasedSampler(sampleRate)
  }

  private createMetricExporter(): OTLPMetricExporter {
    return new OTLPMetricExporter({
      url: `${this.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
      compression: CompressionAlgorithm.GZIP,
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
