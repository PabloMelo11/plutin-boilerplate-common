import { Span, trace } from '@opentelemetry/api'

const OTEL_ENABLED = process.env.OTEL_ENABLE === 'true'

class NullSpan {
  setAttributes(): void {
    return
  }

  setAttribute(): void {
    return
  }

  setStatus(): void {
    return
  }

  recordException(): void {
    return
  }
}

class SpanManager {
  static getActiveSpan(): Span | NullSpan {
    if (!OTEL_ENABLED) {
      return new NullSpan()
    }

    const span = trace.getActiveSpan()
    return span || new NullSpan()
  }

  static isEnabled(): boolean {
    return OTEL_ENABLED
  }
}

export { NullSpan, SpanManager }
