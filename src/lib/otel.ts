import FastifyOtelInstrumentation from '@fastify/otel'
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { Resource } from '@opentelemetry/resources'
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
} from '@opentelemetry/sdk-logs'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions'

import { env } from '@infra/env'

// Configurar diagnósticos
if (env.ENVIRONMENT === 'development') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
} else {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN)
}

// Resource (metadados do serviço)
const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'plutin-boilerplate-common',
  [ATTR_SERVICE_VERSION]: '1.0.0',
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: env.ENVIRONMENT,
})

// ============= LOGS =============

// Exporter para Logs (OTLP)
const otlpLogExporter = new OTLPLogExporter({
  url: 'http://localhost:14318/v1/logs',
  headers: {},
})

// Console exporter para debug (apenas em dev)
const consoleLogExporter = new ConsoleLogRecordExporter()

// Logger Provider
const loggerProvider = new LoggerProvider({
  resource,
})

// Adicionar processors
if (env.ENVIRONMENT === 'development') {
  // Em dev: envia para OTLP E console
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
  // Em prod: apenas OTLP
  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(otlpLogExporter, {
      maxQueueSize: 1000,
      maxExportBatchSize: 100,
      scheduledDelayMillis: 5000,
    })
  )
}

// Registrar globalmente
logs.setGlobalLoggerProvider(loggerProvider)

// ============= TRACES =============

const traceExporter = new OTLPTraceExporter({
  url: 'http://localhost:14318/v1/traces',
})

// Sample rate diferente por ambiente
const sampler = new TraceIdRatioBasedSampler(
  env.ENVIRONMENT === 'development' ? 1.0 : 0.01 // 100% em dev, 1% em prod
)

// ============= SDK =============

export const sdk = new NodeSDK({
  resource,
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

// ============= FUNÇÕES DE CONTROLE =============

export function initializeOtel() {
  try {
    sdk.start()
    console.log('✅ OpenTelemetry SDK inicializado com sucesso')
  } catch (error) {
    console.error('❌ Erro ao inicializar OpenTelemetry SDK:', error)
    throw error
  }
}

export async function shutdownOtel() {
  console.log('🔄 Desligando OpenTelemetry SDK...')
  try {
    // Força o flush de logs pendentes
    await loggerProvider.forceFlush()
    await loggerProvider.shutdown()
    await sdk.shutdown()
    console.log('✅ OpenTelemetry SDK desligado com sucesso')
  } catch (error) {
    console.error('❌ Erro ao desligar OpenTelemetry SDK:', error)
  }
}

// Export do logger provider para uso direto se necessário
export { loggerProvider }
