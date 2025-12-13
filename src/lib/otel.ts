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

if (env.ENVIRONMENT !== 'development') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN)
}

const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'plutin-boilerplate-common',
  [ATTR_SERVICE_VERSION]: '1.0.0',
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: env.ENVIRONMENT,
})

const otlpLogExporter = new OTLPLogExporter({
  url: 'http://localhost:14318/v1/logs',
  headers: {},
})

const consoleLogExporter = new ConsoleLogRecordExporter()

const loggerProvider = new LoggerProvider({
  resource,
})

if (env.ENVIRONMENT === 'development') {
  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(otlpLogExporter, {
      maxQueueSize: 100,
      maxExportBatchSize: 10,
      scheduledDelayMillis: 1000,
    })
  )
  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(consoleLogExporter)
  )
} else {
  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(otlpLogExporter, {
      maxQueueSize: 1000,
      maxExportBatchSize: 100,
      scheduledDelayMillis: 5000,
    })
  )
}

logs.setGlobalLoggerProvider(loggerProvider)

const traceExporter = new OTLPTraceExporter({
  url: 'http://localhost:14318/v1/traces',
})

const sampler = new TraceIdRatioBasedSampler(
  env.ENVIRONMENT === 'development' ? 1.0 : 0.01
)

const metricExporter = new OTLPMetricExporter({
  url: 'http://localhost:14318/v1/metrics',
  // compression: CompressionAlgorithm.GZIP,
})

const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 5000,
  exportTimeoutMillis: 5000,
})

export const sdk = new NodeSDK({
  resource,
  metricReader,
  traceExporter,
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
  sampler,
})

export function initializeOtel() {
  try {
    sdk.start()
  } catch (error) {
    console.error('❌ Erro ao inicializar OpenTelemetry SDK:', error)
    throw error
  }
}

export async function shutdownOtel() {
  try {
    await loggerProvider.forceFlush()
    await loggerProvider.shutdown()
    await sdk.shutdown()
  } catch (error) {
    console.error('❌ Erro ao desligar OpenTelemetry SDK:', error)
  }
}

export { loggerProvider }
