import cors from '@fastify/cors'
import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import qs from 'qs'
import { type BaseController, type IHttp, Inject } from 'plutin'

import { env } from '@infra/env'

import type { IMetricsManager } from './metric'
import { SpanManager } from './span-manager'
import { validateControllerMetadata } from './validate-controller-metadata'

type AnyObject = Record<string, any>

type Request = {
  body: AnyObject
  params: AnyObject
  headers: AnyObject
  query: AnyObject
}

export class FastifyAdapter implements IHttp {
  readonly instance: FastifyInstance

  constructor(
    @Inject('Logger') private logger: any,
    @Inject('Metrics') private metrics?: IMetricsManager
  ) {
    this.instance = fastify({
      bodyLimit: 10 * 1024 * 1024,
      querystringParser: (str) => qs.parse(str),
      requestIdHeader: 'x-request-id',
      requestIdLogLabel: 'request-id',
      genReqId: (req) =>
        (req.headers['x-request-id'] as string) || randomUUID(),
    })

    this.instance.register(cors)

    this.instance.addHook('onRequest', async (request) => {
      const span = SpanManager.getActiveSpan()

      span.setAttributes({
        httpMethod: request.method,
        httpUrl: request.url,
        httpRoute: request.routeOptions.url || request.url,
        httpHost: request.hostname,
        httpScheme: request.protocol,
        httpUserAgent: request.headers['user-agent'] || 'unknown',
        httpRequestId: request.id,
        httpClientIp: request.ip,
      })

      this.logger.info({
        msg: 'http-in',
        data: {
          requestId: request.id,
          httpUrl: request.url,
          httpMethod: request.method,
          httpHeaders: request?.headers,
          httpParams: request?.params,
          httpQuery: request?.query,
        },
      })
    })

    this.instance.addHook('onResponse', async (request, reply) => {
      const route = this.getNormalizedRoute(request)
      const span = SpanManager.getActiveSpan()
      const responseTime = reply.elapsedTime || 0

      span.setAttributes({
        httpStatusCode: reply.statusCode,
      })

      this.logger.info({
        msg: 'http-out',
        data: {
          requestId: request.id,
          httpRoute: route,
          httpMethod: request.method,
          responseTimeMs: Math.round(responseTime),
          statusCode: reply.statusCode,
        },
      })

      if (this.metrics) {
        const responseSizeBytes = reply.getHeader('content-length')
          ? parseInt(reply.getHeader('content-length') as string, 10)
          : undefined

        this.metrics.recordHttpRequest({
          method: request.method,
          route,
          statusCode: reply.statusCode,
          durationSeconds: responseTime / 1000,
          responseSizeBytes,
        })

        if (responseSizeBytes) {
          this.metrics.recordHttpRequestBytes(responseSizeBytes, {
            method: request.method,
            route,
            statusCode: reply.statusCode,
          })
        }
      }
    })
  }

  registerRoute(controllerClass: BaseController): void {
    const { metadata } = validateControllerMetadata(controllerClass)

    this.instance[metadata.method](
      metadata.path,
      async (request: FastifyRequest, reply: FastifyReply) => {
        const requestData = {
          body: request.body,
          params: request.params,
          headers: request.headers,
          query: request.query,
        } as Request

        const activeSpan = SpanManager.getActiveSpan()

        try {
          activeSpan.setAttributes({
            controllerName: controllerClass.constructor.name,
            controllerMethod: metadata.method,
            controllerPath: metadata.path,
          })

          const output = await controllerClass.execute(requestData)

          activeSpan.setStatus({ code: 1 })
          activeSpan.setAttribute('httpStatusCode', output.code || 200)
          activeSpan.setAttribute(
            'responseCode',
            output.data?.code || 'no-code'
          )

          return reply.status(output.code || 200).send(
            output.data || {
              code: 'B001',
            }
          )
        } catch (err: any) {
          activeSpan.setStatus({
            code: 2,
            message: err.message,
          })

          activeSpan.recordException(err)

          activeSpan.setAttributes({
            error: true,
            errorType: err.name,
            errorMessage: err.message,
          })

          const error = await controllerClass.failure(err, {
            env: env.ENVIRONMENT,
            request: {
              body: requestData.body,
              headers: requestData.headers,
              params: request.params,
              query: requestData.query,
              url: metadata.path,
              method: metadata.method,
            },
          })

          activeSpan.setAttribute('httpStatusCode', error.code || 500)
          activeSpan.setAttribute('responseCode', error.data?.code || 'B002')

          return reply.status(error.code || 500).send(
            error.data || {
              code: 'B002',
            }
          )
        }
      }
    )
  }

  async startServer(port: number): Promise<void> {
    await this.instance.listen({ port })
    this.logger.info({
      msg: `Server listening on port ${port}`,
    })
  }

  async closeServer() {
    this.logger.info({
      msg: 'Server closing...',
    })
    await this.instance.close()
  }

  private getNormalizedRoute(request: FastifyRequest): string {
    return (
      (request as any).routerPath ||
      request.routeOptions?.url ||
      request.url.split('?')[0]
    )
  }
}
