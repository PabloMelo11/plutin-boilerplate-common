import cors from '@fastify/cors'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import qs from 'qs'
import type { BaseController, IHttp } from 'plutin'

import { env } from '@infra/env'

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

  constructor() {
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
      const span = trace.getActiveSpan()
      if (span) {
        span.setAttributes({
          http_method: request.method,
          http_url: request.url,
          http_target: request.routeOptions.url || request.url,
          http_route: request.routeOptions.url || request.url,
          http_host: request.hostname,
          http_scheme: request.protocol,
          http_user_agent: request.headers['user-agent'] || 'unknown',
          http_request_id: request.id,
          http_client_ip: request.ip,
        })

        // this.logger.info({
        //   msg: 'HTTP Request received',
        //   includeHttp: true,
        //   data: {
        //     request_id: request.id,
        //   },
        // })
      }
    })

    this.instance.addHook('onResponse', async (request, reply) => {
      const span = trace.getActiveSpan()
      if (span) {
        const responseTime = reply.elapsedTime || 0

        span.setAttributes({
          'http.status_code': reply.statusCode,
        })

        // this.logger.info({
        //   msg: 'HTTP Response sent',
        //   includeHttp: true,
        //   data: {
        //     request_id: request.id,
        //     response_time_ms: Math.round(responseTime),
        //     status_code: reply.statusCode,
        //   },
        // })
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

        const activeSpan = trace.getActiveSpan()

        try {
          if (activeSpan) {
            activeSpan.setAttributes({
              controller_name: controllerClass.constructor.name,
              controller_method: metadata.method,
              controller_path: metadata.path,
            })
          }

          const output = await controllerClass.execute(requestData)

          if (activeSpan) {
            activeSpan.setStatus({ code: SpanStatusCode.OK })
            activeSpan.setAttribute('http_status_code', output.code || 200)
            activeSpan.setAttribute(
              'response_code',
              output.data?.code || 'success'
            )
          }

          return reply.status(output.code || 200).send(
            output.data || {
              code: 'B001',
            }
          )
        } catch (err: any) {
          if (activeSpan) {
            activeSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message,
            })
            activeSpan.recordException(err)
            activeSpan.setAttributes({
              error: true,
              error_type: err.name,
              error_message: err.message,
            })
          }

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

          if (activeSpan) {
            activeSpan.setAttribute('http_status_code', error.code || 500)
            activeSpan.setAttribute('response_code', error.data?.code || 'B002')
          }

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
    console.log(`🚀 Server listening on port ${port}`)
  }

  async closeServer() {
    await this.instance.close()
  }
}
